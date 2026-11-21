"use client";
import SyncConflictDialog from './SyncConflictDialog';

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { WifiOff } from "lucide-react";
import { dataService } from "@/lib/data-service";

// Mantener una sola sincronización activa, también al regresar desde otra app móvil.
export default function CloudSync() {
  const pathname = usePathname();
  const [error, setError] = useState("");
  const [isOffline, setIsOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conflict,setConflict]=useState(false);
  const [review,setReview]=useState(false);
  const retry = useRef(() => {});
  const lastSyncRef = useRef<{ identity: string; at: number }>({ identity: "", at: 0 });

  useEffect(() => {
    let disposed = false;
    let running = false;
    let requested = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const offlineMessage =
      "Sin conexión. Mostrando los últimos datos guardados.";

    async function sync(force = false) {
      if (disposed || document.visibilityState === "hidden") return;
      if (running) {
        requested = true;
        return;
      }
      if (!navigator.onLine) {
        setIsOffline(true);
        setError(offlineMessage);
        return;
      }
      setIsOffline(false);
      const active = dataService.getActiveUser();
      if (!active?.empresa_id) return;
      const identity = `${active.id}:${active.empresa_id}`;
      const hasDirty = dataService.pendingCloudChanges() > 0;
      if (!force && !hasDirty && lastSyncRef.current.identity === identity && Date.now() - lastSyncRef.current.at < 12000) {
        return;
      }
      running = true;
      requested = false;
      setBusy(true);
      try {
        // Reintentar las ediciones pendientes antes de leer lo hecho en otro dispositivo.
        const pushed = await dataService.pushToCloudServer();
        const current = dataService.getActiveUser();
        if (
          disposed ||
          current?.id !== active.id ||
          current?.empresa_id !== active.empresa_id
        )
          return;
        const pulled = await dataService.pullFromCloudServer();
        const latest = dataService.getActiveUser();
        if (
          !disposed &&
          latest?.id === active.id &&
          latest?.empresa_id === active.empresa_id
        ) {
          if (pulled.success && pushed.success) {
            lastSyncRef.current = { identity, at: Date.now() };
          }
          setConflict(dataService.hasSyncConflict());
          setError(
            !pulled.success
              ? pulled.message
              : !pushed.success
                ? pushed.message
                : "",
          );
        }
      } catch {
        if (!disposed)
          setError(
            "No se pudieron actualizar los datos. Reintenta la sincronización.",
          );
      } finally {
        running = false;
        if (!disposed) {
          setBusy(false);
          if (requested) request(true);
        }
      }
    }

    function request(force = true) {
      clearTimeout(timer);
      timer = setTimeout(() => void sync(force), 150);
    }
    const storageChanged = (event: StorageEvent) => {
      if (event.key === `obratrack_proyectos_v7_${dataService.getActiveUser()?.empresa_id}`) {
        window.dispatchEvent(new Event('obratrack_cloud_synced'));
        request(true);
      }
    };
    window.addEventListener('storage', storageChanged);
    const offline = () => {
      setIsOffline(true);
      setError(offlineMessage);
    };
    const triggerRequest = () => {
      if (navigator.onLine) setIsOffline(false);
      request(true);
    };
    retry.current = triggerRequest;
    window.addEventListener("obratrack_pending_changed", triggerRequest);
    window.addEventListener("focus", triggerRequest);
    window.addEventListener("pageshow", triggerRequest);
    window.addEventListener("online", triggerRequest);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", triggerRequest);
    const interval = setInterval(() => void sync(true), 30000);
    void sync(false);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("storage", storageChanged);
      window.removeEventListener("obratrack_pending_changed", triggerRequest);
      window.removeEventListener("focus", triggerRequest);
      window.removeEventListener("pageshow", triggerRequest);
      window.removeEventListener("online", triggerRequest);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", triggerRequest);
    };
  }, [pathname]);

  if (!error && !conflict) return null;
  return (<>
    {review&&<SyncConflictDialog onClose={()=>setReview(false)} onResolved={()=>{setConflict(false);setError('');retry.current();}}/>}
    <div
      role="status"
      aria-live="polite"
      className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <span className="inline-flex items-center gap-2">
        {isOffline && <WifiOff className="w-4 h-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />}
        <span>{error || 'Hay cambios más recientes que debes revisar antes de guardar.'}</span>
      </span>
      {conflict&&<button type="button" disabled={busy} onClick={()=>setReview(true)} className="min-h-11 font-semibold underline disabled:opacity-50">Revisar cambios</button>}
      <button
        type="button"
        disabled={busy}
        onClick={() => retry.current()}
        className="font-semibold underline disabled:opacity-50"
      >
        {busy ? "Actualizando…" : "Reintentar sincronización"}
      </button>
    </div></>
  );
}
