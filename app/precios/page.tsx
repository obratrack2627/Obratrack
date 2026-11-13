'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, CreditCard, ShieldCheck } from 'lucide-react';
import Logo from '@/components/Logo';
import LegalTermsModal from '@/components/LegalTermsModal';
import { PLANES_SUSCRIPCION, getPlanPricing, isPaidPlanId } from '@/lib/plans';
import type { BillingCycle } from '@/types/database';
import { formatCLP } from '@/lib/utils';

export default function PreciosPublicosPage() {
  const [ciclo, setCiclo] = useState<BillingCycle>('mensual');
  const [legal, setLegal] = useState<'terminos' | 'privacidad' | 'ciberseguridad' | null>(null);

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0B0E14] text-[#1E1E1E] dark:text-gray-100">
      <header className="border-b border-kraft-200 dark:border-[#263040] bg-white/90 dark:bg-[#141A23]/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <Link href="/login" aria-label="Volver al inicio de sesión ObraTrack">
            <Logo variant="horizontal" size="sm" />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-xl bg-obra-orange hover:bg-obra-orange-hover text-white px-4 py-2 text-xs font-bold shadow-sm transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Ingresar / Crear cuenta</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-10 space-y-8">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <h1 className="text-3xl font-heading font-black text-navy-900 dark:text-white">
            Planes transparentes para constructoras y contratistas en Chile
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Valores expresados en pesos chilenos (CLP, IVA incluido). Paga con Webpay, tarjetas de crédito, débito nacional, CuentaRUT o transferencia bancaria a través de Flow.
          </p>

          <div className="inline-flex items-center rounded-xl border border-kraft-200 dark:border-[#263040] bg-kraft-100 dark:bg-[#141A23] p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setCiclo('mensual')}
              className={`px-3.5 py-1.5 rounded-lg transition-colors ${
                ciclo === 'mensual'
                  ? 'bg-white dark:bg-[#0B0E14] text-navy-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              Mensual
            </button>
            <button
              type="button"
              onClick={() => setCiclo('anual')}
              className={`px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                ciclo === 'anual'
                  ? 'bg-white dark:bg-[#0B0E14] text-navy-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              <span>Anual</span>
              <span className="rounded bg-emerald-600 text-white px-1.5 py-0.5 text-[10px] font-mono">
                -15%
              </span>
            </button>
          </div>
        </div>

        <section aria-label="Comparativa de planes" className="grid md:grid-cols-3 gap-5">
          {PLANES_SUSCRIPCION.map((plan) => {
            const pricing = isPaidPlanId(plan.id) ? getPlanPricing(plan.id, ciclo) : null;
            const precioMensual = pricing ? pricing.precioEfectivoMensualCLP : 0;

            return (
              <article
                key={plan.id}
                className={`rounded-2xl border p-6 flex flex-col gap-4 bg-white dark:bg-[#141A23] ${
                  plan.popular
                    ? 'border-2 border-obra-orange shadow-md'
                    : 'border-kraft-200 dark:border-[#263040] shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xl font-bold text-navy-900 dark:text-white">{plan.nombre}</h2>
                  <span
                    className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full ${
                      plan.popular
                        ? 'bg-obra-orange text-white'
                        : 'bg-kraft-100 dark:bg-[#0B0E14] text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {plan.badge}
                  </span>
                </div>

                <div>
                  <p className="text-2xl font-mono font-bold text-navy-900 dark:text-white">
                    {formatCLP(precioMensual)}
                    <span className="text-sm font-normal text-gray-500 dark:text-gray-400"> /mes</span>
                  </p>
                  {pricing && ciclo === 'anual' && (
                    <p className="text-xs font-mono text-emerald-700 dark:text-emerald-400 mt-0.5">
                      Pago anual único: {formatCLP(pricing.montoCobroCLP)} / año
                    </p>
                  )}
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-300">{plan.descripcion}</p>

                <ul className="space-y-2 text-sm flex-1 text-gray-700 dark:text-gray-200">
                  {plan.caracteristicas.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-obra-green shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/login?redirect=/planes"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-obra-orange hover:bg-obra-orange-hover text-white p-3 text-sm font-bold transition-colors"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>{plan.precioMensualCLP === 0 ? 'Comenzar gratis' : `Contratar ${plan.nombre}`}</span>
                </Link>
              </article>
            );
          })}
        </section>

        <footer className="border-t border-kraft-200 dark:border-[#263040] pt-6 flex flex-wrap items-center justify-between gap-4 text-xs text-gray-600 dark:text-gray-400">
          <p className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-obra-green shrink-0" />
            <span>Pagos procesados de forma segura con Flow.cl · Soporte: soporte@obratrack.cl</span>
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" className="underline hover:text-obra-orange" onClick={() => setLegal('terminos')}>
              Términos de servicio
            </button>
            <button type="button" className="underline hover:text-obra-orange" onClick={() => setLegal('privacidad')}>
              Privacidad (Ley 21.719)
            </button>
            <button type="button" className="underline hover:text-obra-orange" onClick={() => setLegal('ciberseguridad')}>
              Seguridad (Ley 21.663)
            </button>
          </div>
        </footer>
      </main>

      {legal && (
        <LegalTermsModal
          key={legal}
          isOpen
          onClose={() => setLegal(null)}
          initialTab={legal}
        />
      )}
    </div>
  );
}
