"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { aiHeaders } from "@/lib/ai/client";
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
  return (
    <section className="space-y-4" aria-label="Avisos enviados al equipo">
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
          className="rounded-xl bg-red-50 p-3 text-red-800 text-sm"
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
          className="rounded-2xl border bg-white p-4 sm:p-5 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">
              Aviso a {row.destinatarios} destinatario(s)
            </p>
            <p className="text-xs text-gray-500">
              {date(row.created_at)} ·{" "}
              {row.origen === "whatsapp" ? "WhatsApp" : "Plataforma"}
            </p>
          </div>
          <p className="text-sm whitespace-pre-wrap break-words">
            {row.mensaje}
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(row.estados || {}).map(([state, count]) => (
              <span
                key={state}
                className={`text-xs rounded-full px-2 py-1 ${["entregado", "leido"].includes(state) ? "bg-green-50 text-green-800" : ["fallido", "por_verificar", "sin_telefono"].includes(state) ? "bg-red-50 text-red-800" : "bg-kraft-100 text-gray-700"}`}
              >
                {labels[state] || state}: {String(count)}
              </span>
            ))}
          </div>
          <div className="flex gap-4 text-sm">
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
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
                      <td className="p-2">
                        {d.nombre}
                        <p className="text-xs text-gray-500">
                          {d.rol === "terreno"
                            ? "Terreno"
                            : d.rol === "supervisor"
                              ? "Supervisión"
                              : "Administración"}
                        </p>
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {d.telefono ? "+" + d.telefono : "Sin registrar"}
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {labels[d.estado] || d.estado}
                      </td>
                      <td className="p-2 text-xs text-gray-600">
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
    </section>
  );
}
