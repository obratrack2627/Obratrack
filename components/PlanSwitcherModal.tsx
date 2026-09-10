'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  Sparkles,
  Zap,
  Shield,
  ArrowRight,
  Lock,
} from 'lucide-react';
import { dataService } from '@/lib/data-service';
import { PLANES_SUSCRIPCION, getPlanDetails } from '@/lib/plans';
import { SubscriptionPlanId } from '@/types/database';
import { isDeveloperUser } from '@/lib/auth-utils';
import Link from 'next/link';

interface PlanSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PlanSwitcherModal({ isOpen, onClose }: PlanSwitcherModalProps) {
  const [activePlan, setActivePlan] = useState<SubscriptionPlanId>('gratis');
  const [justChanged, setJustChanged] = useState<string | null>(null);
  const [isDev, setIsDev] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const user = dataService.getActiveUser();
      setIsDev(isDeveloperUser(user));
      setActivePlan(dataService.getActivePlan());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectPlan = (planId: SubscriptionPlanId) => {
    if (!isDev) return;
    dataService.setActivePlan(planId);
    setActivePlan(planId);
    setJustChanged(planId);
    setTimeout(() => {
      setJustChanged(null);
    }, 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl my-auto bg-white dark:bg-[#141A23] border border-[#E5DFC9] dark:border-[#263040] rounded-2xl sm:rounded-3xl shadow-2xl p-5 sm:p-8 max-h-[calc(100dvh-2rem)] overflow-y-auto animate-in zoom-in-95">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
          aria-label="Cerrar modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-8">
          {isDev ? (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FF6A00]/10 border border-[#FF6A00]/30 text-[#FF6A00] text-xs font-bold font-mono uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Modo Desarrollador: Control Total de Planes</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold font-mono uppercase tracking-wider mb-2">
              <Shield className="w-3.5 h-3.5 text-[#6B8F72]" />
              <span>Planes de Suscripción ObraTrack</span>
            </div>
          )}

          <h2 className="text-2xl sm:text-3xl font-black font-heading text-[#1E1E1E] dark:text-white">
            {isDev ? 'Simulador y Control de Planes SaaS' : 'Planes de Suscripción para Constructoras'}
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-sans mt-2">
            {isDev ? (
              <>
                Como <strong>Desarrollador de ObraTrack</strong>, puedes alternar en cualquier momento entre el <strong>Plan Gratis</strong>, <strong>Plan Pro</strong> y <strong>Plan Pro IA</strong> para demostrar a tus profesores el cambio dinámico de permisos y límites.
              </>
            ) : (
              <>
                Actualmente estás en el <strong>{getPlanDetails(activePlan).nombre}</strong>. Actualiza tu plan para desbloquear obras ilimitadas, el cotizador de materiales con IA (Google Gemini) y automatización con WhatsApp.
              </>
            )}
          </p>

          {justChanged && (
            <div className="mt-3 py-1.5 px-4 bg-[#6B8F72]/15 border border-[#6B8F72] text-[#55735B] dark:text-[#85C492] text-xs font-bold rounded-xl inline-flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
              <CheckCircle2 className="w-4 h-4 text-[#6B8F72]" />
              <span>
                ¡Plan {getPlanDetails(justChanged as SubscriptionPlanId).nombre} activado exitosamente en el sistema y Supabase!
              </span>
            </div>
          )}
        </div>

        {/* 3 Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PLANES_SUSCRIPCION.map((plan) => {
            const isSelected = activePlan === plan.id;

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl p-5 border-2 transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'border-[#FF6A00] bg-white dark:bg-[#1A222E] shadow-xl shadow-[#FF6A00]/10 ring-2 ring-[#FF6A00]/20'
                    : 'border-[#E5DFC9] dark:border-[#263040] bg-[#FAF8F5]/60 dark:bg-[#10151D]/60 hover:border-gray-400 hover:bg-white dark:hover:bg-[#141A23]'
                }`}
              >
                {/* Badge Superior */}
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#FF6A00] text-white text-[10px] font-extrabold uppercase tracking-wider px-3 py-0.5 rounded-full shadow-md">
                    {plan.badge}
                  </span>
                )}
                {plan.id === 'pro_ia' && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#6B8F72] text-white text-[10px] font-extrabold uppercase tracking-wider px-3 py-0.5 rounded-full shadow-md">
                    {plan.badge}
                  </span>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-heading font-black text-lg text-[#1E1E1E] dark:text-white">
                      {plan.nombre}
                    </h3>
                    {isSelected && (
                      <span className="text-[10px] font-mono font-bold text-[#6B8F72] bg-[#6B8F72]/15 px-2 py-0.5 rounded-full">
                        Activo
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400 font-sans mt-1 leading-relaxed">
                    {plan.descripcion}
                  </p>

                  <div className="mt-4 p-3 rounded-xl bg-[#FAF8F5] dark:bg-[#0D1117] border border-[#E5DFC9] dark:border-[#263040]">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black font-mono text-[#1E1E1E] dark:text-white">
                        {plan.precioRangoTexto}
                      </span>
                      <span className="text-[10px] text-gray-500 font-mono">CLP</span>
                    </div>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">{plan.periodo}</p>
                  </div>

                  <ul className="mt-4 space-y-2 text-xs text-gray-600 dark:text-gray-300 font-sans">
                    {plan.caracteristicas.map((car, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#6B8F72] shrink-0 mt-0.5" />
                        <span>{car}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6 pt-3 border-t border-gray-200 dark:border-gray-800">
                  {isDev ? (
                    <button
                      type="button"
                      onClick={() => handleSelectPlan(plan.id)}
                      disabled={isSelected}
                      className={`w-full py-2.5 px-3 rounded-xl font-heading font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                        isSelected
                          ? 'bg-[#1E1E1E] dark:bg-gray-800 text-white cursor-default'
                          : plan.id === 'pro_ia'
                          ? 'bg-[#6B8F72] hover:bg-[#55735B] text-white shadow-md'
                          : plan.id === 'pro'
                          ? 'bg-[#FF6A00] hover:bg-[#E55F00] text-white shadow-md'
                          : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-[#1E1E1E] dark:text-white'
                      }`}
                    >
                      {isSelected ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-[#6B8F72]" />
                          <span>Plan Activo</span>
                        </>
                      ) : (
                        <>
                          <span>Activar en Sistema</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  ) : isSelected ? (
                    <div className="w-full py-2 px-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-mono font-bold text-center flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-[#6B8F72]" />
                      <span>Tu Plan Actual</span>
                    </div>
                  ) : (
                    <Link
                      href="/planes"
                      onClick={onClose}
                      className="w-full py-2 px-3 rounded-xl bg-[#FF6A00] hover:bg-[#E55F00] text-white text-xs font-heading font-bold text-center flex items-center justify-center gap-1.5 shadow-md transition-all"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Mejorar Plan</span>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="mt-8 pt-4 border-t border-[#E5DFC9] dark:border-[#263040] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 font-mono">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#6B8F72]" />
            <span>Monetización SaaS B2B en Pesos Chilenos (CLP)</span>
          </div>
          <button onClick={onClose} className="text-[#FF6A00] hover:underline font-bold">
            Cerrar ventana &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
