"use client";
import ModalOverlay from '@/components/ModalOverlay';
import Link from "next/link";
import { X } from "lucide-react";
import { dataService } from "@/lib/data-service";
import { getPlanDetails } from "@/lib/plans";
import { useState } from 'react';
import { aiHeaders } from '@/lib/ai/client';
import type { SubscriptionPlanId } from '@/types/database';
export default function PlanSwitcherModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const developer = dataService.getActiveUser()?.is_dev === true;
  const change = async (plan: SubscriptionPlanId) => {
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/dev/plan', { method: 'PATCH', headers: await aiHeaders(), body: JSON.stringify({ plan }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo cambiar el plan.');
      const synced = await dataService.pullFromCloudServer();
      if (!synced.success) throw new Error('Plan actualizado. Reintenta la sincronización para verlo.');
      window.dispatchEvent(new CustomEvent('obratrack_plan_changed', { detail: result.plan_id }));
      onClose();
    } catch (cause) { setError((cause as Error).message); }
    finally { setSaving(false); }
  };
  if (!isOpen) return null;
  return (
    <ModalOverlay onClose={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Tu suscripción"
    >
      <div className="relative rounded-2xl bg-white dark:bg-gray-900 p-6 max-w-md w-full space-y-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-3 right-3"
        >
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold">Tu suscripción</h2>
        <p className="text-sm">
          Plan actual:{" "}
          <strong>{getPlanDetails(dataService.getActivePlan()).nombre}</strong>.
        </p>
        {developer && <div className="space-y-2">
          <label htmlFor="developer-plan" className="block text-sm font-medium">Plan de desarrollo</label>
          <select id="developer-plan" disabled={saving} defaultValue={dataService.getActivePlan()}
            onChange={event => void change(event.target.value as SubscriptionPlanId)}
            className="w-full rounded-xl border border-gray-300 bg-transparent p-2.5">
            <option value="gratis">Gratis</option><option value="pro">Pro</option><option value="pro_ia">Pro IA</option>
          </select>
          <p className="text-xs text-gray-500">Solo desarrolladores · sin cobro</p>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>}
        <Link
          onClick={onClose}
          href="/planes"
          className="inline-block rounded-xl bg-obra-orange text-white px-4 py-2 text-sm"
        >
          Ver planes
        </Link>
      </div>
    </ModalOverlay>
  );
}
