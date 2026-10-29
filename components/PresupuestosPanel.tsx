"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { aiHeaders } from "@/lib/ai/client";
import { dataService } from "@/lib/data-service";
import {
  budgetStatuses,
  type Presupuesto,
  type BudgetStatus,
} from "@/lib/presupuestos";
import { formatCLP, formatDate } from "@/lib/utils";
import CotizacionPdfModal from "./CotizacionPdfModal";

const labels: Record<BudgetStatus, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  anulada: "Anulada",
};
export default function PresupuestosPanel({
  projectId,
}: {
  projectId?: string;
}) {
  const [rows, setRows] = useState<Presupuesto[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [filter, setFilter] = useState("todos"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<Presupuesto | null>(null);
  const [projects, setProjects] = useState<{ id: string; nombre: string }[]>(
    [],
  );
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        "/api/presupuestos" +
          (projectId ? "?proyecto_id=" + encodeURIComponent(projectId) : ""),
        { headers: await aiHeaders() },
      );
      const body = await res.json();
      if (!res.ok)
        throw new Error(body.error || "No se pudo cargar el listado.");
      setRows(body.presupuestos);
      setProjects(dataService.getProyectos());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, [projectId]);
  async function update(
    row: Presupuesto,
    changes: { estado?: BudgetStatus; proyecto_id?: string | null },
  ) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/presupuestos", {
        method: "PATCH",
        headers: await aiHeaders(),
        body: JSON.stringify({
          id: row.id,
          updated_at: row.updated_at,
          estado: row.estado,
          ...changes,
        }),
      });
      const body = await res.json();
      if (!res.ok)
        throw new Error(body.error || "No se pudo guardar el cambio.");
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? body.presupuesto : r)),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visible = rows.filter(
    (r) =>
      (filter === "todos" || r.estado === filter) &&
      `${r.cotizacion.titulo_proyecto} ${r.cotizacion.cliente_nombre || ""}`
        .toLocaleLowerCase("es")
        .includes(search.toLocaleLowerCase("es")),
  );
  return (
    <section className="space-y-4" aria-label="Presupuestos de obras">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Presupuestos</h2>
        <div className="flex gap-3">
          <button
            disabled={busy}
            onClick={refresh}
            className="text-sm underline"
          >
            {busy ? "Actualizando…" : "Actualizar"}
          </button>
          <Link
            href={projectId ? `/proyectos/${projectId}/ia` : "/cotizador"}
            className="rounded-xl bg-obra-orange px-4 py-2 text-white text-sm"
          >
            Nuevo presupuesto
          </Link>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Buscar presupuesto"
          placeholder="Buscar obra o cliente"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-xl border p-2 text-sm"
        />
        <select
          aria-label="Filtrar por estado"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-xl border p-2 text-sm"
        >
          <option value="todos">Todos los estados</option>
          {budgetStatuses.map((s) => (
            <option key={s} value={s}>
              {labels[s]}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {!busy && !error && !visible.length && (
        <div className="rounded-2xl border bg-white p-8 text-center text-gray-600">
          {rows.length
            ? "No hay presupuestos con estos filtros."
            : "Tus cotizaciones de la plataforma y WhatsApp aparecerán aquí."}
        </div>
      )}
      {visible.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border bg-white">
          <table className="w-full text-sm text-left">
            <thead className="bg-kraft-100">
              <tr>
                {[
                  "Presupuesto",
                  "Total con IVA",
                  "Estado",
                  "Obra asociada",
                  "Detalle",
                ].map((h) => (
                  <th key={h} className="p-3 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="p-3">
                    <p className="font-semibold">
                      {row.cotizacion.titulo_proyecto}
                    </p>
                    <p className="text-xs text-gray-500">
                      {row.cotizacion.cliente_nombre || "Sin cliente asignado"}{" "}
                      · {formatDate(row.created_at)} ·{" "}
                      {row.origen === "whatsapp" ? "WhatsApp" : "Plataforma"}
                    </p>
                  </td>
                  <td className="p-3 font-mono whitespace-nowrap">
                    {formatCLP(
                      row.cotizacion.estructura_financiera.precio_total_con_iva,
                    )}
                  </td>
                  <td className="p-3">
                    <select
                      disabled={busy}
                      aria-label={`Estado de ${row.cotizacion.titulo_proyecto}`}
                      value={row.estado}
                      onChange={(e) =>
                        update(row, { estado: e.target.value as BudgetStatus })
                      }
                      className="rounded-lg border p-2"
                    >
                      {budgetStatuses.map((s) => (
                        <option key={s} value={s}>
                          {labels[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3">
                    <select
                      disabled={busy}
                      aria-label={`Obra de ${row.cotizacion.titulo_proyecto}`}
                      value={row.proyecto_id || ""}
                      onChange={(e) =>
                        update(row, { proyecto_id: e.target.value || null })
                      }
                      className="rounded-lg border p-2 max-w-48"
                    >
                      <option value="">Sin asociar</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3">
                    <button
                      className="text-obra-orange font-semibold whitespace-nowrap"
                      onClick={() => setSelected(row)}
                    >
                      Ver / PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <CotizacionPdfModal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        cotizacion={selected?.cotizacion || null}
        clienteNombre={selected?.cotizacion.cliente_nombre}
        clienteTelefono={selected?.cotizacion.cliente_telefono}
      />
    </section>
  );
}
