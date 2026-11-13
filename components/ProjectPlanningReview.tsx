"use client";
import { useState, useRef } from "react";
import { dataService } from "@/lib/data-service";
import {
  materialNeeds,
  rescheduleSuggestion,
} from "@/lib/construction-workflow";
import { chileToday } from "@/lib/work-calendar";
import { formatDate } from "@/lib/utils";
import { crewInput, crewPrimary } from "./CrewAttendanceEditor";
import type { Proyecto } from "@/types/database";
export default function ProjectPlanningReview({
  project,
  onChanged,
}: {
  project: Proyecto;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reason, setReason] = useState(""),
    [delivery, setDelivery] = useState(false);
  const operation = useRef("");
  const tasks = dataService.getActividades(project.id),
    overdue = tasks.filter(
      (row) => row.porcentaje_avance < 100 && row.fecha_termino < chileToday(),
    );
  const needs = materialNeeds(
    dataService.getMaterialesProyecto(project.id),
    tasks,
    dataService.getBitacora(project.id),
  );
  const proposal = rescheduleSuggestion(project, tasks);
  if (!overdue.length && !needs.length) return null;
  return (
    <section className="min-w-0 space-y-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
      <h2 className="font-bold">Revisión de próximas faenas</h2>
      {overdue.length > 0 && (
        <p className="text-sm">
          {overdue.length} partidas con plazo vencido y trabajo pendiente.
        </p>
      )}
      {needs.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm">
            Materiales por recibir para faenas próximas ({needs.length})
          </summary>
          <ul className="mt-2 space-y-2 text-sm">
            {needs.map((row, index) => (
              <li key={index} className="break-words">
                {row.material}: faltan {row.pendiente} {row.unidad} ·{" "}
                {row.actividad}, inicio {formatDate(row.fecha)}
              </li>
            ))}
          </ul>
        </details>
      )}
      {proposal.length > 0 &&
        !["cancelada", "terminado"].includes(project.estado) && (
          <button
            type="button"
            className="text-sm font-semibold underline"
            onClick={() => setOpen(!open)}
          >
            {open ? "Cerrar propuesta" : "Revisar reprogramación sugerida"}
          </button>
        )}
      {open && (
        <form
          className="space-y-3 border-t border-amber-200 pt-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              operation.current ||= "plan-" + crypto.randomUUID();
              await dataService.gestionarObra(project.id, "gestion", {
                operacion: "reprogramar",
                id: operation.current,
                tareas: proposal,
                ajustar_entrega: delivery,
                motivo: reason,
              });
              operation.current = "";
              setOpen(false);
              onChanged();
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "No se pudo guardar la reprogramación.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="text-xs text-gray-600 dark:text-gray-300">
            Desplaza las partidas pendientes según el atraso y ajusta las fechas
            a los días laborables configurados. Conserva el inicio de las
            partidas en curso y las terminadas. Revisa la secuencia antes de
            confirmar.
          </p>
          <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
            {proposal.map((row) => (
              <li
                key={row.id}
                className="rounded-lg bg-white p-3 dark:bg-gray-900"
              >
                <strong className="break-words">{row.nombre}</strong>
                <p className="mt-1 text-xs">
                  {formatDate(row.anterior_inicio)} –{" "}
                  {formatDate(row.anterior_termino)} →{" "}
                  {formatDate(row.fecha_inicio)} –{" "}
                  {formatDate(row.fecha_termino)}
                </p>
              </li>
            ))}
          </ul>
          <label className="block text-sm font-semibold">
            Motivo
            <textarea
              required
              maxLength={2000}
              disabled={busy}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={`${crewInput} mt-1`}
              placeholder="Ej.: suspensión por lluvia o atraso de materiales"
            />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              disabled={busy}
              checked={delivery}
              onChange={(e) => setDelivery(e.target.checked)}
            />
            Actualizar también la fecha de entrega de la obra según el nuevo
            Gantt
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <button type="submit" className={crewPrimary} disabled={busy}>
            {busy ? "Guardando…" : "Confirmar reprogramación"}
          </button>
        </form>
      )}
    </section>
  );
}
