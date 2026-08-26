'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Lock, Sparkles, Zap, ArrowRight, ShieldAlert } from 'lucide-react';
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

  if (!isLocked) {
    return <>{children}</>;
  }

  return (
    <div className="relative w-full rounded-2xl overflow-hidden group">
      <PlanSwitcherModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      {/* Contenido borroso y bloqueado */}
      <div className="filter blur-[3.5px] opacity-40 select-none pointer-events-none transition-all duration-300">
        {children}
      </div>

      {/* Candado y Aviso de Bloqueo */}
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-navy-950/40 backdrop-blur-[2px] transition-all">
        <div className="bg-white/95 border border-[#E5DFC9] shadow-2xl rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-4 animate-in fade-in zoom-in-95">
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
            <h3 className="font-heading font-black text-lg text-navy-900 leading-snug">
              {featureName}
            </h3>
            <p className="text-xs text-gray-600 font-sans mt-2 leading-relaxed">
              {description}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="w-full sm:w-auto px-5 py-2.5 bg-[#FF6A00] hover:bg-[#E55F00] text-white text-xs font-bold rounded-xl shadow-lg shadow-[#FF6A00]/25 transition-all flex items-center justify-center gap-2 font-heading"
            >
              <Zap className="w-4 h-4" />
              <span>Simular / Desbloquear Plan</span>
            </button>
            <Link
              href="/planes"
              className="w-full sm:w-auto px-4 py-2.5 bg-kraft-100 hover:bg-kraft-200 text-navy-900 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1 font-heading"
            >
              <span>Ver Planes</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
