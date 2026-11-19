'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { dataService } from '@/lib/data-service';
import type { SubscriptionPlanId } from '@/types/database';

interface WhatsAppChannelStatus {
  cloud_api_configurada?: boolean;
  numero?: string | null;
}

interface ObraBotWhatsAppLinkProps {
  activePlan?: SubscriptionPlanId | string;
  projectName?: string;
  compact?: boolean;
  showMissingPhoneHint?: boolean;
}

/**
 * Acceso directo al chat oficial de ObraBot en WhatsApp desde las vistas web de ObraBot.
 */
export default function ObraBotWhatsAppLink({
  activePlan,
  projectName,
  compact = false,
  showMissingPhoneHint = false,
}: ObraBotWhatsAppLinkProps) {
  const [status, setStatus] = useState<WhatsAppChannelStatus | null>(null);
  const [hasPhone, setHasPhone] = useState(true);

  useEffect(() => {
    let alive = true;
    const syncPhone = () => {
      const user = dataService.getActiveUser();
      const clean = (user?.telefono_whatsapp || '').replace(/\D/g, '');
      setHasPhone(clean.length >= 8);
    };
    syncPhone();
    window.addEventListener('obratrack_profile_updated', syncPhone);
    window.addEventListener('obratrack_cloud_synced', syncPhone);

    void fetch('/api/webhook/whatsapp')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (alive && data) setStatus(data);
      })
      .catch(() => {});

    return () => {
      alive = false;
      window.removeEventListener('obratrack_profile_updated', syncPhone);
      window.removeEventListener('obratrack_cloud_synced', syncPhone);
    };
  }, []);

  const plan = activePlan || dataService.getActivePlan();
  const isProIA = plan === 'pro_ia' || plan === 'ilimitado';

  if (!isProIA) {
    if (plan !== 'pro') return null;
    return (
      <Link
        href="/planes"
        title="Actualiza a Plan Pro IA para usar ObraBot directamente por WhatsApp"
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold transition-all whitespace-nowrap"
      >
        <MessageCircle className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden sm:inline">WhatsApp (Pro IA)</span>
      </Link>
    );
  }

  const botNumber = (status?.numero || process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '').replace(/\D/g, '');
  if (!status?.cloud_api_configurada || !botNumber) {
    return null;
  }

  const prefill = projectName
    ? `Hola ObraBot, revisemos la obra ${projectName}`
    : 'Hola ObraBot';
  const href = `https://wa.me/${botNumber}?text=${encodeURIComponent(prefill)}`;

  return (
    <div className="inline-flex items-center gap-2 shrink-0">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Abrir ObraBot en WhatsApp"
        title={
          hasPhone
            ? 'Abrir chat de ObraBot en WhatsApp'
            : 'Abre WhatsApp (recuerda registrar tu teléfono en Mi perfil para que te reconozca)'
        }
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#25D366] hover:bg-[#1EBE5D] text-white text-[11px] font-bold transition-all shadow-sm whitespace-nowrap"
      >
        <MessageCircle className="w-3.5 h-3.5 shrink-0" />
        <span className={compact ? 'hidden sm:inline' : ''}>
          {compact ? 'WhatsApp' : 'ObraBot WhatsApp'}
        </span>
      </a>
      {showMissingPhoneHint && !hasPhone && (
        <span
          title="Registra tu número en Mi perfil para que ObraBot te reconozca al escribir por WhatsApp"
          className="hidden lg:inline-flex items-center px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-200 border border-amber-400/30 text-[10px] font-medium"
        >
          Registra tu teléfono en Perfil
        </span>
      )}
    </div>
  );
}
