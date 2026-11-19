import { randomUUID, createHash } from 'node:crypto';
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
  const { admin, ...input } = params;
  const pricing = getPlanPricing(input.planId, input.ciclo);
  const { error } = await admin.rpc('billing_activar_suscripcion', {
    p_datos: { ...input, duracionDias: pricing.duracionDias },
  });
  if (error) throw new AIError('BILLING_DB_ERROR', 'No se pudo confirmar la activación. El pago se conserva para reintentar.', 503);
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

  const savedRegistration = pago.registro_flow_resultado as FlowSubscription | null;

  const { data: currentSub } = await admin
    .from('suscripciones')
    .select('*')
    .eq('empresa_id', pago.empresa_id)
    .maybeSingle();

  if (!savedRegistration && currentSub?.gateway_subscription_id && currentSub.estado !== 'canceled') {
    await ensurePreviousFlowSubscriptionCanceled(flow, currentSub.gateway_subscription_id, pago.empresa_id);
  }

  const locked = savedRegistration || await acquireIdempotencyKey(admin, `flow:register:${createHash('sha256').update(token).digest('hex')}`, 'customer.register', {
    empresa_id: pago.empresa_id,
    commerce_order: pago.commerce_order,
    customer_id: reg.customerId,
  });
  if (!locked) {
    throw new AIError('BILLING_RECONCILIATION_REQUIRED', 'El enrolamiento está pendiente de confirmación. No vuelvas a contratarlo; contacta con soporte para comprobar su estado.', 503);
  }

  const planId = pago.plan_id as PaidPlanId;
  const pricing = getPlanPricing(planId, 'mensual');
  const flowSub = savedRegistration || await flow.createSubscription({
    planId: buildFlowPlanId(planId, pricing.montoCobroCLP),
    customerId: reg.customerId,
  });
  if (!savedRegistration) {
    const {error:snapshotError}=await admin.from('pagos_suscripcion').update({registro_flow_resultado:flowSub}).eq('id',pago.id);
    if(snapshotError)throw new AIError('BILLING_RECONCILIATION_REQUIRED','No se pudo confirmar el enrolamiento. No vuelvas a contratarlo; solicita revisar su estado.',503);
  }

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

  const {error:pendingError}=await admin
    .from('suscripciones')
    .update({
      gateway_customer_id: reg.customerId,
      gateway_subscription_id: flowSub.subscriptionId,
      card_brand: reg.creditCardType || null,
      card_last4: reg.last4CardDigits || null,
      updated_at: new Date().toISOString(),
    })
    .eq('empresa_id', pago.empresa_id);

  if(pendingError)throw new AIError('BILLING_DB_ERROR','No se pudo confirmar el estado de la suscripción. Puedes reintentar.',503);
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

async function ensurePreviousFlowSubscriptionCanceled(
  flow: FlowGateway,
  subscriptionId: string,
  empresaId: string,
): Promise<void> {
  try {
    await flow.cancelSubscription({
      subscriptionId,
      atPeriodEnd: false,
    });
    return;
  } catch {
    if (typeof flow.getSubscription === 'function') {
      try {
        const remote = await flow.getSubscription(subscriptionId);
        // En Flow API v1, status 4 = cancelada; cancel_at_period_end evita cobros futuros.
        if (Number(remote?.status) === 4 || Boolean(remote?.cancel_at_period_end)) {
          return;
        }
      } catch {
        // Sin confirmación remota de cancelación: abortar para evitar doble cobro.
      }
    }
    console.error('flow_previous_subscription_cancel_failed', {
      empresa_id: empresaId,
      code: 'PREVIOUS_SUBSCRIPTION_CANCEL_FAILED',
    });
    throw new AIError(
      'BILLING_PREVIOUS_SUBSCRIPTION_CANCEL_FAILED',
      'No se pudo cancelar la suscripción recurrente anterior en Flow. Reintenta para evitar cobros duplicados.',
      503,
    );
  }
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

  const paidAmount = Number(payment.amount);
  if (payment.status === 2 && (!Number.isSafeInteger(paidAmount) || paidAmount !== target.expectedAmount))
    throw new AIError('BILLING_AMOUNT_MISMATCH', 'El monto informado por la pasarela no coincide.', 422);

  // Si la empresa tenía una suscripción recurrente en Flow y paga modalidad prepago/anual,
  // cancelar primero la suscripción remota para evitar doble cobro mensual.
  if (payment.status === 2 && target.modalidad === 'prepago') {
    const { data: currentSub, error: currentSubErr } = await admin
      .from('suscripciones')
      .select('gateway_subscription_id,estado')
      .eq('empresa_id', target.empresaId)
      .maybeSingle();
    if (currentSubErr) {
      throw new AIError('BILLING_DB_ERROR', 'No se pudo verificar la suscripción previa antes de activar el pago.', 503);
    }
    if (currentSub?.gateway_subscription_id && currentSub.estado !== 'canceled') {
      await ensurePreviousFlowSubscriptionCanceled(flow, currentSub.gateway_subscription_id, target.empresaId);
    }
  }

  const pricing = getPlanPricing(target.planId, target.ciclo);
  const { data, error } = await admin.rpc('billing_aplicar_estado_flow', {
    p_evento: `flow:payment:${payment.flowOrder}:${payment.status}`,
    p_datos: {
      ...target, status: payment.status, amount: paidAmount,
      gatewayPaymentId: String(payment.flowOrder), gatewayToken: token,
      commerceOrder: payment.commerceOrder || generateCommerceOrder(target.empresaId),
      metodoPago: payment.paymentData?.media || 'Flow', duracionDias: pricing.duracionDias,
    },
  });
  if (error || !data?.outcome)
    throw new AIError('BILLING_DB_ERROR', 'No se pudo confirmar el pago. Se reintentará sin duplicar la activación.', 503);
  return { ok: true, status: payment.status, ...data };
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
