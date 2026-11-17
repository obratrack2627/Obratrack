'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  BellOff,
  BellRing,
  Check,
  CheckCircle2,
  Loader2,
  Send,
  ShieldAlert,
} from 'lucide-react';
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
type DiagnosticCode = 'missing_migration' | 'missing_service_role' | 'vapid_unavailable' | null;

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
    label: 'Inicio y plazos de obra',
    desc: 'Avisos el día anterior, la mañana de inicio y recordatorios de entrega.',
  },
  {
    key: 'incidentes_bitacora',
    label: 'Incidentes y bitácora',
    desc: 'Novedades críticas en terreno y solicitudes de cambio de obra.',
  },
  {
    key: 'asignaciones_tareas',
    label: 'Tareas y partidas',
    desc: 'Notificaciones cuando se asignan o actualizan actividades al equipo.',
  },
  {
    key: 'materiales',
    label: 'Materiales y entregas',
    desc: 'Confirmación de insumos recibidos en bodega o pedidos registrados.',
  },
  {
    key: 'seguridad_clima',
    label: 'Seguridad, planos y clima',
    desc: 'Alertas preventivas en faena, cambios de plano y avisos meteorológicos.',
  },
  {
    key: 'cierre_diario',
    label: 'Cierre diario de jornada',
    desc: 'Recordatorios de fin de día para completar el parte y asistencia.',
  },
];

const OPT_OUT_KEY = 'obratrack_push_opt_out';
const PROMPTED_SESSION_KEY = 'obratrack_push_prompted';
const PUSH_SYNC_EVENT = 'obratrack:push-updated';

let autoActivatePromise: Promise<{ ok: boolean; error?: string }> | null = null;
let gestureListenerAttached = false;

interface PushStatusResponse {
  configured?: boolean;
  schema_ready?: boolean;
  admin_ready?: boolean;
  diagnostic?: DiagnosticCode;
  publicKey?: string | null;
  subscribed?: boolean;
  activeCount?: number;
  preferences?: Partial<Preferences>;
  error?: string;
}

function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

function resolveConfigError(diagnostic: DiagnosticCode | undefined, fallbackError?: string | null): string {
  if (diagnostic === 'missing_migration') {
    return 'Ejecuta la migración supabase/push_notificaciones.sql en Supabase (ya incluye recarga de caché) y recarga la página.';
  }
  if (diagnostic === 'missing_service_role') {
    return 'Falta SUPABASE_SERVICE_ROLE_KEY (o NEXT_PUBLIC_VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY) en las variables de entorno de Vercel.';
  }
  if (diagnostic === 'vapid_unavailable') {
    return fallbackError || 'No se pudieron inicializar las claves VAPID en el servidor. Revisa los logs de Vercel.';
  }
  return fallbackError || 'Falta configurar las claves VAPID o aplicar la migración supabase/push_notificaciones.sql.';
}

async function performDeviceSubscribe(options: {
  allowPrompt: boolean;
  prefsOverride?: Preferences;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) {
    return { ok: false, error: 'Este navegador no soporta notificaciones push.' };
  }
  const user = dataService.getActiveUser();
  if (!user?.id) {
    return { ok: false, error: 'Inicia sesión para activar las alertas en este dispositivo.' };
  }

  let perm = Notification.permission;
  if (perm === 'default' && options.allowPrompt) {
    // Solicitar permiso inmediatamente dentro del gesto del usuario antes de cualquier await de red.
    perm = await Notification.requestPermission();
  }
  if (perm !== 'granted') {
    if (perm === 'denied') {
      return {
        ok: false,
        error: 'Permiso denegado en el navegador. Habilita las notificaciones para ObraTrack en la configuración de Chrome.',
      };
    }
    return { ok: false, error: 'Permiso pendiente de aceptar en el navegador.' };
  }

  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  const reg = await navigator.serviceWorker.ready;
  const headers = await aiHeaders();

  const existingSub = await reg.pushManager.getSubscription();
  const query = existingSub?.endpoint ? `?endpoint=${encodeURIComponent(existingSub.endpoint)}` : '';
  const infoRes = await fetch(`/api/notificaciones/push${query}`, { headers, cache: 'no-store' });
  const info = (await infoRes.json().catch(() => null)) as PushStatusResponse | null;

  if (!infoRes.ok || !info?.publicKey) {
    return {
      ok: false,
      error: resolveConfigError(info?.diagnostic, info?.error),
    };
  }

  if (!info.schema_ready) {
    return {
      ok: false,
      error: resolveConfigError(info.diagnostic || 'missing_migration', info.error),
    };
  }

  const sub =
    existingSub ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(info.publicKey),
    }));

  const mergedPrefs: Preferences = {
    ...DEFAULT_PREFS,
    ...(info.preferences || {}),
    ...(options.prefsOverride || {}),
  };

  const saveRes = await fetch('/api/notificaciones/push', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      subscription: sub.toJSON(),
      preferencias: mergedPrefs,
      userAgent: navigator.userAgent,
    }),
  });
  const saveBody = (await saveRes.json().catch(() => null)) as { error?: string } | null;
  if (!saveRes.ok) {
    return { ok: false, error: saveBody?.error || 'No se pudo guardar la suscripción en el servidor.' };
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PUSH_SYNC_EVENT));
  }
  return { ok: true };
}

function runAutoActivate(allowPrompt: boolean): Promise<{ ok: boolean; error?: string }> {
  if (autoActivatePromise) return autoActivatePromise;
  autoActivatePromise = performDeviceSubscribe({ allowPrompt }).finally(() => {
    autoActivatePromise = null;
  });
  return autoActivatePromise;
}

export interface PushNotificationsControlProps {
  headless?: boolean;
}

export default function PushNotificationsControl({ headless = false }: PushNotificationsControlProps) {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [configured, setConfigured] = useState(true);
  const [schemaReady, setSchemaReady] = useState(true);
  const [diagnostic, setDiagnostic] = useState<DiagnosticCode>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [activeCount, setActiveCount] = useState(0);
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(!headless);
  const [busy, setBusy] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const syncStatus = useCallback(async () => {
    if (!isPushSupported()) {
      setSupported(false);
      setLoading(false);
      return;
    }

    setSupported(true);
    const currentPerm = Notification.permission;
    setPermission(currentPerm);

    const user = dataService.getActiveUser();
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => null);
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      const existingSub = await reg?.pushManager.getSubscription();
      const query = existingSub?.endpoint ? `?endpoint=${encodeURIComponent(existingSub.endpoint)}` : '';

      const res = await fetch(`/api/notificaciones/push${query}`, {
        headers: await aiHeaders(),
        cache: 'no-store',
      });
      const body = (await res.json().catch(() => null)) as PushStatusResponse | null;

      if (!res.ok) {
        if (!headless) {
          setErrorMsg(resolveConfigError(body?.diagnostic, body?.error));
        }
        return;
      }

      if (body) {
        const isConfigured = Boolean(body.configured);
        const isSchemaReady = Boolean(body.schema_ready);
        setConfigured(isConfigured);
        setSchemaReady(isSchemaReady);
        setDiagnostic(body.diagnostic ?? null);
        setSubscribed(Boolean(body.subscribed));
        setActiveCount(Number(body.activeCount || 0));
        if (body.preferences) {
          setPrefs({ ...DEFAULT_PREFS, ...body.preferences });
        }

        if (!isConfigured || !isSchemaReady) {
          if (!headless) {
            setErrorMsg(resolveConfigError(body.diagnostic, body.error));
          }
          return;
        }

        if (!headless) {
          setErrorMsg((prev) =>
            prev && /VAPID|migración|SUPABASE_SERVICE_ROLE_KEY/i.test(prev) ? null : prev,
          );
        }

        // Activación automática por defecto si el navegador ya concedió permiso y no hubo opt-out manual.
        const optedOut = window.localStorage.getItem(OPT_OUT_KEY) === '1';
        if (currentPerm === 'granted' && !optedOut && (!existingSub || !body.subscribed)) {
          const autoResult = await runAutoActivate(false);
          if (autoResult.ok) {
            setSubscribed(true);
          }
        }
      }
    } catch {
      // Mantiene la interfaz limpia ante microcortes de red.
    } finally {
      setLoading(false);
    }
  }, [headless]);

  useEffect(() => {
    void syncStatus();
  }, [syncStatus]);

  useEffect(() => {
    if (!isPushSupported()) return;

    const handleSyncEvent = () => {
      void syncStatus();
    };
    window.addEventListener(PUSH_SYNC_EVENT, handleSyncEvent);

    const optedOut = window.localStorage.getItem(OPT_OUT_KEY) === '1';
    const alreadyPrompted = window.sessionStorage.getItem(PROMPTED_SESSION_KEY) === '1';
    if (Notification.permission === 'default' && !optedOut && !alreadyPrompted && !gestureListenerAttached) {
      gestureListenerAttached = true;
      const onFirstGesture = () => {
        if (window.localStorage.getItem(OPT_OUT_KEY) === '1') return;
        if (!dataService.getActiveUser()?.id) {
          gestureListenerAttached = false;
          return;
        }
        window.sessionStorage.setItem(PROMPTED_SESSION_KEY, '1');
        void runAutoActivate(true).then(() => {
          void syncStatus();
        });
      };
      document.addEventListener('pointerdown', onFirstGesture, { once: true, passive: true });
    }

    return () => {
      window.removeEventListener(PUSH_SYNC_EVENT, handleSyncEvent);
    };
  }, [syncStatus]);

  if (headless) {
    return null;
  }

  const handleEnable = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    setBusy(true);
    try {
      window.localStorage.removeItem(OPT_OUT_KEY);
      const result = await performDeviceSubscribe({
        allowPrompt: true,
        prefsOverride: prefs,
      });
      setPermission(Notification.permission);
      if (!result.ok) {
        setErrorMsg(result.error || 'No se pudieron activar las notificaciones.');
        return;
      }
      setStatusMsg('Notificaciones push activadas con el logo de ObraTrack en este dispositivo.');
      await syncStatus();
    } catch (err) {
      setErrorMsg((err as Error).message || 'No se pudieron activar las notificaciones.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    setBusy(true);
    try {
      window.localStorage.setItem(OPT_OUT_KEY, '1');
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      const sub = await reg?.pushManager.getSubscription();
      const endpoint = sub?.endpoint;
      if (sub) await sub.unsubscribe();

      await fetch('/api/notificaciones/push', {
        method: 'DELETE',
        headers: await aiHeaders(),
        body: JSON.stringify({ endpoint }),
      });

      setStatusMsg('Alertas push desactivadas en este dispositivo.');
      window.dispatchEvent(new CustomEvent(PUSH_SYNC_EVENT));
      await syncStatus();
    } catch (err) {
      setErrorMsg((err as Error).message || 'No se pudo desactivar el dispositivo.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleCategory = async (key: CategoryKey) => {
    const previousPreferences = { ...prefs };
    const next = { ...previousPreferences, [key]: !previousPreferences[key] };
    setPrefs(next);
    setSavingPrefs(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/notificaciones/push', {
        method: 'POST',
        headers: await aiHeaders(),
        body: JSON.stringify({ action: 'preferences', preferencias: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || 'Error al actualizar preferencias.');
      }
      setStatusMsg('Preferencias guardadas.');
    } catch (err) {
      setPrefs(previousPreferences);
      setErrorMsg((err as Error).message || 'Error guardando preferencia.');
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleTest = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    setBusy(true);
    try {
      const res = await fetch('/api/notificaciones/push', {
        method: 'POST',
        headers: await aiHeaders(),
        body: JSON.stringify({ action: 'test' }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; sent?: number } | null;
      if (!res.ok) {
        throw new Error(body?.error || 'No se pudo enviar la notificación de prueba.');
      }
      setStatusMsg(
        body?.sent
          ? 'Notificación de prueba enviada. Revisa la barra superior de tu dispositivo.'
          : 'No se encontró suscripción activa para recibir la prueba.',
      );
    } catch (err) {
      setErrorMsg((err as Error).message || 'Error enviando notificación de prueba.');
    } finally {
      setBusy(false);
    }
  };

  const serverReady = configured && schemaReady;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#263040] bg-gradient-to-br from-[#141A23] via-[#17202D] to-[#10151E] p-4 sm:p-5 text-gray-100 shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#FF6A00]/30 bg-[#FF6A00]/15 text-[#FF6A00]">
              {permission === 'denied' ? (
                <ShieldAlert className="h-5 w-5 text-red-400" />
              ) : subscribed ? (
                <BellRing className="h-5 w-5" />
              ) : (
                <Bell className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white tracking-tight">
                Notificaciones Push de ObraTrack
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Avisos nativos en Chrome y celular PWA con el logo oficial de ObraTrack, sin depender de WhatsApp.
              </p>
            </div>
          </div>

          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
              subscribed
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                : permission === 'denied'
                  ? 'border-red-500/40 bg-red-500/15 text-red-300'
                  : 'border-[#FF6A00]/40 bg-[#FF6A00]/15 text-[#FFA15C]'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                subscribed
                  ? 'bg-emerald-400'
                  : permission === 'denied'
                    ? 'bg-red-400'
                    : 'bg-[#FF6A00]'
              }`}
            />
            {loading
              ? 'Verificando...'
              : subscribed
                ? 'Activas en este dispositivo'
                : permission === 'denied'
                  ? 'Bloqueadas en Chrome'
                  : 'Pendiente de activar'}
          </span>
        </div>

        {!supported && (
          <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Este navegador no soporta Web Push. Usa Google Chrome en escritorio o la PWA instalada en Android.
          </p>
        )}

        {supported && permission === 'denied' && (
          <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            Las notificaciones están bloqueadas en este navegador. Habilítalas desde el ícono de candado junto a la URL en Chrome y luego presiona Reintentar.
          </p>
        )}

        {!serverReady && (
          <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {resolveConfigError(diagnostic)}
          </p>
        )}

        {supported && (
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            {!subscribed ? (
              <button
                type="button"
                disabled={busy || loading}
                onClick={handleEnable}
                className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8533] px-4 py-2 text-xs font-semibold text-white shadow-md shadow-[#FF6A00]/20 hover:from-[#e65f00] hover:to-[#ff7417] active:scale-[0.99] transition-all disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
                <span>{permission === 'denied' ? 'Reintentar activación' : 'Activar notificaciones push'}</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleTest}
                  className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-[#FF6A00]/45 bg-[#FF6A00]/15 px-3.5 py-2 text-xs font-semibold text-[#FFA15C] hover:bg-[#FF6A00]/25 hover:border-[#FF6A00] transition-all disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  <span>Enviar prueba</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleDisable}
                  className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-[#2F3B4E] bg-[#1C2432] px-3.5 py-2 text-xs font-semibold text-gray-200 hover:border-red-500/60 hover:bg-red-500/10 hover:text-red-300 transition-all disabled:opacity-50"
                >
                  <BellOff className="h-3.5 w-3.5" />
                  <span>Desactivar en este dispositivo</span>
                </button>
              </>
            )}

            {activeCount > 0 && (
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[#263040] bg-[#10151E] px-2.5 py-1 text-[11px] font-medium text-gray-300">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>
                  {activeCount} {activeCount === 1 ? 'dispositivo conectado' : 'dispositivos conectados'}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#263040] bg-[#141A23] text-gray-100 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#222B3A] bg-[#10151E]/90 px-4 py-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-200">
              Categorías de alerta
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Vienen activadas por defecto para que nadie pierda avisos críticos en obra o terreno.
            </p>
          </div>
          {savingPrefs && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#FFA15C]">
              <Loader2 className="h-3 w-3 animate-spin" />
              Guardando...
            </span>
          )}
        </div>

        <div className="divide-y divide-[#222B3A]">
          {CATEGORY_OPTIONS.map((item) => {
            const enabled = prefs[item.key];
            return (
              <div
                key={item.key}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-[#19212E]/70 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white">{item.label}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{item.desc}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={item.label}
                  disabled={savingPrefs}
                  onClick={() => void handleToggleCategory(item.key)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF6A00] disabled:opacity-60 ${
                    enabled
                      ? 'border-[#FF6A00] bg-[#FF6A00]'
                      : 'border-[#334055] bg-[#242E3F]'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      enabled ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {statusMsg && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-950/60 px-3.5 py-2.5 text-xs font-medium text-emerald-300"
        >
          <Check className="h-4 w-4 shrink-0" />
          <span>{statusMsg}</span>
        </p>
      )}

      {errorMsg && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-red-500/35 bg-red-950/60 px-3.5 py-2.5 text-xs font-medium text-red-300"
        >
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </p>
      )}
    </div>
  );
}
