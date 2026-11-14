"use client";
import { useState, useRef, useId } from "react";
import { CalendarDays, ChevronDown, Clock3, Hammer, Info, Package, PackageCheck } from "lucide-react";
import { dataService } from "@/lib/data-service";
import {
  materialNeeds,
  rescheduleSuggestion,
} from "@/lib/construction-workflow";
import { chileToday, addCalendarDays } from "@/lib/work-calendar";
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
  const titleId = useId();
  const proposalId = useId();
  const today = chileToday();
  const tasks = dataService.getActividades(project.id),
    overdue = tasks.filter(
      (row) => row.porcentaje_avance < 100 && row.fecha_termino < today,
    );
  const needs = materialNeeds(
    dataService.getMaterialesProyecto(project.id),
    tasks,
    dataService.getBitacora(project.id),
    today,
  );
  const byTask = new Map<string, { actividad: string; fecha: string; materiales: typeof needs }>();
  for (const row of needs.slice().sort((a, b) => a.fecha.localeCompare(b.fecha) || a.actividad.localeCompare(b.actividad, 'es-CL'))) {
    const key = JSON.stringify([row.actividad, row.fecha]);
    const group = byTask.get(key) || { actividad: row.actividad, fecha: row.fecha, materiales: [] };
    group.materiales.push(row);
    byTask.set(key, group);
  }
  const groups = Array.from(byTask.values());
  const quantity = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 6 });
  const proposal = rescheduleSuggestion(project, tasks, today);
  if (!overdue.length && !needs.length) return null;
  return (
    <section aria-labelledby={titleId} className="min-w-0 overflow-hidden rounded-2xl border border-kraft-200 bg-white shadow-sm dark:border-[#263040] dark:bg-[#141A23]">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-obra-orange dark:bg-orange-950/40">
            <PackageCheck size={21} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="font-heading text-base font-bold text-navy-900 dark:text-gray-100">Preparación de faenas</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              Revisa los materiales por recibir y las partidas con atraso para organizar el trabajo.
            </p>
          </div>
        </div>
        {needs.length > 0 && <span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-orange-100 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-200">
          <Package size={14} aria-hidden="true" />
          {needs.length} {needs.length === 1 ? 'material por recibir' : 'materiales por recibir'}
        </span>}
      </div>

      {needs.length > 0 && (
        <div className="space-y-4 border-t border-kraft-100 p-4 sm:p-5 dark:border-[#263040]">
          <div>
            <h3 className="text-sm font-bold text-navy-900 dark:text-gray-100">Materiales pendientes de recepción</h3>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Las cantidades indican lo que falta recibir en la obra, aunque el material ya esté comprado.
              {' '}{groups.length === 1 ? 'Corresponden a una faena pendiente' : `Corresponden a ${groups.length} faenas pendientes`}, con inicio previsto hasta el {formatDate(addCalendarDays(today, 7))}.
            </p>
          </div>
          <div className="grid min-w-0 items-start gap-3 lg:grid-cols-2">
            {groups.map(group => (
              <article key={JSON.stringify([group.actividad, group.fecha])} className="min-w-0 overflow-hidden rounded-xl border border-kraft-200 dark:border-[#263040]">
                <div className="space-y-2 border-b border-kraft-200 bg-kraft-50 px-3.5 py-3 dark:border-[#263040] dark:bg-[#0B0F14]">
                  <div className="flex min-w-0 items-start gap-2">
                    <Hammer size={16} className="mt-0.5 shrink-0 text-obra-orange" aria-hidden="true" />
                    <h4 className="min-w-0 break-words text-sm font-semibold leading-relaxed text-navy-900 dark:text-gray-100">{group.actividad}</h4>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} aria-hidden="true" />Inicio previsto: {formatDate(group.fecha)}</span>
                    <span>{group.materiales.length} {group.materiales.length === 1 ? 'material pendiente' : 'materiales pendientes'}</span>
                  </div>
                </div>
                <ul className="divide-y divide-kraft-100 dark:divide-[#263040]">
                  {group.materiales.map((row, index) => (
                    <li key={index} className="grid min-w-0 gap-2 px-3.5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                      <p className="min-w-0 break-words text-sm leading-relaxed text-gray-700 dark:text-gray-200">{row.material}</p>
                      <div className="w-fit max-w-full rounded-lg bg-amber-50 px-2.5 py-1.5 sm:max-w-40 sm:text-right dark:bg-amber-950/30">
                        <p className="break-words text-sm font-bold tabular-nums text-amber-900 dark:text-amber-100">{quantity.format(row.pendiente)} {row.unidad}</p>
                        <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-200">Por recibir</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <p className="flex items-start gap-2 rounded-xl bg-kraft-50 p-3 text-xs leading-relaxed text-gray-500 dark:bg-[#0B0F14] dark:text-gray-400">
            <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            Registra las recepciones en Finanzas y materiales → Materiales. Este listado se actualiza con las cantidades recibidas.
          </p>
        </div>
      )}

      {overdue.length > 0 && (
        <div className="border-t border-kraft-200 p-4 sm:p-5 dark:border-[#263040]">
          <div className="flex min-w-0 items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 dark:border-amber-900/60 dark:bg-amber-950/20">
            <Clock3 size={18} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
            <div className="min-w-0 space-y-1.5">
              <h3 className="text-sm font-semibold text-amber-950 dark:text-amber-100">{overdue.length} {overdue.length === 1 ? 'partida con atraso' : 'partidas con atraso'}</h3>
              <p className="text-xs leading-relaxed text-amber-900/80 dark:text-amber-200">{overdue.length === 1 ? 'Tiene trabajo pendiente y superó su fecha de término.' : 'Tienen trabajo pendiente y superaron su fecha de término.'}</p>
              {proposal.length > 0 && !['cancelada', 'terminado'].includes(project.estado) && <>
                <p className="text-xs leading-relaxed text-amber-900/80 dark:text-amber-200">Puedes revisar una propuesta de nuevas fechas antes de guardar cualquier cambio.</p>
                <button type="button" disabled={busy} aria-expanded={open} aria-controls={proposalId} onClick={() => setOpen(!open)} className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg text-left text-sm font-semibold text-amber-950 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-obra-orange disabled:opacity-50 dark:text-amber-100">
                  <span>{open ? 'Cerrar propuesta' : 'Revisar reprogramación sugerida'}</span>
                  <ChevronDown size={16} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
              </>}
            </div>
          </div>
        </div>
      )}
      {open && (
        <form
          id={proposalId}
          className="space-y-4 border-t border-kraft-200 p-4 sm:p-5 dark:border-[#263040]"
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
          <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
            {proposal.map((row) => (
              <li
                key={row.id}
                className="min-w-0 rounded-xl border border-kraft-200 bg-kraft-50 p-3 dark:border-[#263040] dark:bg-[#0B0F14]"
              >
                <strong className="break-words">{row.nombre}</strong>
                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                  <div><p className="mb-1 text-gray-500 dark:text-gray-400">Fechas actuales</p><p>{formatDate(row.anterior_inicio)} – {formatDate(row.anterior_termino)}</p></div>
                  <div><p className="mb-1 font-semibold text-obra-orange">Fechas propuestas</p><p>{formatDate(row.fecha_inicio)} – {formatDate(row.fecha_termino)}</p></div>
                </div>
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
            Ajustar también la fecha de término de la obra al nuevo Gantt
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <button type="submit" className={`${crewPrimary} w-full sm:w-auto`} disabled={busy}>
            {busy ? "Guardando…" : "Confirmar reprogramación"}
          </button>
        </form>
      )}
    </section>
  );
}
