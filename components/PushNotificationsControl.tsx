'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Check, Loader2, Send, ShieldAlert } from 'lucide-react';
import { aiHeaders } from '@/lib/ai/client';
import { dataService } from '@/lib/data-service';

type CategoryKey =
  | 'inicio_plazos'
  | 'incidentes_bitacora'
  | 'asignaciones_tareas'
  | 'materiales'
  | 'seguridad_clima'
  | 'cierre_diario';

type Preferences = Record<CategoryKey, boolean>;

const DEFAULT_PREFS: Preferences = {
  inicio_plazos: true,
  incidentes_bitacora: true,
  asignaciones_tareas: true,
  materiales: true,
  seguridad_clima: true,
  cierre_diario: true,
};

const CATEGORY_OPTIONS: Array<{ key: CategoryKey; label: string; desc: string }> = [
  {
    key: 'inicio_plazos',
    label: 'Inicio de obra, agenda y plazos',
    desc: 'Recordatorios el día antes y el mismo día en la mañana, además de vencimientos críticos.',
  },
  {
    key: 'incidentes_bitacora',
    label: 'Incidentes y reportes de terreno',
    desc: 'Alertas inmediatas cuando un trabajador reporta fallas, atrasos o reclamos.',
  },
  {
    key: 'asignaciones_tareas',
    label: 'Asignaciones y reprogramaciones',
    desc: 'Avisos al asignar operarios a una obra, reprogramar Carta Gantt o aprobar cambios.',
  },
  {
    key: 'materiales',
    label: 'Materiales y entregas',
    desc: 'Confirmación de compras realizadas y recepciones registradas en faena.',
  },
  {
    key: 'seguridad_clima',
    label: 'Avisos al equipo y seguridad',
    desc: 'Mensajes operativos, clima y recordatorios de EPP para la cuadrilla.',
  },
  {
    key: 'cierre_diario',
    label: 'Cierre diario de jornada',
    desc: 'Notificación al confirmar el cierre del día en una obra.',
  },
];

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const bytes = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    bytes[i] = rawData.charCodeAt(i);
  }
  return bytes.buffer;
}

export default function PushNotificationsControl({
  compact = false,
  onOpenSettings,
}: {
  compact?: boolean;
  onOpenSettings?: () => void;
}) {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [schemaReady, setSchemaReady] = useState(true);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const syncStatus = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const isSupported =
      'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setSupported(isSupported);
    if (!isSupported) return;

    setPermission(Notification.permission);
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const existingSub = await reg.pushManager.getSubscription();
      const user = dataService.getActiveUser();
      if (!user) return;

      const query = existingSub?.endpoint
        ? `?endpoint=${encodeURIComponent(existingSub.endpoint)}`
        : '';
      const res = await fetch(`/api/notificaciones/push${query}`, {
        headers: await aiHeaders(),
        cache: 'no-store',
      });
      if (!res.ok) return;
      const body = await res.json();
      setConfigured(Boolean(body.configured));
      setSchemaReady(body.schema_ready !== false);
      setPublicKey(body.publicKey || null);
      setSubscribed(Boolean(existingSub && body.subscribed));
      if (body.preferences) setPrefs({ ...DEFAULT_PREFS, ...body.preferences });
    } catch {
      // Ignorar silenciosamente si aún está iniciando sesión o sin conexión.
    }
  }, []);

  useEffect(() => {
    void syncStatus();
    const onSync = () => void syncStatus();
    window.addEventListener('obratrack_cloud_synced', onSync);
    return () => window.removeEventListener('obratrack_cloud_synced', onSync);
  }, [syncStatus]);

  const handleEnable = async () => {
    if (!supported || busy) return;
    setBusy(true);
    setErrorMsg('');
    setStatusMsg('');
    try {
      const perm =
        Notification.permission === 'granted'
          ? 'granted'
          : await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        throw new Error(
          'Permiso denegado en el navegador. Habilita las notificaciones en la configuración del sitio en Chrome.',
        );
      }

      const headers = await aiHeaders();
      let key = publicKey;
      if (!key) {
        const infoRes = await fetch('/api/notificaciones/push', { headers, cache: 'no-store' });
        const info = await infoRes.json();
        key = info.publicKey;
        setSchemaReady(info.schema_ready !== false);
      }
      if (!key) {
        throw new Error(
          'Falta configurar las claves VAPID o aplicar la migración supabase/push_notificaciones.sql.',
        );
      }

      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        }));

      const res = await fetch('/api/notificaciones/push', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          subscription: sub.toJSON(),
          preferencias: prefs,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'No se pudo activar la suscripción push.');
      }

      setSubscribed(true);
      setStatusMsg('Notificaciones push activadas en este dispositivo.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudieron activar las notificaciones.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    if (!supported || busy) return;
    setBusy(true);
    setErrorMsg('');
    setStatusMsg('');
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      const endpoint = sub?.endpoint;
      if (sub) await sub.unsubscribe().catch(() => {});

      await fetch('/api/notificaciones/push', {
        method: 'DELETE',
        headers: await aiHeaders(),
        body: JSON.stringify({ endpoint }),
      });
      setSubscribed(false);
      setStatusMsg('Notificaciones desactivadas en este dispositivo.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo desactivar.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleCategory = async (key: CategoryKey) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    if (!subscribed) return;
    setErrorMsg('');
    try {
      const res = await fetch('/api/notificaciones/push', {
        method: 'POST',
        headers: await aiHeaders(),
        body: JSON.stringify({ action: 'preferences', preferencias: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'No se pudieron actualizar las preferencias.');
      }
      setStatusMsg('Preferencias actualizadas.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error guardando preferencias.');
    }
  };

  const handleTest = async () => {
    if (testing || !subscribed) return;
    setTesting(true);
    setErrorMsg('');
    setStatusMsg('');
    try {
      const res = await fetch('/api/notificaciones/push', {
        method: 'POST',
        headers: await aiHeaders(),
        body: JSON.stringify({ action: 'test' }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'No se pudo enviar la notificación de prueba.');
      }
      setStatusMsg('Notificación enviada. Deberías verla arriba con el logo de ObraTrack.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error enviando prueba.');
    } finally {
      setTesting(false);
    }
  };

  if (compact) {
    if (!supported) return null;
    if (subscribed) {
      return (
        <button
          type="button"
          onClick={onOpenSettings}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 text-xs font-medium transition-colors"
        >
          <span className="flex items-center gap-2 truncate">
            <BellRing className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Alertas Push activas</span>
          </span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
        </button>
      );
    }
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => (permission === 'denied' && onOpenSettings ? onOpenSettings() : void handleEnable())}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#FF6A00]/15 hover:bg-[#FF6A00]/25 border border-[#FF6A00]/35 text-orange-200 text-xs font-semibold transition-colors disabled:opacity-60"
      >
        <span className="flex items-center gap-2 truncate">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Bell className="w-3.5 h-3.5 text-[#FF6A00] shrink-0" />}
          <span className="truncate">
            {permission === 'denied' ? 'Push bloqueadas' : 'Activar notificaciones'}
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-[#0D1117]/70 p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <BellRing className="w-4 h-4 text-[#FF6A00]" />
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Notificaciones Push en celular y navegador
              </h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Recibe avisos en la barra superior y pantalla de bloqueo con el logo de ObraTrack, sin depender de WhatsApp.
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
              subscribed
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : permission === 'denied'
                  ? 'bg-red-500/15 text-red-700 dark:text-red-300'
                  : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
            }`}
          >
            {subscribed ? 'Activas aquí' : permission === 'denied' ? 'Bloqueadas en Chrome' : 'Desactivadas'}
          </span>
        </div>

        {!supported && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-200">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Este navegador no admite Web Push aquí. En Android instala ObraTrack desde Chrome; en iPhone primero usa «Compartir → Agregar a inicio».
            </span>
          </div>
        )}

        {supported && !schemaReady && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-200">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Falta ejecutar la migración <code>supabase/push_notificaciones.sql</code> en Supabase para guardar suscripciones de dispositivos.
            </span>
          </div>
        )}

        {supported && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {!subscribed ? (
              <button
                type="button"
                disabled={busy || permission === 'denied' || (!configured && !schemaReady)}
                onClick={handleEnable}
                className="inline-flex items-center gap-2 rounded-xl bg-[#FF6A00] hover:bg-[#e55f00] px-4 py-2 text-xs font-bold text-white disabled:opacity-60 transition-colors"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
                <span>Activar notificaciones push</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={testing}
                  onClick={handleTest}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#FF6A00] hover:bg-[#e55f00] px-4 py-2 text-xs font-bold text-white disabled:opacity-60 transition-colors"
                >
                  {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Enviar notificación de prueba</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleDisable}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#141A23] px-3.5 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:border-red-500 hover:text-red-500 transition-colors"
                >
                  <BellOff className="w-3.5 h-3.5" />
                  <span>Desactivar en este dispositivo</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Categorías */}
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
          Qué notificaciones recibir
        </p>
        <div className="divide-y divide-gray-200 dark:divide-gray-800 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#141A23]">
          {CATEGORY_OPTIONS.map((item) => (
            <label
              key={item.key}
              className="flex items-start justify-between gap-4 p-3.5 cursor-pointer hover:bg-gray-50/70 dark:hover:bg-[#1A2230]/50 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{item.label}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{item.desc}</p>
              </div>
              <input
                type="checkbox"
                checked={prefs[item.key]}
                onChange={() => void handleToggleCategory(item.key)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#FF6A00] focus:ring-[#FF6A00] shrink-0"
              />
            </label>
          ))}
        </div>
      </div>

      {statusMsg && (
        <p role="status" className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <Check className="w-3.5 h-3.5 shrink-0" />
          <span>{statusMsg}</span>
        </p>
      )}
      {errorMsg && (
        <p role="alert" className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMsg}</span>
        </p>
      )}
    </div>
  );
}
