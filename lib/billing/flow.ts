import { createHmac } from 'node:crypto';
import { serverFetch } from '@/lib/server-fetch';
import { AIError } from '@/lib/ai/errors';

export type FlowEnvironment = 'sandbox' | 'production';

export interface FlowConfig {
  env: FlowEnvironment;
  baseUrl: string;
  apiKey: string;
  secretKey: string;
  appUrl: string;
}

export interface FlowPaymentCreateInput {
  commerceOrder: string;
  subject: string;
  amount: number;
  email: string;
  urlConfirmation: string;
  urlReturn: string;
  paymentMethod?: number;
  optional?: Record<string, string>;
}

export interface FlowPaymentCreateResult {
  url: string;
  token: string;
  flowOrder: number;
}

export interface FlowPaymentStatus {
  flowOrder: number;
  commerceOrder: string;
  requestDate?: string;
  status: number;
  subject?: string;
  currency?: string;
  amount: number | string;
  payer?: string;
  paymentData?: {
    date?: string;
    media?: string;
    conversionDate?: string;
    conversionRate?: number;
    amount?: number;
    currency?: string;
    fee?: number;
    balance?: number;
    transferDate?: string;
  };
  optional?: Record<string, unknown> | string;
  pending_info?: Record<string, unknown>;
}

export interface FlowCustomerCreateResult {
  customerId: string;
  status?: string | number;
  name?: string;
  email?: string;
  externalId?: string;
}

export interface FlowRegisterCardResult {
  url: string;
  token: string;
}

export interface FlowRegisterStatusResult {
  status: string | number;
  customerId: string;
  creditCardType?: string;
  last4CardDigits?: string;
  pay_mode?: string;
}

export interface FlowPlan {
  planId: string;
  name: string;
  currency?: string;
  amount: number;
  interval: number;
  status?: number;
}

export interface FlowSubscriptionInvoice {
  id: number | string;
  status?: number;
  amount?: number;
  paymentLink?: string;
  period_start?: string;
  period_end?: string;
}

export interface FlowSubscription {
  subscriptionId: string;
  planId?: string;
  customerId?: string;
  status: number;
  period_start?: string;
  period_end?: string;
  cancel_at_period_end?: number | boolean;
  invoices?: FlowSubscriptionInvoice[];
}

export interface FlowGateway {
  createPayment(input: FlowPaymentCreateInput): Promise<FlowPaymentCreateResult>;
  getPaymentStatus(token: string): Promise<FlowPaymentStatus>;
  createCustomer(input: {
    name: string;
    email: string;
    externalId: string;
  }): Promise<FlowCustomerCreateResult>;
  registerCustomerCard(input: {
    customerId: string;
    urlReturn: string;
  }): Promise<FlowRegisterCardResult>;
  getRegisterStatus(token: string): Promise<FlowRegisterStatusResult>;
  getPlan(planId: string): Promise<FlowPlan | null>;
  ensurePlan(input: {
    planId: string;
    name: string;
    amountCLP: number;
    urlCallback: string;
    daysUntilDue?: number;
  }): Promise<FlowPlan>;
  createSubscription(input: {
    planId: string;
    customerId: string;
  }): Promise<FlowSubscription>;
  getSubscription(subscriptionId: string): Promise<FlowSubscription>;
  cancelSubscription(input: {
    subscriptionId: string;
    atPeriodEnd: boolean;
  }): Promise<FlowSubscription>;
}

class FlowHttpError extends Error {
  constructor(
    public httpStatus: number,
    public flowCode: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'FlowHttpError';
  }
}

export type FlowParamMap = Record<string, string | number | boolean | undefined | null>;

/**
 * Genera la firma HMAC-SHA256 exigida por la API v1 de Flow.cl:
 * llaves ordenadas lexicográficamente concatenadas como key + value.
 */
export function signFlowParams(params: FlowParamMap, secretKey: string): string {
  const keys = Object.keys(params)
    .filter((key) => key !== 's' && params[key] !== undefined && params[key] !== null)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  let payload = '';
  for (const key of keys) {
    payload += `${key}${String(params[key])}`;
  }
  return createHmac('sha256', secretKey).update(payload, 'utf8').digest('hex');
}

/** Determina la URL base de Flow.cl según entorno configurado. */
export function resolveFlowBaseUrl(env?: string): string {
  return env?.trim().toLowerCase() === 'production'
    ? 'https://www.flow.cl/api'
    : 'https://sandbox.flow.cl/api';
}

/** Indica si las credenciales privadas de Flow están presentes en entorno servidor. */
export function isFlowConfigured(): boolean {
  return Boolean(process.env.FLOW_API_KEY?.trim() && process.env.FLOW_SECRET_KEY?.trim());
}

/** Carga y valida configuración activa de Flow desde variables de entorno del servidor. */
export function getFlowConfig(originFallback?: string): FlowConfig {
  const apiKey = (process.env.FLOW_API_KEY || '').trim();
  const secretKey = (process.env.FLOW_SECRET_KEY || '').trim();
  if (!apiKey || !secretKey) {
    throw new AIError(
      'BILLING_CONFIG',
      'La pasarela de pagos aún no está configurada en este entorno.',
      503,
    );
  }

  const rawEnv = (process.env.FLOW_ENV || 'sandbox').trim().toLowerCase();
  const env: FlowEnvironment = rawEnv === 'production' ? 'production' : 'sandbox';
  const rawOrigin = (process.env.NEXT_PUBLIC_APP_URL || originFallback || '').trim();
  const appUrl = rawOrigin.replace(/\/+$/, '');
  if (!appUrl || (!appUrl.startsWith('https://') && !appUrl.startsWith('http://localhost') && !appUrl.startsWith('http://127.0.0.1'))) {
    throw new AIError(
      'BILLING_APP_URL_INVALID',
      'Falta configurar NEXT_PUBLIC_APP_URL válido para retornar desde la pasarela.',
      503,
    );
  }

  return {
    env,
    baseUrl: resolveFlowBaseUrl(env),
    apiKey,
    secretKey,
    appUrl,
  };
}

function buildSignedSearchParams(params: FlowParamMap, apiKey: string, secretKey: string): URLSearchParams {
  const clean: Record<string, string> = { apiKey };
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && key !== 's') {
      clean[key] = String(value);
    }
  }
  clean.s = signFlowParams(clean, secretKey);

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(clean)) {
    search.set(key, value);
  }
  return search;
}

async function parseFlowJson<T>(response: Response): Promise<T> {
  let body: any = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const flowCode = typeof body?.code === 'number' ? body.code : undefined;
    const msg = typeof body?.message === 'string' ? body.message : `HTTP ${response.status}`;
    throw new FlowHttpError(response.status, flowCode, msg);
  }

  if (!body || typeof body !== 'object') {
    throw new FlowHttpError(response.status, undefined, 'Respuesta JSON vacía de Flow.');
  }
  return body as T;
}

/** Instancia un cliente tipado para operar con la API v1 de Flow.cl. */
export function createFlowGateway(
  config: FlowConfig,
  fetchImpl: typeof fetch = serverFetch,
): FlowGateway {
  async function requestFlow<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    params: FlowParamMap,
  ): Promise<T> {
    const signed = buildSignedSearchParams(params, config.apiKey, config.secretKey);
    const url =
      method === 'GET'
        ? `${config.baseUrl}${endpoint}?${signed.toString()}`
        : `${config.baseUrl}${endpoint}`;

    try {
      const response = await fetchImpl(url, {
        method,
        headers:
          method === 'POST'
            ? { 'Content-Type': 'application/x-www-form-urlencoded' }
            : undefined,
        body: method === 'POST' ? signed.toString() : undefined,
        signal: AbortSignal.timeout(15000),
      });
      return await parseFlowJson<T>(response);
    } catch (error) {
      if (error instanceof FlowHttpError) throw error;
      console.error('flow_network_error', { endpoint, message: (error as Error).message });
      throw new AIError(
        'BILLING_GATEWAY_UNAVAILABLE',
        'No fue posible conectar con la pasarela de pagos. Intenta nuevamente en unos segundos.',
        503,
      );
    }
  }

  async function callOrWrap<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    params: FlowParamMap,
  ): Promise<T> {
    try {
      return await requestFlow<T>(method, endpoint, params);
    } catch (error) {
      if (error instanceof AIError) throw error;
      if (error instanceof FlowHttpError) {
        console.error('flow_api_error', {
          endpoint,
          httpStatus: error.httpStatus,
          flowCode: error.flowCode,
        });
        throw new AIError(
          'BILLING_GATEWAY_ERROR',
          'La pasarela rechazó o no pudo procesar la solicitud en este momento.',
          error.httpStatus >= 400 && error.httpStatus < 500 ? 422 : 502,
        );
      }
      throw error;
    }
  }

  return {
    createPayment(input) {
      return callOrWrap<FlowPaymentCreateResult>('POST', '/payment/create', {
        commerceOrder: input.commerceOrder,
        subject: input.subject,
        currency: 'CLP',
        amount: Math.round(input.amount),
        email: input.email,
        paymentMethod: input.paymentMethod ?? 9,
        urlConfirmation: input.urlConfirmation,
        urlReturn: input.urlReturn,
        optional: input.optional ? JSON.stringify(input.optional) : undefined,
      });
    },

    getPaymentStatus(token) {
      return callOrWrap<FlowPaymentStatus>('GET', '/payment/getStatus', { token });
    },

    createCustomer(input) {
      return callOrWrap<FlowCustomerCreateResult>('POST', '/customer/create', {
        name: input.name,
        email: input.email,
        externalId: input.externalId,
      });
    },

    registerCustomerCard(input) {
      return callOrWrap<FlowRegisterCardResult>('POST', '/customer/register', {
        customerId: input.customerId,
        url_return: input.urlReturn,
      });
    },

    getRegisterStatus(token) {
      return callOrWrap<FlowRegisterStatusResult>('GET', '/customer/getRegisterStatus', { token });
    },

    async getPlan(planId) {
      try {
        return await requestFlow<FlowPlan>('GET', '/plans/get', { planId });
      } catch (error) {
        if (error instanceof FlowHttpError && (error.httpStatus === 400 || error.httpStatus === 404)) {
          return null;
        }
        if (error instanceof AIError) throw error;
        throw new AIError(
          'BILLING_GATEWAY_ERROR',
          'No se pudo verificar el plan en la pasarela.',
          502,
        );
      }
    },

    async ensurePlan(input) {
      const existing = await this.getPlan(input.planId);
      if (existing && Number(existing.amount) === Math.round(input.amountCLP)) {
        return existing;
      }
      return callOrWrap<FlowPlan>('POST', '/plans/create', {
        planId: input.planId,
        name: input.name,
        currency: 'CLP',
        amount: Math.round(input.amountCLP),
        interval: 3, // Mensual
        interval_count: 1,
        days_until_due: input.daysUntilDue ?? 5,
        urlCallback: input.urlCallback,
      });
    },

    createSubscription(input) {
      return callOrWrap<FlowSubscription>('POST', '/subscription/create', {
        planId: input.planId,
        customerId: input.customerId,
      });
    },

    getSubscription(subscriptionId) {
      return callOrWrap<FlowSubscription>('GET', '/subscription/get', { subscriptionId });
    },

    cancelSubscription(input) {
      return callOrWrap<FlowSubscription>('POST', '/subscription/cancel', {
        subscriptionId: input.subscriptionId,
        at_period_end: input.atPeriodEnd ? 1 : 0,
      });
    },
  };
}
