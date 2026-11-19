"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Trash2 } from "lucide-react";
import { aiHeaders } from "@/lib/ai/client";
import MaskedField from "@/components/MaskedField";
import ModalOverlay from "@/components/ModalOverlay";
import { maskPhone } from "@/lib/privacy/mask";
const labels: Record<string, string> = {
  pendiente: "Pendiente",
  procesando: "En proceso",
  aceptado: "Aceptado por Meta",
  enviado: "Enviado",
  entregado: "Entregado",
  leido: "Leído",
  fallido: "Fallido",
  esperando_plantilla: "Esperando plantilla",
  por_verificar: "Por verificar",
  sin_telefono: "Sin teléfono",
};
const date = (v: string) =>
  new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(v));
export default function WhatsAppAvisosPanel() {
  const [rows, setRows] = useState<any[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null),
    [details, setDetails] = useState<any[]>([]);
  const [avisoToDelete, setAvisoToDelete] = useState<{ id: string; preview: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  async function recipients(id: string) {
    const r = await fetch("/api/whatsapp/avisos?id=" + encodeURIComponent(id), {
      headers: await aiHeaders(),
    });
    const body = await r.json();
    if (!r.ok)
      throw Error(body.error || "No se pudieron cargar los destinatarios.");
    setDetails(body.envios || []);
  }
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/whatsapp/avisos?pagina=" + page, {
        headers: await aiHeaders(),
      });
      const body = await r.json();
      if (!r.ok) throw Error(body.error || "No se pudieron cargar los avisos.");
      setRows(body.avisos);
      setTotal(body.total);
      if (open) await recipients(open);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [page, open]);
  async function retry(id: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/whatsapp/avisos", {
        method: "POST",
        headers: await aiHeaders(),
        body: JSON.stringify({ id }),
      });
      const body = await r.json();
      if (!r.ok) throw Error(body.error || "No se pudo reintentar el envío.");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirmDeleteAviso() {
    if (!avisoToDelete || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const r = await fetch(
        `/api/whatsapp/avisos?id=${encodeURIComponent(avisoToDelete.id)}`,
        { method: "DELETE", headers: await aiHeaders() },
      );
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(body.error || "No se pudo eliminar el aviso.");
      }
      setRows((prev) => prev.filter((item) => item.id !== avisoToDelete.id));
      setTotal((prev) => Math.max(0, prev - 1));
      if (open === avisoToDelete.id) {
        setOpen(null);
        setDetails([]);
      }
      setAvisoToDelete(null);
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }
  return (
    <section className="min-w-0 space-y-4" aria-label="Avisos enviados al equipo">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h3 className="font-bold text-lg">
            Avisos enviados{" "}
            <span className="text-sm text-gray-500 font-normal">({total})</span>
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            La entrega se confirma cuando WhatsApp informa el resultado.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            disabled={busy}
            onClick={() => void refresh()}
            className="text-sm underline"
          >
            Actualizar envíos
          </button>
          <Link
            href="/cotizador"
            className="rounded-xl bg-obra-orange px-3 py-2 text-white text-sm"
          >
            Nuevo aviso
          </Link>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 p-3 text-red-800 dark:text-red-300 text-sm"
        >
          {error}
        </p>
      )}
      {!busy && !error && !rows.length && (
        <div className="rounded-2xl border bg-white p-8 text-center text-sm text-gray-500">
          Los avisos que pidas enviar al equipo aparecerán aquí.
        </div>
      )}
      {rows.map((row) => (
        <article
          key={row.id}
          className="min-w-0 rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-4 sm:p-5 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">
              Aviso a {row.destinatarios} destinatario(s)
            </p>
            <div className="flex items-center gap-2">
              <p className="text-xs text-gray-500">
                {date(row.created_at)} ·{" "}
                {row.origen === "whatsapp" ? "WhatsApp" : "Plataforma"}
              </p>
              <button
                type="button"
                aria-label={`Eliminar aviso (${String(row.mensaje || "").slice(0, 40)})`}
                title="Eliminar aviso"
                onClick={() => {
                  setDeleteError("");
                  setAvisoToDelete({
                    id: row.id,
                    preview:
                      String(row.mensaje || "").length > 80
                        ? `${String(row.mensaje).slice(0, 80)}…`
                        : String(row.mensaje || "Aviso enviado"),
                  });
                }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-sm whitespace-pre-wrap break-words">
            {row.mensaje}
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(row.estados || {}).map(([state, count]) => (
              <span
                key={state}
                className={`text-xs rounded-full px-2 py-1 ${["entregado", "leido"].includes(state) ? "bg-green-50 dark:bg-emerald-950/40 text-green-800 dark:text-emerald-300" : ["fallido", "por_verificar", "sin_telefono"].includes(state) ? "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300" : "bg-kraft-100 text-gray-700"}`}
              >
                {labels[state] || state}: {String(count)}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <button
              className="underline"
              onClick={() => {
                setError("");
                setDetails([]);
                setOpen(open === row.id ? null : row.id);
              }}
            >
              {" "}
              {open === row.id ? "Ocultar destinatarios" : "Ver destinatarios"}
            </button>
            {(row.estados?.fallido || row.estados?.sin_telefono) && (
              <button
                disabled={busy}
                className="underline text-obra-orange"
                onClick={() => void retry(row.id)}
              >
                Reintentar fallidos
              </button>
            )}
          </div>
          {open === row.id && (
            <div className="min-w-0 max-w-full">
              <table className="recipient-table w-full table-fixed text-sm text-left">
                <thead>
                  <tr>
                    {["Destinatario", "Teléfono", "Estado", "Detalle"].map(
                      (h) => (
                        <th key={h} className="p-2 border-b">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {details.map((d) => (
                    <tr key={d.id}>
                      <td data-label="Destinatario" className="p-2 break-words">
                        {d.nombre}
                        <p className="text-xs text-gray-500">
                          {d.rol === "terreno"
                            ? "Terreno"
                            : d.rol === "supervisor"
                              ? "Supervisión"
                              : "Administración"}
                        </p>
                      </td>
                      <td data-label="Teléfono" className="p-2 break-words">
                        {d.telefono ? (
                          <MaskedField
                            value={`+${d.telefono}`}
                            masked={maskPhone(d.telefono)}
                            label={`teléfono de ${d.nombre}`}
                            resourceType="whatsapp_envio"
                            resourceId={d.id}
                            fieldName="telefono"
                            className="text-xs"
                          />
                        ) : (
                          "Sin registrar"
                        )}
                      </td>
                      <td data-label="Estado" className="p-2 break-words">
                        {labels[d.estado] || d.estado}
                      </td>
                      <td data-label="Detalle" className="p-2 text-xs text-gray-600 dark:text-gray-300 break-words">
                        {d.error_detalle || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      ))}
      {total > 20 && (
        <div className="flex justify-between text-sm">
          <button
            disabled={!page || busy}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </button>
          <span>Página {page + 1}</span>
          <button
            disabled={(page + 1) * 20 >= total || busy}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </button>
        </div>
      )}
      {avisoToDelete && (
        <ModalOverlay
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar eliminación de aviso"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <span className="p-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 shrink-0">
                <Trash2 className="w-4 h-4" />
              </span>
              <div className="min-w-0 space-y-1">
                <h3 className="font-heading font-bold text-base text-navy-900 dark:text-white">
                  Eliminar aviso
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-300 break-words">
                  Se eliminará el aviso &ldquo;{avisoToDelete.preview}&rdquo; y su historial de entregas. Esta acción no se puede deshacer.
                </p>
              </div>
            </div>
            {deleteError && (
              <p role="alert" className="text-xs text-red-700 dark:text-red-400">
                {deleteError}
              </p>
            )}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  setAvisoToDelete(null);
                  setDeleteError("");
                }}
                className="px-3.5 py-2 rounded-xl border border-kraft-200 dark:border-[#263040] text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-kraft-50 dark:hover:bg-[#1E2530] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void confirmDeleteAviso()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold disabled:opacity-50"
              >
                {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{deleting ? "Eliminando…" : "Eliminar"}</span>
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </section>
  );
}
