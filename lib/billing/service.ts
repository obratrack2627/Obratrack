import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AIError } from '@/lib/ai/errors';
import { getPlanPricing, isPaidPlanId } from '@/lib/plans';
import type {
  BillingCycle,
  BillingModality,
  BillingStatusSummary,
  PaidPlanId,
  PagoSuscripcion,
  SubscriptionPlanId,
  Suscripcion,
  UserRole,
} from '@/types/database';
import {
  isFlowConfigured,
  type FlowGateway,
  type FlowPaymentStatus,
  type FlowSubscription,
} from './flow';

export interface BillingActor {
  id: string;
  empresa_id: string;
  rol: UserRole;
  nombre: string;
  is_dev?: boolean;
  email?: string;
}

export interface CheckoutInput {
  planId: PaidPlanId;
  ciclo: BillingCycle;
  modalidad: BillingModality;
}

export interface CheckoutResult {
  redirectUrl: string;
  commerceOrder: string;
  modalidad: BillingModality;
  montoCLP: number;
}

/** Genera un identificador único de orden comercial compatible con Flow (< 45 caracteres). */
export function generateCommerceOrder(empresaId: string): string {
  const cleanCompany = empresaId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'EMP';
  const suffix = randomUUID().replace(/-/g, '').slice(0, 14).toUpperCase();
  return `OT-${cleanCompany}-${suffix}`;
}

/** Construye el identificador inmutable de plan en Flow incluyendo tarifa vigente. */
export function buildFlowPlanId(planId: PaidPlanId, montoCLP: number): string {
  return `ot_${planId}_m_${Math.round(montoCLP)}`;
}

/** Extrae el plan ObraTrack desde un planId de Flow (`ot_pro_m_12990` / `ot_pro_ia_m_24990`). */
export function parseFlowPlanId(flowPlanId?: string | null): PaidPlanId | null {
  if (!flowPlanId) return null;
  if (flowPlanId.startsWith('ot_pro_ia_m_')) return 'pro_ia';
  if (flowPlanId.startsWith('ot_pro_m_')) return 'pro';
  return null;
}

/** Calcula fecha de término de vigencia sumando la duración del ciclo contratado. */
export function computeNextPeriodEnd(
  nowIso: string,
  duracionDias: number,
  currentPeriodEnd?: string | null,
  extendExisting = false,
): string {
  const baseMs = Date.parse(nowIso);
  const currentMs = extendExisting && currentPeriodEnd ? Date.parse(currentPeriodEnd) : Number.NaN;
  const effectiveStart = Number.isFinite(currentMs) && currentMs > baseMs ? currentMs : baseMs;
  return new Date(effectiveStart + duracionDias * 86_400_000).toISOString();
}

function assertAdminBillingAccess(actor: BillingActor): void {
  if (actor.rol !== 'admin' && actor.is_dev !== true) {
    throw new AIError(
      'BILLING_FORBIDDEN',
      'Solo el administrador de la empresa puede contratar o gestionar planes.',
      403,
    );
  }
}

async function resolveCompanyAndEmail(
  admin: SupabaseClient,
  actor: BillingActor,
): Promise<{
  empresa: { id: string; nombre: string; plan_id: string };
  email: string;
}> {
  const [{ data: empresa, error: compError }, { data: profile }] = await Promise.all([
    admin.from('empresas').select('id,nombre,plan_id').eq('id', actor.empresa_id).maybeSingle(),
    admin.from('usuarios').select('email,nombre').eq('id', actor.id).maybeSingle(),
  ]);

  if (compError || !empresa) {
    throw new AIError('BILLING_COMPANY_NOT_FOUND', 'No se encontró tu empresa en la base de datos.', 404);
  }
  if (empresa.plan_id === 'ilimitado') {
    throw new AIError(
      'PLAN_UNLIMITED',
      'Tu cuenta posee un plan corporativo ilimitado gestionado internamente.',
      409,
    );
  }

  const email = (actor.email || profile?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new AIError(
      'BILLING_EMAIL_REQUIRED',
      'Tu cuenta de administrador necesita un correo válido para generar el cobro.',
      422,
    );
  }

  return { empresa, email };
}

async function acquireIdempotencyKey(
  admin: SupabaseClient,
  eventKey: string,
  eventType: string,
  summary: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await admin.from('billing_webhook_events').insert({
    event_key: eventKey,
    pasarela: 'flow',
    event_type: eventType,
    payload_resumen: summary,
  });

  if (!error) return true;
  if (error.code === '23505') return false;

  console.error('billing_idempotency_error', { eventKey, code: error.code });
  throw new AIError('BILLING_DB_ERROR', 'No se pudo registrar el evento de facturación.', 503);
}

/** Inicia un checkout en Flow (pago único Webpay/débito o enrolamiento de suscripción mensual). */
export async function createBillingCheckout(params: {
  admin: SupabaseClient;
  flow: FlowGateway;
  appUrl: string;
  actor: BillingActor;
  input: CheckoutInput;
}): Promise<CheckoutResult> {
  const { admin, flow, appUrl, actor, input } = params;
  assertAdminBillingAccess(actor);

  if (!isPaidPlanId(input.planId)) {
    throw new AIError('PLAN_INVALID', 'El plan seleccionado no admite cobro comercial.', 422);
  }
  if (input.ciclo !== 'mensual' && input.ciclo !== 'anual') {
    throw new AIError('BILLING_CYCLE_INVALID', 'Ciclo de facturación no válido.', 422);
  }
  if (input.modalidad !== 'prepago' && input.modalidad !== 'recurrente') {
    throw new AIError('BILLING_MODALITY_INVALID', 'Modalidad de pago no válida.', 422);
  }
  if (input.ciclo === 'anual' && input.modalidad === 'recurrente') {
    throw new AIError(
      'BILLING_MODALITY_INVALID',
      'El plan anual (-15%) se paga en una cuota única vía Webpay, débito o crédito.',
      422,
    );
  }

  const { empresa, email } = await resolveCompanyAndEmail(admin, actor);
  const pricing = getPlanPricing(input.planId, input.ciclo);
  const commerceOrder = generateCommerceOrder(empresa.id);

  const { data: existingSub } = await admin
    .from('suscripciones')
    .select('*')
    .eq('empresa_id', empresa.id)
    .maybeSingle();

  if (input.modalidad === 'prepago') {
    const flowOrder = await flow.createPayment({
      commerceOrder,
      subject: `ObraTrack ${pricing.nombre} (${input.ciclo})`,
      amount: pricing.montoCobroCLP,
      email,
      paymentMethod: 9,
      urlConfirmation: `${appUrl}/api/billing/webhook/flow`,
      urlReturn: `${appUrl}/api/billing/return/flow?kind=payment&order=${encodeURIComponent(commerceOrder)}`,
      optional: {
        empresa_id: empresa.id,
        plan_id: input.planId,
        ciclo: input.ciclo,
      },
    });

    const { error: insertErr } = await admin.from('pagos_suscripcion').insert({
      empresa_id: empresa.id,
      suscripcion_id: existingSub?.id ?? null,
      commerce_order: commerceOrder,
      gateway_token: flowOrder.token,
      pasarela: 'flow',
      plan_id: input.planId,
      ciclo: input.ciclo,
      modalidad: 'prepago',
      monto_clp: pricing.montoCobroCLP,
      estado: 'pending',
    });

    if (insertErr) {
      throw new AIError('BILLING_DB_ERROR', 'No se pudo registrar la orden de pago.', 503);
    }

    return {
      redirectUrl: `${flowOrder.url}?token=${encodeURIComponent(flowOrder.token)}`,
      commerceOrder,
      modalidad: 'prepago',
      montoCLP: pricing.montoCobroCLP,
    };
  }

  let customerId = existingSub?.gateway_customer_id || '';
  if (!customerId) {
    const customer = await flow.createCustomer({
      name: (empresa.nombre || actor.nombre || 'Constructora ObraTrack').slice(0, 100),
      email,
      externalId: empresa.id,
    });
    customerId = customer.customerId;
  }

  const flowPlanId = buildFlowPlanId(input.planId, pricing.montoCobroCLP);
  await flow.ensurePlan({
    planId: flowPlanId,
    name: `ObraTrack ${pricing.nombre} Mensual`,
    amountCLP: pricing.montoCobroCLP,
    urlCallback: `${appUrl}/api/billing/webhook/flow`,
    daysUntilDue: 5,
  });

  const { data: savedSub, error: subErr } = existingSub
    ? await admin
        .from('suscripciones')
        .update({
          gateway_customer_id: customerId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingSub.id)
        .select('id')
        .single()
    : await admin
        .from('suscripciones')
        .insert({
          empresa_id: empresa.id,
          plan_id: empresa.plan_id === 'pro' || empresa.plan_id === 'pro_ia' ? empresa.plan_id : 'gratis',
          ciclo: 'mensual',
          modalidad: 'recurrente',
          estado: 'pending',
          pasarela: 'flow',
          gateway_customer_id: customerId,
        })
        .select('id')
        .single();

  if (subErr || !savedSub) {
    throw new AIError('BILLING_DB_ERROR', 'No se pudo preparar la suscripción de la empresa.', 503);
  }

  const register = await flow.registerCustomerCard({
    customerId,
    urlReturn: `${appUrl}/api/billing/return/flow?kind=register&order=${encodeURIComponent(commerceOrder)}`,
  });

  const { error: pagoErr } = await admin.from('pagos_suscripcion').insert({
    empresa_id: empresa.id,
    suscripcion_id: savedSub.id,
    commerce_order: commerceOrder,
    gateway_token: register.token,
    pasarela: 'flow',
    plan_id: input.planId,
    ciclo: 'mensual',
    modalidad: 'recurrente',
    monto_clp: pricing.montoCobroCLP,
    estado: 'pending',
  });

  if (pagoErr) {
    throw new AIError('BILLING_DB_ERROR', 'No se pudo registrar la sesión de enrolamiento.', 503);
  }

  return {
    redirectUrl: `${register.url}?token=${encodeURIComponent(register.token)}`,
    commerceOrder,
    modalidad: 'recurrente',
    montoCLP: pricing.montoCobroCLP,
  };
}

async function activatePaidSubscription(params: {
  admin: SupabaseClient;
  empresaId: string;
  planId: PaidPlanId;
  ciclo: BillingCycle;
  modalidad: BillingModality;
  pagoId?: string | null;
  gatewayPaymentId?: string | null;
  metodoPago?: string | null;
  gatewayCustomerId?: string | null;
  gatewaySubscriptionId?: string | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
  periodStartIso?: string | null;
  periodEndIso?: string | null;
}): Promise<void> {
  const { admin } = params;
  const nowIso = new Date().toISOString();
  const pricing = getPlanPricing(params.planId, params.ciclo);

  const [{ data: empresa }, { data: existingSub }] = await Promise.all([
    admin.from('empresas').select('id,plan_id').eq('id', params.empresaId).maybeSingle(),
    admin.from('suscripciones').select('*').eq('empresa_id', params.empresaId).maybeSingle(),
  ]);

  if (!empresa) {
    throw new AIError('BILLING_COMPANY_NOT_FOUND', 'Empresa asociada al pago no existe.', 404);
  }

  const extendSamePlan =
    existingSub?.estado === 'active' &&
    existingSub.plan_id === params.planId &&
    params.modalidad === 'prepago';
  const periodStart = params.periodStartIso || nowIso;
  const periodEnd =
    params.periodEndIso ||
    computeNextPeriodEnd(
      nowIso,
      pricing.duracionDias,
      existingSub?.current_period_end,
      extendSamePlan,
    );

  const subPayload = {
    empresa_id: params.empresaId,
    plan_id: params.planId,
    ciclo: params.ciclo,
    modalidad: params.modalidad,
    estado: 'active',
    pasarela: 'flow',
    gateway_customer_id: params.gatewayCustomerId ?? existingSub?.gateway_customer_id ?? null,
    gateway_subscription_id:
      params.gatewaySubscriptionId ??
      (params.modalidad === 'prepago' ? null : existingSub?.gateway_subscription_id ?? null),
    card_brand: params.cardBrand ?? existingSub?.card_brand ?? null,
    card_last4: params.cardLast4 ?? existingSub?.card_last4 ?? null,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    cancel_at_period_end: false,
    updated_at: nowIso,
  };

  const { data: savedSub, error: subError } = await admin
    .from('suscripciones')
    .upsert(subPayload, { onConflict: 'empresa_id' })
    .select('id')
    .single();

  if (subError || !savedSub) {
    throw new AIError('BILLING_DB_ERROR', 'No se pudo activar la suscripción.', 503);
  }

  if (params.pagoId) {
    await admin
      .from('pagos_suscripcion')
      .update({
        suscripcion_id: savedSub.id,
        gateway_payment_id: params.gatewayPaymentId ?? null,
        estado: 'paid',
        metodo_pago: params.metodoPago ?? null,
        paid_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', params.pagoId);
  }

  if (empresa.plan_id !== 'ilimitado') {
    const { error: compErr } = await admin
      .from('empresas')
      .update({ plan_id: params.planId, updated_at: nowIso })
      .eq('id', params.empresaId);
    if (compErr) {
      throw new AIError('BILLING_DB_ERROR', 'No se pudo actualizar el plan de la empresa.', 503);
    }
  }
}

function resolveFlowPeriodBounds(sub: FlowSubscription, duracionDias: number): {
  startIso: string;
  endIso: string;
} {
  const nowIso = new Date().toISOString();
  const parsedStart = sub.period_start ? Date.parse(sub.period_start) : Number.NaN;
  const parsedEnd = sub.period_end ? Date.parse(sub.period_end) : Number.NaN;
  return {
    startIso: Number.isFinite(parsedStart) ? new Date(parsedStart).toISOString() : nowIso,
    endIso: Number.isFinite(parsedEnd)
      ? new Date(parsedEnd).toISOString()
      : computeNextPeriodEnd(nowIso, duracionDias),
  };
}

/** Completa el retorno de enrolamiento de tarjeta en Flow y crea la suscripción recurrente. */
export async function handleFlowRegisterReturn(params: {
  admin: SupabaseClient;
  flow: FlowGateway;
  token: string;
  order?: string | null;
}): Promise<{ outcome: 'success' | 'pending' | 'canceled'; order: string }> {
  const { admin, flow, token, order } = params;
  const { data: pago } = await admin
    .from('pagos_suscripcion')
    .select('*')
    .eq('gateway_token', token)
    .maybeSingle();

  if (!pago || (order && pago.commerce_order !== order)) {
    return { outcome: 'canceled', order: order || '' };
  }

  if (pago.estado === 'paid') {
    return { outcome: 'success', order: pago.commerce_order };
  }

  const reg = await flow.getRegisterStatus(token);
  if (Number(reg.status) !== 1 || !reg.customerId) {
    await admin
      .from('pagos_suscripcion')
      .update({ estado: 'canceled', updated_at: new Date().toISOString() })
      .eq('id', pago.id);
    return { outcome: 'canceled', order: pago.commerce_order };
  }

  const locked = await acquireIdempotencyKey(admin, `flow:register:${token}`, 'customer.register', {
    empresa_id: pago.empresa_id,
    commerce_order: pago.commerce_order,
    customer_id: reg.customerId,
  });
  if (!locked) {
    return { outcome: pago.estado === 'paid' ? 'success' : 'pending', order: pago.commerce_order };
  }

  const { data: currentSub } = await admin
    .from('suscripciones')
    .select('*')
    .eq('empresa_id', pago.empresa_id)
    .maybeSingle();

  if (currentSub?.gateway_subscription_id) {
    try {
      await flow.cancelSubscription({
        subscriptionId: currentSub.gateway_subscription_id,
        atPeriodEnd: false,
      });
    } catch (error) {
      console.warn('flow_previous_subscription_cancel_warn', {
        empresa_id: pago.empresa_id,
        message: (error as Error).message,
      });
    }
  }

  const planId = pago.plan_id as PaidPlanId;
  const pricing = getPlanPricing(planId, 'mensual');
  const flowSub = await flow.createSubscription({
    planId: buildFlowPlanId(planId, pricing.montoCobroCLP),
    customerId: reg.customerId,
  });

  const { startIso, endIso } = resolveFlowPeriodBounds(flowSub, pricing.duracionDias);
  const firstInvoice = Array.isArray(flowSub.invoices) ? flowSub.invoices[0] : undefined;
  const immediatelyPaid = firstInvoice ? Number(firstInvoice.status) === 2 : Number(flowSub.status) === 1;

  if (immediatelyPaid) {
    await activatePaidSubscription({
      admin,
      empresaId: pago.empresa_id,
      planId,
      ciclo: 'mensual',
      modalidad: 'recurrente',
      pagoId: pago.id,
      gatewayPaymentId: firstInvoice?.id ? `inv_${firstInvoice.id}` : `sub_${flowSub.subscriptionId}`,
      metodoPago: reg.creditCardType || 'Tarjeta registrada',
      gatewayCustomerId: reg.customerId,
      gatewaySubscriptionId: flowSub.subscriptionId,
      cardBrand: reg.creditCardType || null,
      cardLast4: reg.last4CardDigits || null,
      periodStartIso: startIso,
      periodEndIso: endIso,
    });
    return { outcome: 'success', order: pago.commerce_order };
  }

  await admin
    .from('suscripciones')
    .update({
      gateway_customer_id: reg.customerId,
      gateway_subscription_id: flowSub.subscriptionId,
      card_brand: reg.creditCardType || null,
      card_last4: reg.last4CardDigits || null,
      updated_at: new Date().toISOString(),
    })
    .eq('empresa_id', pago.empresa_id);

  return { outcome: 'pending', order: pago.commerce_order };
}

async function resolvePaymentTarget(
  admin: SupabaseClient,
  flow: FlowGateway,
  token: string,
  payment: FlowPaymentStatus,
): Promise<{
  empresaId: string;
  planId: PaidPlanId;
  ciclo: BillingCycle;
  modalidad: BillingModality;
  expectedAmount: number;
  pagoId: string | null;
  isRenewal: boolean;
} | null> {
  const { data: byToken } = await admin
    .from('pagos_suscripcion')
    .select('*')
    .eq('gateway_token', token)
    .maybeSingle();

  const byOrder =
    byToken ||
    (payment.commerceOrder
      ? (
          await admin
            .from('pagos_suscripcion')
            .select('*')
            .eq('commerce_order', payment.commerceOrder)
            .maybeSingle()
        ).data
      : null);

  if (byOrder) {
    const planId = byOrder.plan_id as PaidPlanId;
    const ciclo = byOrder.ciclo as BillingCycle;
    return {
      empresaId: byOrder.empresa_id,
      planId,
      ciclo,
      modalidad: byOrder.modalidad as BillingModality,
      expectedAmount: Number(byOrder.monto_clp),
      pagoId: byOrder.id,
      isRenewal: false,
    };
  }

  const payerEmail = (payment.payer || '').trim().toLowerCase();
  if (!payerEmail) return null;

  const { data: users } = await admin
    .from('usuarios')
    .select('empresa_id')
    .ilike('email', payerEmail)
    .limit(5);

  const companyIds = (users || []).map((u) => u.empresa_id).filter(Boolean);
  if (companyIds.length !== 1) return null;

  const { data: sub } = await admin
    .from('suscripciones')
    .select('*')
    .eq('empresa_id', companyIds[0])
    .maybeSingle();

  if (!sub || !sub.gateway_subscription_id) return null;

  const remoteSub = await flow.getSubscription(sub.gateway_subscription_id);
  if (remoteSub.subscriptionId !== sub.gateway_subscription_id) return null;

  const resolvedPlanId =
    parseFlowPlanId(remoteSub.planId) || (isPaidPlanId(sub.plan_id) ? sub.plan_id : null);
  if (!resolvedPlanId) return null;

  const pricing = getPlanPricing(resolvedPlanId, 'mensual');
  const { data: pendingInitial } = await admin
    .from('pagos_suscripcion')
    .select('id,plan_id,ciclo,modalidad,monto_clp')
    .eq('empresa_id', sub.empresa_id)
    .eq('plan_id', resolvedPlanId)
    .eq('modalidad', 'recurrente')
    .eq('estado', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    empresaId: sub.empresa_id,
    planId: resolvedPlanId,
    ciclo: 'mensual',
    modalidad: 'recurrente',
    expectedAmount: pendingInitial ? Number(pendingInitial.monto_clp) : pricing.montoCobroCLP,
    pagoId: pendingInitial?.id ?? null,
    isRenewal: !pendingInitial,
  };
}

/** Procesa webhooks/confirmaciones de pago de Flow verificando estado real e idempotencia. */
export async function handleFlowPaymentCallback(params: {
  admin: SupabaseClient;
  flow: FlowGateway;
  token: string;
}): Promise<{ ok: boolean; idempotent?: boolean; status: number; outcome: string }> {
  const { admin, flow, token } = params;
  const payment = await flow.getPaymentStatus(token);
  const target = await resolvePaymentTarget(admin, flow, token, payment);
  if (!target) {
    console.warn('flow_payment_unmatched', {
      flowOrder: payment.flowOrder,
      commerceOrder: payment.commerceOrder,
      status: payment.status,
    });
    return { ok: true, status: payment.status, outcome: 'unmatched' };
  }

  const eventKey = `flow:payment:${payment.flowOrder}:${payment.status}`;
  const locked = await acquireIdempotencyKey(admin, eventKey, 'payment.status', {
    empresa_id: target.empresaId,
    flow_order: payment.flowOrder,
    commerce_order: payment.commerceOrder,
    status: payment.status,
    amount: Number(payment.amount),
  });
  if (!locked) {
    return { ok: true, idempotent: true, status: payment.status, outcome: 'duplicate' };
  }

  const paidAmount = Math.round(Number(payment.amount));
  if (payment.status === 2) {
    if (paidAmount !== Math.round(target.expectedAmount)) {
      console.error('flow_amount_mismatch', {
        empresa_id: target.empresaId,
        expected: target.expectedAmount,
        received: paidAmount,
        flowOrder: payment.flowOrder,
      });
      throw new AIError('BILLING_AMOUNT_MISMATCH', 'El monto informado por la pasarela no coincide.', 422);
    }

    let pagoId = target.pagoId;
    if (!pagoId) {
      const renewalOrder = payment.commerceOrder || generateCommerceOrder(target.empresaId);
      const { data: inserted } = await admin
        .from('pagos_suscripcion')
        .insert({
          empresa_id: target.empresaId,
          commerce_order: renewalOrder,
          gateway_payment_id: String(payment.flowOrder),
          gateway_token: token,
          pasarela: 'flow',
          plan_id: target.planId,
          ciclo: target.ciclo,
          modalidad: target.modalidad,
          monto_clp: paidAmount,
          estado: 'pending',
        })
        .select('id')
        .single();
      pagoId = inserted?.id ?? null;
    }

    await activatePaidSubscription({
      admin,
      empresaId: target.empresaId,
      planId: target.planId,
      ciclo: target.ciclo,
      modalidad: target.modalidad,
      pagoId,
      gatewayPaymentId: String(payment.flowOrder),
      metodoPago: payment.paymentData?.media || 'Flow',
    });

    return { ok: true, status: payment.status, outcome: 'paid' };
  }

  if (payment.status === 3 || payment.status === 4) {
    const nowIso = new Date().toISOString();
    const mappedState = payment.status === 3 ? 'failed' : 'canceled';
    if (target.pagoId) {
      await admin
        .from('pagos_suscripcion')
        .update({
          estado: mappedState,
          gateway_payment_id: String(payment.flowOrder),
          updated_at: nowIso,
        })
        .eq('id', target.pagoId);
    }
    if (target.isRenewal && payment.status === 3) {
      await admin
        .from('suscripciones')
        .update({ estado: 'past_due', updated_at: nowIso })
        .eq('empresa_id', target.empresaId)
        .eq('estado', 'active');
    }
    return { ok: true, status: payment.status, outcome: mappedState };
  }

  return { ok: true, status: payment.status, outcome: 'pending' };
}

/** Cancela la renovación automática al final del período vigente conservando días pagados. */
export async function cancelCompanySubscription(params: {
  admin: SupabaseClient;
  flow: FlowGateway | null;
  actor: BillingActor;
}): Promise<Suscripcion | null> {
  const { admin, flow, actor } = params;
  assertAdminBillingAccess(actor);

  const { data: sub, error } = await admin
    .from('suscripciones')
    .select('*')
    .eq('empresa_id', actor.empresa_id)
    .maybeSingle();

  if (error) {
    throw new AIError('BILLING_DB_ERROR', 'No se pudo consultar la suscripción actual.', 503);
  }
  if (!sub || sub.plan_id === 'gratis') {
    throw new AIError('BILLING_NO_SUBSCRIPTION', 'Tu empresa no tiene una suscripción pagada activa.', 404);
  }

  if (sub.gateway_subscription_id && flow) {
    await flow.cancelSubscription({
      subscriptionId: sub.gateway_subscription_id,
      atPeriodEnd: true,
    });
  }

  const nowIso = new Date().toISOString();
  const nextEstado = sub.current_period_end && Date.parse(sub.current_period_end) > Date.now()
    ? sub.estado
    : 'canceled';

  const { data: updated, error: updateErr } = await admin
    .from('suscripciones')
    .update({
      cancel_at_period_end: true,
      estado: nextEstado,
      updated_at: nowIso,
    })
    .eq('id', sub.id)
    .select('*')
    .single();

  if (updateErr) {
    throw new AIError('BILLING_DB_ERROR', 'No se pudo guardar la cancelación.', 503);
  }

  return updated as Suscripcion;
}

/** Obtiene el estado actual de suscripción y los últimos pagos de la empresa. */
export async function getCompanyBillingStatus(params: {
  admin: SupabaseClient;
  actor: BillingActor;
}): Promise<BillingStatusSummary> {
  const { admin, actor } = params;

  const [{ data: company }, { data: sub }, { data: pagos }] = await Promise.all([
    admin.from('empresas').select('plan_id').eq('id', actor.empresa_id).maybeSingle(),
    admin.from('suscripciones').select('*').eq('empresa_id', actor.empresa_id).maybeSingle(),
    admin
      .from('pagos_suscripcion')
      .select('*')
      .eq('empresa_id', actor.empresa_id)
      .order('created_at', { ascending: false })
      .limit(12),
  ]);

  const rawPlan = company?.plan_id;
  const plan_id: SubscriptionPlanId | 'ilimitado' =
    rawPlan === 'pro' || rawPlan === 'pro_ia' || rawPlan === 'ilimitado' ? rawPlan : 'gratis';

  return {
    plan_id,
    rol: actor.rol,
    can_manage_billing: actor.rol === 'admin' || actor.is_dev === true,
    gateway_configured: isFlowConfigured(),
    suscripcion: (sub as Suscripcion | null) || null,
    pagos: (pagos as PagoSuscripcion[]) || [],
  };
}

/** Expira períodos vencidos de suscripciones canceladas o morosas sin afectar planes ilimitados. */
export async function reconcileExpiredSubscriptions(
  admin: SupabaseClient,
  now = new Date(),
): Promise<{ downgraded: number }> {
  const nowIso = now.toISOString();
  const { data: candidates, error } = await admin
    .from('suscripciones')
    .select('id,empresa_id,plan_id,modalidad,estado,cancel_at_period_end,current_period_end')
    .in('estado', ['active', 'past_due', 'canceled'])
    .lte('current_period_end', nowIso);

  if (error || !candidates?.length) {
    return { downgraded: 0 };
  }

  let downgraded = 0;
  for (const sub of candidates) {
    const shouldExpire =
      sub.estado === 'canceled' ||
      sub.estado === 'past_due' ||
      sub.cancel_at_period_end === true ||
      sub.modalidad === 'prepago';
    if (!shouldExpire) continue;

    const { data: empresa } = await admin
      .from('empresas')
      .select('id,plan_id')
      .eq('id', sub.empresa_id)
      .maybeSingle();

    await admin
      .from('suscripciones')
      .update({
        estado: sub.cancel_at_period_end ? 'canceled' : 'expired',
        plan_id: 'gratis',
        updated_at: nowIso,
      })
      .eq('id', sub.id);

    if (empresa && empresa.plan_id !== 'ilimitado' && empresa.plan_id !== 'gratis') {
      await admin
        .from('empresas')
        .update({ plan_id: 'gratis', updated_at: nowIso })
        .eq('id', empresa.id);
      downgraded += 1;
    }
  }

  return { downgraded };
}
