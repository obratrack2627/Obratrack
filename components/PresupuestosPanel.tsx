"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, FolderPlus } from "lucide-react";
import { aiHeaders } from "@/lib/ai/client";
import { dataService } from "@/lib/data-service";
import {
  budgetStatuses,
  type Presupuesto,
  type BudgetStatus,
} from "@/lib/presupuestos";
import { convertirPresupuestoEnObra } from "@/lib/presupuestos-to-obra";
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
    [error, setError] = useState(""),
    [createdNotice, setCreatedNotice] = useState<{
      id: string;
      nombre: string;
      partidas: number;
      materiales: number;
    } | null>(null);
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
      return body.presupuesto as Presupuesto;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleConvertirEnObra(row: Presupuesto) {
    setError("");
    try {
      const resultado = convertirPresupuestoEnObra(row.cotizacion);
      setProjects(dataService.getProyectos());
      window.dispatchEvent(new Event("obratrack_cloud_synced"));
      await update(row, {
        estado: "aprobada",
        proyecto_id: resultado.proyecto.id,
      });
      setCreatedNotice({
        id: resultado.proyecto.id,
        nombre: resultado.proyecto.nombre,
        partidas: resultado.actividadesCreadas,
        materiales: resultado.materialesCargados,
      });
    } catch (e) {
      setError((e as Error).message);
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
        <h2 className="text-xl font-bold text-navy-900 dark:text-white">
          Presupuestos
        </h2>
        <div className="flex gap-3 items-center">
          <button
            disabled={busy}
            onClick={refresh}
            className="text-sm underline text-gray-700 dark:text-gray-300"
          >
            {busy ? "Actualizando…" : "Actualizar"}
          </button>
          <Link
            href={projectId ? `/proyectos/${projectId}/ia` : "/cotizador"}
            className="rounded-xl bg-obra-orange hover:bg-obra-orange-hover px-4 py-2 text-white text-sm font-semibold transition-colors"
          >
            Nuevo presupuesto
          </Link>
        </div>
      </div>

      {createdNotice && (
        <div
          role="status"
          className="rounded-2xl border border-emerald-300 dark:border-emerald-700/60 bg-emerald-50 dark:bg-emerald-950/40 p-4 flex flex-wrap items-center justify-between gap-3 text-sm"
        >
          <div className="text-emerald-900 dark:text-emerald-200">
            <p className="font-bold">
              Obra creada exitosamente: {createdNotice.nombre}
            </p>
            <p className="text-xs opacity-90">
              Se precargaron {createdNotice.partidas} partidas en Carta Gantt y{" "}
              {createdNotice.materiales} materiales cubicados en Finanzas.
            </p>
          </div>
          <Link
            href={`/proyectos/${createdNotice.id}/gantt`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-3.5 py-2 text-xs font-bold text-white transition-colors"
          >
            <span>Abrir Obra</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Buscar presupuesto"
          placeholder="Buscar obra o cliente"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-2 text-sm"
        />
        <select
          aria-label="Filtrar por estado"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-2 text-sm"
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
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      {!busy && !error && !visible.length && (
        <div className="rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-8 text-center text-gray-600 dark:text-gray-400">
          {rows.length
            ? "No hay presupuestos con estos filtros."
            : "Tus cotizaciones de la plataforma y WhatsApp aparecerán aquí."}
        </div>
      )}

      {visible.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23]">
          <table className="w-full text-sm text-left">
            <thead className="bg-kraft-100 dark:bg-[#0B0F14]">
              <tr>
                {[
                  "Presupuesto",
                  "Total con IVA",
                  "Estado",
                  "Obra asociada",
                  "Acciones",
                ].map((h) => (
                  <th key={h} className="p-3 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const canConvert =
                  !row.proyecto_id &&
                  row.estado !== "anulada" &&
                  row.estado !== "rechazada";
                return (
                  <tr
                    key={row.id}
                    className="border-t border-kraft-200 dark:border-[#263040]"
                  >
                    <td className="p-3">
                      <p className="font-semibold text-navy-900 dark:text-white">
                        {row.cotizacion.titulo_proyecto}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {row.cotizacion.cliente_nombre || "Sin cliente asignado"}{" "}
                        · {formatDate(row.created_at)} ·{" "}
                        {row.origen === "whatsapp" ? "WhatsApp" : "Plataforma"}
                      </p>
                    </td>
                    <td className="p-3 font-mono whitespace-nowrap font-semibold">
                      {formatCLP(
                        row.cotizacion.estructura_financiera
                          .precio_total_con_iva,
                      )}
                    </td>
                    <td className="p-3">
                      <select
                        disabled={busy}
                        aria-label={`Estado de ${row.cotizacion.titulo_proyecto}`}
                        value={row.estado}
                        onChange={(e) =>
                          void update(row, {
                            estado: e.target.value as BudgetStatus,
                          })
                        }
                        className="rounded-lg border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#0B0F14] p-2"
                      >
                        {budgetStatuses.map((s) => (
                          <option key={s} value={s}>
                            {labels[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          disabled={busy}
                          aria-label={`Obra de ${row.cotizacion.titulo_proyecto}`}
                          value={row.proyecto_id || ""}
                          onChange={(e) =>
                            void update(row, {
                              proyecto_id: e.target.value || null,
                            })
                          }
                          className="rounded-lg border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#0B0F14] p-2 max-w-48"
                        >
                          <option value="">Sin asociar</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre}
                            </option>
                          ))}
                        </select>
                        {row.proyecto_id && (
                          <Link
                            href={`/proyectos/${row.proyecto_id}/finanzas`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-obra-green hover:underline whitespace-nowrap"
                          >
                            <span>Ver obra</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="text-obra-orange font-semibold whitespace-nowrap hover:underline"
                          onClick={() => setSelected(row)}
                        >
                          Ver / PDF
                        </button>
                        {canConvert && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleConvertirEnObra(row)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#6B8F72] hover:bg-emerald-700 disabled:opacity-50 px-2.5 py-1.5 text-xs font-bold text-white whitespace-nowrap transition-colors"
                          >
                            <FolderPlus className="w-3.5 h-3.5" />
                            <span>Convertir en Obra</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
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
