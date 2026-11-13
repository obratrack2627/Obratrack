'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Download,
  Loader2,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import LegalTermsModal from '@/components/LegalTermsModal';
import ModalOverlay from '@/components/ModalOverlay';
import { aiHeaders } from '@/lib/ai/client';
import { dataService } from '@/lib/data-service';
import { exportService } from '@/lib/export-service';
import {
  PLANES_SUSCRIPCION,
  getPlanDetails,
  getPlanPricing,
  isPaidPlanId,
} from '@/lib/plans';
import { formatCLP } from '@/lib/utils';
import type {
  BillingCycle,
  BillingModality,
  BillingStatusSummary,
  PaidPlanId,
  SubscriptionPlanId,
  Usuario,
} from '@/types/database';

function formatFechaCL(iso?: string | null): string {
  if (!iso) return '—';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return '—';
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Santiago',
  }).format(new Date(parsed));
}

function getBillingBannerConfig(statusParam: string | null): {
  tone: 'success' | 'info' | 'error';
  title: string;
  description: string;
} | null {
  switch (statusParam) {
    case 'success':
      return {
        tone: 'success',
        title: '¡Pago confirmado!',
        description: 'Tu suscripción fue acreditada y las funciones del plan ya están activas.',
      };
    case 'pending':
      return {
        tone: 'info',
        title: 'Confirmando transacción con Flow…',
        description:
          'Estamos verificando el comprobante con Webpay o tu banco. El plan se activará automáticamente en unos segundos.',
      };
    case 'canceled':
      return {
        tone: 'info',
        title: 'Proceso de pago cancelado',
        description: 'No se realizó ningún cobro. Puedes intentarlo nuevamente cuando lo desees.',
      };
    case 'failed':
    case 'error':
      return {
        tone: 'error',
        title: 'No se pudo completar el pago',
        description:
          'La transacción fue rechazada o interrumpida. Revisa el medio de pago seleccionado o intenta con Webpay / transferencia.',
      };
    default:
      return null;
  }
}

function formatPaymentStatusLabel(status: string): { label: string; className: string } {
  switch (status) {
    case 'paid':
      return {
        label: 'Pagado',
        className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
      };
    case 'pending':
      return {
        label: 'Pendiente',
        className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
      };
    case 'failed':
      return {
        label: 'Rechazado',
        className: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300',
      };
    case 'canceled':
      return {
        label: 'Cancelado',
        className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
      };
    default:
      return {
        label: status,
        className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
      };
  }
}

export default function PlanesPage() {
  const [plan, setPlan] = useState<SubscriptionPlanId>('gratis');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('mensual');
  const [activeUser, setActiveUser] = useState<Usuario | null>(null);
  const [usage, setUsage] = useState({
    obrasActivas: 0,
    obrasTotales: 0,
    integrantesEquipo: 0,
  });
  const [billingStatus, setBillingStatus] = useState<BillingStatusSummary | null>(null);
  const [loadingBilling, setLoadingBilling] = useState(true);
  const [submittingPlan, setSubmittingPlan] = useState<PaidPlanId | null>(null);
  const [cancelingSubscription, setCancelingSubscription] = useState(false);
  const [checkoutChoicePlan, setCheckoutChoicePlan] = useState<PaidPlanId | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [returnBanner, setReturnBanner] = useState<ReturnType<typeof getBillingBannerConfig>>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [legal, setLegal] = useState<'terminos' | 'privacidad' | 'ciberseguridad' | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const refreshLocalState = useCallback(() => {
    setPlan(dataService.getActivePlan());
    setActiveUser(dataService.getActiveUser());
    const projs = dataService.getProyectos();
    setUsage({
      obrasActivas: projs.filter((p) => p.estado === 'activo').length,
      obrasTotales: projs.length,
      integrantesEquipo: dataService.getUsuarios().length,
    });
  }, []);

  const fetchBillingStatus = useCallback(async (): Promise<BillingStatusSummary | null> => {
    try {
      const headers = await aiHeaders();
      const res = await fetch('/api/billing/status', { headers, cache: 'no-store' });
      if (!res.ok) return null;
      const data = (await res.json()) as BillingStatusSummary;
      setBillingStatus(data);
      return data;
    } catch {
      return null;
    } finally {
      setLoadingBilling(false);
    }
  }, []);

  useEffect(() => {
    refreshLocalState();
    void fetchBillingStatus();

    window.addEventListener('obratrack_cloud_synced', refreshLocalState);
    window.addEventListener('obratrack_plan_changed', refreshLocalState);
    return () => {
      window.removeEventListener('obratrack_cloud_synced', refreshLocalState);
      window.removeEventListener('obratrack_plan_changed', refreshLocalState);
    };
  }, [fetchBillingStatus, refreshLocalState]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const billingParam = params.get('billing');
    if (!billingParam) return;

    setReturnBanner(getBillingBannerConfig(billingParam));

    const cleanUrl = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('billing');
      url.searchParams.delete('order');
      window.history.replaceState({}, '', url.pathname + url.search);
    };

    let active = true;
    const syncConfirmedState = async () => {
      await dataService.pullFromCloudServer();
      if (!active) return;
      refreshLocalState();
      await fetchBillingStatus();
      cleanUrl();
    };

    if (billingParam === 'success') {
      void syncConfirmedState();
      return () => {
        active = false;
      };
    }

    if (billingParam === 'pending') {
      let attempts = 0;
      const poll = async () => {
        attempts += 1;
        const summary = await fetchBillingStatus();
        if (!active) return;
        const confirmed =
          summary?.suscripcion?.estado === 'active' ||
          summary?.pagos?.[0]?.estado === 'paid';
        if (confirmed) {
          await syncConfirmedState();
          if (active) setReturnBanner(getBillingBannerConfig('success'));
          return;
        }
        if (attempts < 5) {
          pollTimerRef.current = setTimeout(() => {
            void poll();
          }, 1500);
        } else {
          cleanUrl();
        }
      };
      void poll();
      return () => {
        active = false;
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      };
    }

    cleanUrl();
    return () => {
      active = false;
    };
  }, [fetchBillingStatus, refreshLocalState]);

  const currentPlanDetails = getPlanDetails(plan);
  const canManageBilling = billingStatus
    ? billingStatus.can_manage_billing
    : activeUser?.rol === 'admin' || activeUser?.is_dev === true;
  const isUnlimited = billingStatus?.plan_id === 'ilimitado';
  const limiteTexto =
    currentPlanDetails.limiteObrasActivas === 'ilimitadas'
      ? `${usage.obrasActivas} / Ilimitadas`
      : `${usage.obrasActivas} / ${currentPlanDetails.limiteObrasActivas}`;

  const handleExportBackup = () => {
    const ok = exportService.exportAllDataAsJSON();
    showToast(
      ok
        ? 'Respaldo íntegro JSON descargado correctamente.'
        : 'No se pudo generar el respaldo de datos.',
    );
  };

  const startCheckout = async (
    planId: PaidPlanId,
    ciclo: BillingCycle,
    modalidad: BillingModality,
  ) => {
    setErrorMessage(null);
    setSubmittingPlan(planId);
    try {
      const headers = await aiHeaders();
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers,
        body: JSON.stringify({ planId, ciclo, modalidad }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.redirectUrl) {
        throw new Error(payload?.error || 'No se pudo iniciar el pago con Flow.');
      }
      setCheckoutChoicePlan(null);
      window.location.assign(payload.redirectUrl);
    } catch (cause) {
      setErrorMessage((cause as Error).message);
      setSubmittingPlan(null);
    }
  };

  const handleSelectPaidPlan = (planId: PaidPlanId) => {
    setErrorMessage(null);
    if (billingCycle === 'anual') {
      void startCheckout(planId, 'anual', 'prepago');
      return;
    }
    setCheckoutChoicePlan(planId);
  };

  const handleConfirmCancel = async () => {
    setCancelingSubscription(true);
    setErrorMessage(null);
    try {
      const headers = await aiHeaders();
      const response = await fetch('/api/billing/cancel', {
        method: 'POST',
        headers,
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'No se pudo cancelar la renovación automática.');
      }
      setIsCancelModalOpen(false);
      await fetchBillingStatus();
      showToast('Renovación automática cancelada. Mantendrás el plan hasta el fin del período.');
    } catch (cause) {
      setErrorMessage((cause as Error).message);
    } finally {
      setCancelingSubscription(false);
    }
  };

  const activeSub = billingStatus?.suscripcion ?? null;

  return (
    <div className="flex-1 min-h-screen">
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 rounded-2xl bg-navy-900 text-white border border-obra-orange/50 px-4 py-3 text-xs font-semibold shadow-2xl flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 text-obra-orange shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      <Navbar
        title="Planes y suscripción"
        subtitle={`Tu plan actual: ${isUnlimited ? 'Corporativo Ilimitado' : currentPlanDetails.nombre}`}
      />

      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        {returnBanner && (
          <div
            role="status"
            aria-live="polite"
            className={`rounded-2xl border p-4 flex items-start justify-between gap-3 text-xs ${
              returnBanner.tone === 'success'
                ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                : returnBanner.tone === 'error'
                  ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200'
                  : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {returnBanner.tone === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-bold">{returnBanner.title}</p>
                <p className="mt-0.5 opacity-90">{returnBanner.description}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReturnBanner(null)}
              aria-label="Cerrar notificación de pago"
              className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-4 flex items-start justify-between gap-3 text-xs text-red-900 dark:text-red-200"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{errorMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              aria-label="Cerrar alerta de error"
              className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Resumen de Consumo Actual del Tenant */}
        <section
          aria-label="Consumo actual de tu cuenta"
          className="rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-5 shadow-sm space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-heading font-bold text-navy-900 dark:text-white">
                Tu suscripción
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {activeUser?.empresa_nombre || 'Cuenta activa'} · Plan vigente:{' '}
                <span className="font-semibold text-obra-orange">
                  {isUnlimited ? 'Corporativo Ilimitado' : currentPlanDetails.nombre}
                </span>
              </p>
            </div>

          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <div className="rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0B0F14] p-3.5">
              <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
                <span className="font-mono uppercase text-[11px]">Obras en curso</span>
                <Building2 className="w-4 h-4 text-obra-orange" />
              </div>
              <p className="text-lg font-mono font-bold text-navy-900 dark:text-white mt-1">
                {limiteTexto}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {usage.obrasTotales} obra(s) registrada(s) en total
              </p>
            </div>

            <div className="rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0B0F14] p-3.5">
              <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
                <span className="font-mono uppercase text-[11px]">Equipo y Cuadrilla</span>
                <Users className="w-4 h-4 text-obra-green" />
              </div>
              <p className="text-lg font-mono font-bold text-navy-900 dark:text-white mt-1">
                {usage.integrantesEquipo} usuario(s)
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Personas registradas
              </p>
            </div>

            <div className="rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0B0F14] p-3.5">
              <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
                <span className="font-mono uppercase text-[11px]">ObraBot</span>
                <Sparkles className="w-4 h-4 text-obra-green" />
              </div>
              <p className="text-lg font-mono font-bold text-navy-900 dark:text-white mt-1">
                {plan === 'pro_ia'
                  ? 'Web + WhatsApp'
                  : plan === 'pro'
                    ? 'ObraBot web'
                    : 'Gestión básica'}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {plan === 'gratis'
                  ? 'Actualiza a Pro para cotizar con IA'
                  : 'ObraBot habilitado'}
              </p>
            </div>
          </div>
        </section>

        <details className="rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-5 space-y-5">
          <summary className="cursor-pointer text-base font-semibold">
            Comparar y cambiar plan
          </summary>
          <div className="inline-flex items-center rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-100 dark:bg-[#0B0F14] p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setBillingCycle('mensual')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                billingCycle === 'mensual'
                  ? 'bg-white dark:bg-[#141A23] text-navy-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              Mensual
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('anual')}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                billingCycle === 'anual'
                  ? 'bg-white dark:bg-[#141A23] text-navy-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              <span>Anual</span>
              <span className="rounded bg-emerald-600 text-white px-1.5 py-0.5 text-[10px] font-mono">
                -15%
              </span>
            </button>
          </div>
          {/* Tarjetas Comparativas de Planes */}
        <div className="grid md:grid-cols-3 gap-5">
          {PLANES_SUSCRIPCION.map((p) => {
            const paidPlanId = isPaidPlanId(p.id) ? p.id : null;
            const pricing = paidPlanId ? getPlanPricing(paidPlanId, billingCycle) : null;
            const precioMensual = pricing ? pricing.precioEfectivoMensualCLP : 0;
            const isCurrent = p.id === plan;
            const isBusy = submittingPlan === p.id;
            const allowAnualSwitch =
              isCurrent &&
              paidPlanId !== null &&
              billingCycle === 'anual' &&
              activeSub?.ciclo !== 'anual' &&
              canManageBilling;

            return (
              <article
                key={p.id}
                className={`rounded-2xl border p-6 flex flex-col gap-4 transition-all ${
                  p.popular
                    ? 'border-2 border-obra-orange bg-white dark:bg-[#141A23] shadow-md'
                    : 'border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xl font-bold text-navy-900 dark:text-white">{p.nombre}</h2>
                  <span
                    className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full ${
                      p.popular
                        ? 'bg-obra-orange text-white'
                        : 'bg-kraft-100 dark:bg-[#0B0F14] text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {p.badge}
                  </span>
                </div>

                <div>
                  <p className="text-2xl font-mono font-bold text-navy-900 dark:text-white">
                    {formatCLP(precioMensual)}
                    <span className="text-sm font-normal text-gray-500 dark:text-gray-400"> /mes</span>
                  </p>
                  {pricing && billingCycle === 'anual' && (
                    <p className="text-xs font-mono text-emerald-700 dark:text-emerald-400 mt-0.5">
                      Facturado anual: {formatCLP(pricing.montoCobroCLP)} / año (ahorras{' '}
                      {formatCLP(pricing.ahorroAnualCLP)})
                    </p>
                  )}
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-300">{p.descripcion}</p>

                <ul className="space-y-2 text-sm flex-1 text-gray-700 dark:text-gray-200">
                  {p.caracteristicas.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="text-obra-green font-bold">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {isUnlimited ? (
                  <p className="rounded-xl bg-kraft-100 dark:bg-[#0B0F14] border border-kraft-200 dark:border-[#263040] p-3 text-xs font-semibold text-gray-700 dark:text-gray-300 text-center">
                    Plan corporativo ilimitado activo
                  </p>
                ) : isCurrent && !allowAnualSwitch ? (
                  <p className="rounded-xl bg-green-50 dark:bg-emerald-950/40 border border-green-200 dark:border-emerald-800/50 p-3 text-sm font-semibold text-green-800 dark:text-emerald-300 text-center">
                    Plan actual activo
                  </p>
                ) : !paidPlanId ? (
                  <p className="rounded-xl bg-kraft-50 dark:bg-[#0B0F14] border border-kraft-200 dark:border-[#263040] p-3 text-xs text-gray-600 dark:text-gray-300 text-center">
                    Para volver al plan gratuito, cancela la renovación automática en tu suscripción.
                  </p>
                ) : !canManageBilling ? (
                  <p className="rounded-xl bg-kraft-50 dark:bg-[#0B0F14] border border-kraft-200 dark:border-[#263040] p-3 text-xs text-gray-600 dark:text-gray-300 text-center">
                    Solo el administrador de la empresa puede gestionar pagos.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      disabled={submittingPlan !== null}
                      onClick={() => handleSelectPaidPlan(paidPlanId)}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-obra-orange hover:bg-obra-orange-hover disabled:opacity-60 text-white p-3 text-center text-sm font-bold shadow-sm transition-colors"
                    >
                      {isBusy ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CreditCard className="w-4 h-4" />
                      )}
                      <span>
                        {allowAnualSwitch
                          ? `Cambiar a ${p.nombre} Anual`
                          : `Contratar ${p.nombre}`}
                      </span>
                    </button>
                    <p className="text-[11px] text-center text-gray-500 dark:text-gray-400">
                      {billingCycle === 'anual'
                        ? 'Webpay · CuentaRUT / Débito · Crédito · Transferencia'
                        : 'Cargo automático o pago único con Webpay / CuentaRUT'}
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </div></details>

        {/* Estado de suscripción activa e historial de pagos */}
        <section
          aria-label="Suscripción e historial de pagos"
          className="rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-5 shadow-sm space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-obra-orange" />
              <h2 className="text-sm font-heading font-bold text-navy-900 dark:text-white">
                Suscripción e Historial de Pagos
              </h2>
            </div>

            {canManageBilling &&
              plan !== 'gratis' &&
              !isUnlimited &&
              activeSub &&
              !activeSub.cancel_at_period_end && (
                <button
                  type="button"
                  onClick={() => setIsCancelModalOpen(true)}
                  className="text-xs font-semibold text-red-600 dark:text-red-400 underline hover:opacity-80"
                >
                  Cancelar renovación automática
                </button>
              )}
          </div>

          {loadingBilling ? (
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-obra-orange" />
              <span>Consultando estado de suscripción…</span>
            </div>
          ) : (
            <>
              {billingStatus && !billingStatus.gateway_configured && (
                <p className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-200">
                  La pasarela Flow.cl aún espera configuración de variables de comercio en el servidor (`FLOW_API_KEY` y `FLOW_SECRET_KEY`).
                </p>
              )}

              {activeSub ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0B0F14] p-3">
                    <span className="text-[11px] font-mono uppercase text-gray-500 dark:text-gray-400">
                      Estado y Modalidad
                    </span>
                    <p className="font-semibold text-navy-900 dark:text-white mt-1 capitalize">
                      {activeSub.estado === 'active'
                        ? activeSub.cancel_at_period_end
                          ? 'Activa (cancelación programada)'
                          : 'Activa'
                        : activeSub.estado}{' '}
                      · {activeSub.modalidad === 'recurrente' ? 'Cargo automático' : 'Prepago'} ({activeSub.ciclo})
                    </p>
                  </div>

                  <div className="rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0B0F14] p-3">
                    <span className="text-[11px] font-mono uppercase text-gray-500 dark:text-gray-400">
                      {activeSub.cancel_at_period_end || activeSub.modalidad === 'prepago'
                        ? 'Vigente hasta'
                        : 'Próxima renovación'}
                    </span>
                    <p className="font-semibold text-navy-900 dark:text-white mt-1">
                      {formatFechaCL(activeSub.current_period_end)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0B0F14] p-3">
                    <span className="text-[11px] font-mono uppercase text-gray-500 dark:text-gray-400">
                      Medio Registrado
                    </span>
                    <p className="font-semibold text-navy-900 dark:text-white mt-1">
                      {activeSub.card_last4
                        ? `${activeSub.card_brand || 'Tarjeta'} •••• ${activeSub.card_last4}`
                        : 'Pago puntual / Webpay'}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Aún no registras cobros asociados a esta empresa. Selecciona un plan superior para habilitar Webpay, tarjetas de crédito, débito o CuentaRUT.
                </p>
              )}

              {billingStatus?.pagos && billingStatus.pagos.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-kraft-200 dark:border-[#263040] text-gray-500 dark:text-gray-400 font-mono uppercase text-[11px]">
                        <th className="py-2 pr-3">Fecha</th>
                        <th className="py-2 pr-3">Orden</th>
                        <th className="py-2 pr-3">Plan</th>
                        <th className="py-2 pr-3">Modalidad</th>
                        <th className="py-2 pr-3">Monto</th>
                        <th className="py-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-kraft-200/70 dark:divide-[#263040]">
                      {billingStatus.pagos.map((pago) => {
                        const badge = formatPaymentStatusLabel(pago.estado);
                        return (
                          <tr key={pago.id}>
                            <td className="py-2.5 pr-3 whitespace-nowrap text-gray-700 dark:text-gray-300">
                              {formatFechaCL(pago.paid_at || pago.created_at)}
                            </td>
                            <td className="py-2.5 pr-3 font-mono text-[11px] text-gray-500 dark:text-gray-400">
                              {pago.commerce_order}
                            </td>
                            <td className="py-2.5 pr-3 font-semibold text-navy-900 dark:text-white">
                              {getPlanDetails(pago.plan_id).nombre} ({pago.ciclo})
                            </td>
                            <td className="py-2.5 pr-3 text-gray-600 dark:text-gray-300">
                              {pago.metodo_pago || (pago.modalidad === 'recurrente' ? 'Cargo automático' : 'Prepago')}
                            </td>
                            <td className="py-2.5 pr-3 font-mono font-semibold text-navy-900 dark:text-white">
                              {formatCLP(pago.monto_clp)}
                            </td>
                            <td className="py-2.5">
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${badge.className}`}>
                                {badge.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600 dark:text-gray-400">
          <p className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-obra-green shrink-0" />
            <span>
              Facturación segura en pesos chilenos (CLP, IVA incluido) vía Flow.cl con Webpay Plus, tarjetas, CuentaRUT y transferencia.
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm border-t border-kraft-200 dark:border-[#263040] pt-4 text-gray-700 dark:text-gray-300">
          <button
            type="button"
            className="underline hover:text-obra-orange"
            onClick={() => setLegal('terminos')}
          >
            Términos de servicio
          </button>
          <button
            type="button"
            className="underline hover:text-obra-orange"
            onClick={() => setLegal('privacidad')}
          >
            Privacidad (Ley 21.719)
          </button>
          <button
            type="button"
            className="underline hover:text-obra-orange"
            onClick={() => setLegal('ciberseguridad')}
          >
            Seguridad (Ley 21.663)
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 underline font-semibold text-obra-orange"
            onClick={handleExportBackup}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar mis datos íntegros (JSON)</span>
          </button>
        </div>

        {legal && (
          <LegalTermsModal
            key={legal}
            isOpen
            onClose={() => setLegal(null)}
            initialTab={legal}
          />
        )}

        {/* Modal selector de modalidad para plan mensual */}
        {checkoutChoicePlan && (
          <ModalOverlay
            onClose={() => (submittingPlan ? undefined : setCheckoutChoicePlan(null))}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`Elegir medio de pago para ${getPlanDetails(checkoutChoicePlan).nombre}`}
          >
            <div className="relative rounded-2xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] p-6 max-w-md w-full space-y-4 shadow-2xl">
              <button
                type="button"
                disabled={submittingPlan !== null}
                onClick={() => setCheckoutChoicePlan(null)}
                aria-label="Cerrar selector de pago"
                className="absolute top-3.5 right-3.5 p-1 rounded-lg text-gray-500 hover:bg-kraft-100 dark:hover:bg-[#1F2937]"
              >
                <X className="w-4 h-4" />
              </button>

              <div>
                <h3 className="text-lg font-heading font-bold text-navy-900 dark:text-white">
                  {getPlanDetails(checkoutChoicePlan).nombre} · Mensual
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Total a pagar:{' '}
                  <strong className="text-navy-900 dark:text-white">
                    {formatCLP(getPlanPricing(checkoutChoicePlan, 'mensual').montoCobroCLP)} CLP / mes
                  </strong>
                </p>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  disabled={submittingPlan !== null}
                  onClick={() => void startCheckout(checkoutChoicePlan, 'mensual', 'recurrente')}
                  className="w-full text-left rounded-xl border-2 border-obra-orange bg-orange-50/60 dark:bg-obra-orange/10 p-4 hover:bg-orange-50 dark:hover:bg-obra-orange/20 transition-colors disabled:opacity-60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm text-navy-900 dark:text-white flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-obra-orange" />
                      <span>Suscripción mensual automática</span>
                    </span>
                    <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-obra-orange text-white">
                      Recomendado
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-1.5">
                    Enrola tu tarjeta de crédito o débito habilitada en Flow para renovación automática sin interrupciones.
                  </p>
                </button>

                <button
                  type="button"
                  disabled={submittingPlan !== null}
                  onClick={() => void startCheckout(checkoutChoicePlan, 'mensual', 'prepago')}
                  className="w-full text-left rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-50 dark:bg-[#0B0F14] p-4 hover:border-obra-orange transition-colors disabled:opacity-60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm text-navy-900 dark:text-white flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-obra-green" />
                      <span>Pago único por 1 mes (Webpay / CuentaRUT)</span>
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-1.5">
                    Paga solo este mes con Webpay Plus, débito nacional, CuentaRUT, transferencia o Servipag sin guardar tarjeta.
                  </p>
                </button>
              </div>

              {submittingPlan && (
                <div className="flex items-center justify-center gap-2 text-xs font-semibold text-obra-orange pt-1">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Redirigiendo a pasarela segura Flow.cl…</span>
                </div>
              )}
            </div>
          </ModalOverlay>
        )}

        {/* Modal confirmación de cancelación */}
        {isCancelModalOpen && (
          <ModalOverlay
            onClose={() => (cancelingSubscription ? undefined : setIsCancelModalOpen(false))}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar cancelación de suscripción"
          >
            <div className="relative rounded-2xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] p-6 max-w-md w-full space-y-4 shadow-2xl">
              <button
                type="button"
                disabled={cancelingSubscription}
                onClick={() => setIsCancelModalOpen(false)}
                aria-label="Cerrar confirmación de cancelación"
                className="absolute top-3.5 right-3.5 p-1 rounded-lg text-gray-500 hover:bg-kraft-100 dark:hover:bg-[#1F2937]"
              >
                <X className="w-4 h-4" />
              </button>

              <h3 className="text-lg font-heading font-bold text-navy-900 dark:text-white">
                ¿Cancelar renovación automática?
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                Tu empresa conservará todos los beneficios del{' '}
                <strong>{currentPlanDetails.nombre}</strong> hasta el{' '}
                <strong>{formatFechaCL(activeSub?.current_period_end)}</strong>. Luego volverá automáticamente al Plan Gratis sin perder tus datos ni obras.
              </p>

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={cancelingSubscription}
                  onClick={() => setIsCancelModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-kraft-200 dark:border-[#263040] text-xs font-semibold text-gray-700 dark:text-gray-300"
                >
                  Mantener plan
                </button>
                <button
                  type="button"
                  disabled={cancelingSubscription}
                  onClick={() => void handleConfirmCancel()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold"
                >
                  {cancelingSubscription && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Confirmar cancelación</span>
                </button>
              </div>
            </div>
          </ModalOverlay>
        )}
      </div>
    </div>
  );
}
