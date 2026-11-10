"use client";
import { useEffect, useState } from "react";
import {
  Calendar,
  Check,
  Edit3,
  GanttChartSquare,
  LayoutList,
  Plus,
  User,
  AlertTriangle,
} from "lucide-react";
import type { Actividad, Usuario } from "@/types/database";
import {
  activityDates,
  dateLabel,
  progressValue,
  scheduleBounds,
  todayDay,
} from "@/lib/gantt/timeline";
import ModalOverlay from "./ModalOverlay";
import ActivityEditor from "./ActivityEditor";
import GanttTimeline from "./GanttTimeline";
import styles from "./GanttChart.module.css";

interface GanttChartProps {
  actividades: Actividad[];
  usuarios: Usuario[];
  assignedWorkerIds?: string[];
  progress?: number;
  onUpdateActivity: (id: string, updates: Partial<Actividad>) => void;
  onDeleteActivity?: (id: string) => void;
  onAddActivity: () => void;
}
const labels: Record<Actividad["estado"], string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  terminada: "Terminada",
};
function Status({ activity }: { activity: Actividad }) {
  return (
    <span className={styles.status} data-status={activity.estado}>
      {activity.estado === "terminada" && <Check size={12} />}{" "}
      {labels[activity.estado]}
    </span>
  );
}

export default function GanttChart({
  actividades,
  usuarios,
  assignedWorkerIds,
  progress,
  onUpdateActivity,
  onDeleteActivity,
  onAddActivity,
}: GanttChartProps) {
  const [selected, setSelected] = useState<Actividad | null>(null);
  const [toDelete, setToDelete] = useState<Actividad | null>(null);
  const [view, setView] = useState<"auto" | "gantt" | "cards">("auto");
  const [mobile, setMobile] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<"todos" | Actividad["estado"]>("todos");
  useEffect(() => {
    const media = matchMedia("(max-width: 1023px)");
    const change = () => setMobile(media.matches);
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const mode =
    view === "auto"
      ? mobile === null
        ? "auto"
        : mobile
          ? "cards"
          : "gantt"
      : view;
  const ordered = [...actividades].sort((a, b) => a.orden - b.orden);
  const filtered = ordered.filter(
    (activity) => filter === "todos" || activity.estado === filter,
  );
  const counts = {
    todos: ordered.length,
    pendiente: ordered.filter((a) => a.estado === "pendiente").length,
    en_curso: ordered.filter((a) => a.estado === "en_curso").length,
    terminada: ordered.filter((a) => a.estado === "terminada").length,
  };
  const bounds = scheduleBounds(ordered);
  const totalDays = ordered.reduce(
    (sum, activity) => sum + (activityDates(activity)?.days || 1),
    0,
  );
  const weighted = totalDays
    ? ordered.reduce(
        (sum, activity) =>
          sum +
          progressValue(activity.porcentaje_avance) *
            (activityDates(activity)?.days || 1),
        0,
      ) / totalDays
    : 0;
  const overall = Math.round(progressValue(progress ?? weighted));
  const quickProgress = (activity: Actividad, value: number) => {
    const next = progressValue(value);
    onUpdateActivity(activity.id, {
      porcentaje_avance: next,
      estado: next === 100 ? "terminada" : next > 0 ? "en_curso" : "pendiente",
    });
  };
  return (
    <section className={styles.root} aria-label="Planificación de obra">
      <header className={styles.heading}>
        <div>
          <h2>Planificación de obra</h2>
          <p className={styles.subtitle}>
            {ordered.length} {ordered.length === 1 ? "partida" : "partidas"}
            {bounds
              ? ` · ${dateLabel(bounds.start)} – ${dateLabel(bounds.end, true)}`
              : ""}
          </p>
        </div>
        <button
          type="button"
          className={styles.primary}
          onClick={onAddActivity}
        >
          <Plus size={17} />
          Nueva partida
        </button>
      </header>
      <div
        className={styles.summary}
        role="group"
        aria-label="Resumen de planificación"
      >
        <div className={styles.overall}>
          <div>
            <span>Avance general</span>
            <strong>{overall}%</strong>
          </div>
          <div
            className={styles.track}
            role="progressbar"
            aria-label="Avance general de la obra"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={overall}
          >
            <span style={{ width: `${overall}%` }} />
          </div>
        </div>
        <div className={styles.counts}>
          <span>
            <i className={styles.dot} style={{ background: "#6B8F72" }} />
            {counts.terminada}{" "}
            {counts.terminada === 1 ? "terminada" : "terminadas"}
          </span>
          <span>
            <i className={styles.dot} style={{ background: "#FF6A00" }} />
            {counts.en_curso} en curso
          </span>
          <span>
            <i className={styles.dot} style={{ background: "#9CA3AF" }} />
            {counts.pendiente}{" "}
            {counts.pendiente === 1 ? "pendiente" : "pendientes"}
          </span>
        </div>
      </div>
      <div className={styles.toolbar}>
        <div
          className={styles.viewSwitch}
          role="group"
          aria-label="Vista de planificación"
        >
          <button
            type="button"
            aria-pressed={mode === "gantt"}
            onClick={() => setView("gantt")}
          >
            <GanttChartSquare size={16} />
            Gantt gráfico
          </button>
          <button
            type="button"
            className={styles.cardsToggle}
            aria-pressed={mode === "cards"}
            onClick={() => setView("cards")}
          >
            <LayoutList size={16} />
            Tarjetas de faena
          </button>
        </div>
        <div
          className={styles.filters}
          role="group"
          aria-label="Filtrar partidas"
        >
          {(["todos", "pendiente", "en_curso", "terminada"] as const).map(
            (status) => (
              <button
                type="button"
                key={status}
                aria-pressed={filter === status}
                onClick={() => setFilter(status)}
              >
                {status === "todos"
                  ? "Todas"
                  : status === "pendiente"
                    ? "Pendientes"
                    : status === "terminada"
                      ? "Terminadas"
                      : "En curso"}{" "}
                <span>({counts[status]})</span>
              </button>
            ),
          )}
        </div>
      </div>
      {!ordered.length ? (
        <div className={styles.empty}>
          <p>
            Aún no hay partidas. Agrega la primera para comenzar a planificar
            esta obra.
          </p>
          <button
            type="button"
            className={styles.primary}
            onClick={onAddActivity}
          >
            <Plus size={16} />
            Agregar primera partida
          </button>
        </div>
      ) : !filtered.length ? (
        <div className={styles.empty}>
          <p>No hay partidas con este estado.</p>
          <button
            type="button"
            className={styles.edit}
            onClick={() => setFilter("todos")}
          >
            Ver todas las partidas
          </button>
        </div>
      ) : (
        <>
          <div
            hidden={mode === "cards"}
            className={mode === "auto" ? styles.autoGraph : undefined}
          >
            <GanttTimeline
              actividades={filtered}
              startDay={bounds?.start}
              onEdit={setSelected}
            />
          </div>
          <div
            hidden={mode === "gantt"}
            className={mode === "auto" ? styles.autoCards : undefined}
          >
            <div
              className={styles.cards}
              role="group"
              aria-label="Tarjetas de faena"
            >
              {filtered.map((activity) => {
                const range = activityDates(activity),
                  percent = progressValue(activity.porcentaje_avance);
                const overdue =
                  range &&
                  activity.estado !== "terminada" &&
                  percent < 100 &&
                  todayDay() > range.end
                    ? todayDay() - range.end
                    : 0;
                return (
                  <article
                    key={activity.id}
                    className={styles.card}
                    aria-label={`Partida ${activity.nombre}`}
                  >
                    <div className={styles.cardTop}>
                      <span className={styles.order}>
                        Partida {activity.orden}
                      </span>
                      <Status activity={activity} />
                    </div>
                    <h3>{activity.nombre}</h3>
                    <div className={styles.cardDates}>
                      <Calendar size={14} />
                      <span>
                        {range
                          ? `${dateLabel(range.start)} – ${dateLabel(range.end, true)}`
                          : "Fechas por revisar"}
                      </span>
                    </div>
                    {overdue > 0 && (
                      <p className={styles.overdue}>
                        Plazo vencido · {overdue}{" "}
                        {overdue === 1 ? "día" : "días"}
                      </p>
                    )}
                    <div className={styles.cardProgress}>
                      <div>
                        <span>Avance reportado</span>
                        <strong>{percent}%</strong>
                      </div>
                      <div
                        className={styles.track}
                        role="progressbar"
                        aria-label={`Avance de ${activity.nombre}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent}
                      >
                        <span
                          style={{
                            width: `${percent}%`,
                            background:
                              activity.estado === "terminada"
                                ? "#6B8F72"
                                : "#FF6A00",
                          }}
                        />
                      </div>
                    </div>
                    <div className={styles.cardFooter}>
                      <button
                        type="button"
                        className={styles.assignee}
                        aria-label={`Cambiar responsable de ${activity.nombre}`}
                        onClick={() => setSelected(activity)}
                      >
                        <User size={15} className="shrink-0" />
                        <span>
                          {activity.responsable?.nombre || "Sin asignar"}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={styles.edit}
                        aria-label={`Editar ${activity.nombre}`}
                        onClick={() => setSelected(activity)}
                      >
                        <Edit3 size={14} />
                        Editar
                      </button>
                    </div>
                    {percent < 100 && (
                      <div
                        className={styles.quick}
                        role="group"
                        aria-label={`Actualizar avance de ${activity.nombre}`}
                      >
                        <button
                          type="button"
                          onClick={() => quickProgress(activity, percent + 25)}
                          title="Aumentar el avance en 25 puntos"
                        >
                          +25%
                        </button>
                        <button
                          type="button"
                          disabled={percent >= 50}
                          onClick={() => quickProgress(activity, 50)}
                          title="Fijar avance en 50%"
                        >
                          50%
                        </button>
                        <button
                          type="button"
                          disabled={percent >= 75}
                          onClick={() => quickProgress(activity, 75)}
                          title="Fijar avance en 75%"
                        >
                          75%
                        </button>
                        <button
                          type="button"
                          onClick={() => quickProgress(activity, 100)}
                          title="Marcar como terminada"
                        >
                          100%
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </>
      )}
      {selected && (
        <ActivityEditor
          key={selected.id}
          activity={selected}
          usuarios={usuarios}
          assignedWorkerIds={assignedWorkerIds}
          onSave={onUpdateActivity}
          onClose={() => setSelected(null)}
          onDelete={
            onDeleteActivity
              ? (activity) => {
                  setSelected(null);
                  setToDelete(activity);
                }
              : undefined
          }
        />
      )}
      {toDelete && (
        <ModalOverlay
          onClose={() => setToDelete(null)}
          aria-label="Eliminar partida"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-6 space-y-4">
            <AlertTriangle size={28} className="text-red-600" />
            <h3 className="text-lg font-bold">¿Eliminar esta partida?</h3>
            <p className="text-sm text-gray-500 break-words">
              Se eliminará «{toDelete.nombre}» del cronograma.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setToDelete(null)}
                className="min-h-11 rounded-xl px-4 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteActivity?.(toDelete.id);
                  setToDelete(null);
                }}
                className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </section>
  );
}
