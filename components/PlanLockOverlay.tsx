'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Lock, Sparkles, Zap, ArrowRight } from 'lucide-react';
import PlanSwitcherModal from './PlanSwitcherModal';

interface PlanLockOverlayProps {
  isLocked: boolean;
  featureName: string;
  description?: string;
  requiredPlan?: 'pro' | 'pro_ia';
  children: React.ReactNode;
}

export default function PlanLockOverlay({
  isLocked,
  featureName,
  description = 'Esta funcionalidad está disponible a partir del Plan Pro ($9.990 - $14.990 CLP). Actualiza tu plan para desbloquear el acceso completo.',
  requiredPlan = 'pro',
  children,
}: PlanLockOverlayProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden group">
      <PlanSwitcherModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      {/* Contenido (desenfocado solo si está bloqueado) */}
      <div className={isLocked ? 'filter blur-[3.5px] opacity-40 select-none pointer-events-none transition-all duration-300' : ''}>
        {children}
      </div>

      {/* Candado y Aviso de Bloqueo */}
      {isLocked && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-navy-950/40 backdrop-blur-[2px] transition-all">
          <div className="bg-white/95 dark:bg-[#171D26] border border-[#E5DFC9] dark:border-[#2B3545] shadow-2xl rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-4 animate-in fade-in zoom-in-95">
            {/* Icono de Candado con Brillo */}
            <div className="relative mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500/20 via-[#FF6A00]/20 to-orange-500/30 border border-[#FF6A00]/30 flex items-center justify-center text-[#FF6A00] shadow-inner">
              <Lock className="w-8 h-8 text-[#FF6A00]" />
              <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF6A00] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-[#FF6A00] text-[9px] text-white font-bold items-center justify-center">
                  ★
                </span>
              </span>
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#FF6A00]/10 text-[#FF6A00] text-[10px] font-mono font-bold uppercase mb-2">
                <Sparkles className="w-3 h-3" />
                <span>Función Exclusiva {requiredPlan === 'pro_ia' ? 'Plan Pro IA' : 'Plan Pro'}</span>
              </div>
              <h3 className="font-heading font-black text-lg text-navy-900 dark:text-white leading-snug">
                Desbloquea {featureName}
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
                {description}
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="w-full py-3 bg-gradient-to-r from-[#FF6A00] to-orange-500 hover:from-[#E55F00] hover:to-orange-600 text-white font-bold rounded-xl shadow-lg shadow-[#FF6A00]/30 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider font-heading hover:scale-[1.02]"
              >
                <Zap className="w-4 h-4 fill-white" />
                <span>Actualizar Plan en 1 Clic</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <Link
                href="/planes"
                className="text-[11px] text-gray-500 hover:text-navy-900 dark:hover:text-white font-mono underline"
              >
                Ver comparativa de todos los planes
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
