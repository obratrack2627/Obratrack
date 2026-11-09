"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { dataService } from "@/lib/data-service";

// Mantener una sola sincronización activa, también al regresar desde otra app móvil.
export default function CloudSync() {
  const pathname = usePathname();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const retry = useRef(() => {});

  useEffect(() => {
    let disposed = false;
    let running = false;
    let requested = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const offlineMessage =
      "Sin conexión. Mostrando los últimos datos guardados.";

    async function sync() {
      if (disposed || document.visibilityState === "hidden") return;
      if (running) {
        requested = true;
        return;
      }
      if (!navigator.onLine) {
        setError(offlineMessage);
        return;
      }
      const active = dataService.getActiveUser();
      if (!active?.empresa_id) return;
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
          if (requested) request();
        }
      }
    }

    function request() {
      clearTimeout(timer);
      timer = setTimeout(() => void sync(), 150);
    }
    const storageChanged = (event: StorageEvent) => {
      if (event.key === `obratrack_proyectos_v7_${dataService.getActiveUser()?.empresa_id}`) {
        window.dispatchEvent(new Event('obratrack_cloud_synced'));
        request();
      }
    };
    window.addEventListener('storage', storageChanged);
    const offline = () => setError(offlineMessage);
    retry.current = request;
    window.addEventListener("focus", request);
    window.addEventListener("pageshow", request);
    window.addEventListener("online", request);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", request);
    const interval = setInterval(() => void sync(), 30000);
    void sync();
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("storage", storageChanged);
      window.removeEventListener("focus", request);
      window.removeEventListener("pageshow", request);
      window.removeEventListener("online", request);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", request);
    };
  }, [pathname]);

  if (!error) return null;
  return (
    <div
      role="status"
      className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <span>{error}</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => retry.current()}
        className="font-semibold underline disabled:opacity-50"
      >
        {busy ? "Actualizando…" : "Reintentar sincronización"}
      </button>
    </div>
  );
}
