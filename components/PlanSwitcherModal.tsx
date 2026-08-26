'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  Sparkles,
  Zap,
  Shield,
  Bot,
  MessageSquare,
  ArrowRight,
  TrendingUp,
  Building,
} from 'lucide-react';
import { dataService } from '@/lib/data-service';
import { PLANES_SUSCRIPCION, getPlanDetails } from '@/lib/plans';
import { SubscriptionPlanId } from '@/types/database';

interface PlanSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PlanSwitcherModal({ isOpen, onClose }: PlanSwitcherModalProps) {
  const [activePlan, setActivePlan] = useState<SubscriptionPlanId>('pro_ia');
  const [justChanged, setJustChanged] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActivePlan(dataService.getActivePlan());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectPlan = (planId: SubscriptionPlanId) => {
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
          className="absolute top-5 right-5 p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
          aria-label="Cerrar modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FF6A00]/10 border border-[#FF6A00]/30 text-[#FF6A00] text-xs font-bold font-mono uppercase tracking-wider mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Simulador de Planes para Evaluación Académica</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black font-heading text-[#1E1E1E]">
            Elige tu Plan de Suscripción ObraTrack
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 font-sans mt-2">
            Haz clic en cualquier plan para <strong>activarlo en tiempo real</strong> y demostrar a tus profesores cómo se adaptan las funciones y límites de la plataforma.
          </p>

          {justChanged && (
            <div className="mt-3 py-1.5 px-4 bg-[#6B8F72]/15 border border-[#6B8F72] text-[#55735B] text-xs font-bold rounded-xl inline-flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
              <CheckCircle2 className="w-4 h-4 text-[#6B8F72]" />
              <span>¡Plan {getPlanDetails(justChanged as SubscriptionPlanId).nombre} activado exitosamente en el sistema!</span>
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
                    ? 'border-[#FF6A00] bg-white shadow-xl shadow-[#FF6A00]/10 ring-2 ring-[#FF6A00]/20'
                    : 'border-[#E5DFC9] bg-[#FAF8F5]/60 hover:border-gray-400 hover:bg-white'
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
                    <h3 className="font-heading font-black text-lg text-[#1E1E1E]">
                      {plan.nombre}
                    </h3>
                    {isSelected && (
                      <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-[#FF6A00] bg-[#FF6A00]/10 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" /> Activo
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-gray-500 font-sans mt-1">
                    {plan.usuarioObjetivo}
                  </p>

                  {/* Price */}
                  <div className="mt-4 pb-4 border-b border-[#E5DFC9]">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl sm:text-3xl font-black font-mono text-[#1E1E1E]">
                        {plan.precioRangoTexto}
                      </span>
                      <span className="text-xs text-gray-500 font-mono">CLP</span>
                    </div>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                      {plan.periodo}
                    </p>
                  </div>

                  {/* Feature Checklist */}
                  <ul className="mt-4 space-y-2 text-xs text-gray-700">
                    {plan.caracteristicas.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2
                          className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                            plan.id === 'pro_ia'
                              ? 'text-[#6B8F72]'
                              : plan.id === 'pro'
                              ? 'text-[#FF6A00]'
                              : 'text-gray-400'
                          }`}
                        />
                        <span className="leading-tight">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Switcher Button */}
                <button
                  type="button"
                  onClick={() => handleSelectPlan(plan.id)}
                  className={`mt-6 w-full py-2.5 px-4 rounded-xl text-xs font-heading font-bold transition-all flex items-center justify-center gap-1.5 ${
                    isSelected
                      ? 'bg-[#1E1E1E] text-white cursor-default'
                      : plan.id === 'pro_ia'
                      ? 'bg-[#6B8F72] hover:bg-[#55735B] text-white shadow-md'
                      : plan.id === 'pro'
                      ? 'bg-[#FF6A00] hover:bg-[#E55F00] text-white shadow-md'
                      : 'bg-gray-200 hover:bg-gray-300 text-[#1E1E1E]'
                  }`}
                >
                  {isSelected ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-[#6B8F72]" />
                      <span>Plan Seleccionado</span>
                    </>
                  ) : (
                    <>
                      <span>Activar en Demo</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer info for evaluation */}
        <div className="mt-8 pt-4 border-t border-[#E5DFC9] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 font-mono">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#6B8F72]" />
            <span>Monetización SaaS B2B en Pesos Chilenos (CLP)</span>
          </div>
          <button
            onClick={onClose}
            className="text-[#FF6A00] hover:underline font-bold"
          >
            Continuar usando ObraTrack &rarr;
          </button>
        </div>

      </div>
    </div>
  );
}
