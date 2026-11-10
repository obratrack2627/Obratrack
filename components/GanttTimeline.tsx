"use client";
import { Fragment, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, User } from "lucide-react";
import type { Actividad } from "@/types/database";
import {
  activityBar,
  activityDates,
  calendarDays,
  calendarMonths,
  dateLabel,
  monday,
  progressValue,
  todayDay,
  type CalendarScale,
} from "@/lib/gantt/timeline";
import styles from "./GanttChart.module.css";

export default function GanttTimeline({
  actividades,
  startDay,
  onEdit,
}: {
  actividades: Actividad[];
  startDay?: number;
  onEdit: (activity: Actividad) => void;
}) {
  const [scale, setScale] = useState<CalendarScale>("semanas");
  const [anchor, setAnchor] = useState<number | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const today = todayDay();
  const start = anchor ?? monday(startDay ?? today);
  const days = calendarDays[scale];
  const months = useMemo(() => calendarMonths(start, days), [start, days]);
  const ticks = Array.from(
    { length: Math.ceil(days / (scale === "dias" ? 1 : 7)) },
    (_, index) => index * (scale === "dias" ? 1 : 7),
  );
  const todayPosition = ((today - start + 0.5) / days) * 100;
  const todayVisible = todayPosition >= 0 && todayPosition < 100;
  const background = {
    backgroundImage:
      "linear-gradient(to right,var(--g-grid) 1px,transparent 1px),repeating-linear-gradient(to right,transparent 0,transparent calc(500% / var(--days)),var(--g-weekend) calc(500% / var(--days)),var(--g-weekend) calc(700% / var(--days)))",
    backgroundSize: `${100 / days}% 100%,100% 100%`,
    "--days": days,
  } as React.CSSProperties;
  const move = (day: number) => {
    setAnchor(monday(day));
    scroll.current?.scrollTo({ left: 0, behavior: "smooth" });
  };
  return (
    <section className={styles.graph} aria-label="Gantt gráfico">
      <div className={styles.calendarTools}>
        <span>
          {dateLabel(start, true)} – {dateLabel(start + days - 1, true)}
        </span>
        <div className={styles.calendarActions}>
          <button type="button" onClick={() => move(startDay ?? today)}>
            Inicio
          </button>
          <button type="button" onClick={() => move(today)}>
            Hoy
          </button>
          <button
            type="button"
            aria-label="Periodo anterior"
            onClick={() => move(start - days)}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            aria-label="Periodo siguiente"
            onClick={() => move(start + days)}
          >
            <ChevronRight size={16} />
          </button>
          <select
            aria-label="Escala del calendario"
            value={scale}
            onChange={(event) => setScale(event.target.value as CalendarScale)}
          >
            <option value="dias">Días</option>
            <option value="semanas">Semanas</option>
            <option value="meses">Meses</option>
          </select>
        </div>
      </div>
      <div
        ref={scroll}
        className={styles.viewport}
        role="region"
        aria-label="Calendario de partidas"
        tabIndex={0}
      >
        <div className={styles.calendar}>
          <div className={styles.metaHeader}>
            <span>Partida</span>
            <span>Responsable</span>
            <span>Avance</span>
          </div>
          <div className={styles.calendarHeader}>
            <div className={styles.months}>
              {months.map((month) => (
                <span
                  key={month.key}
                  title={month.label}
                  style={{
                    left: `${(month.start / days) * 100}%`,
                    width: `${(month.days / days) * 100}%`,
                  }}
                >
                  {month.days < 7 ? month.short : month.label}
                </span>
              ))}
            </div>
            <div className={styles.ticks} style={background}>
              {ticks.map((offset) => (
                <span
                  key={offset}
                  style={{ left: `${(offset / days) * 100}%` }}
                >
                  {dateLabel(start + offset)}
                </span>
              ))}
            </div>
            {todayVisible && (
              <span
                className={styles.todayLabel}
                style={{ left: `${todayPosition}%` }}
              >
                Hoy · {dateLabel(today)}
              </span>
            )}
          </div>
          {actividades.map((activity) => {
            const range = activityDates(activity),
              bar = activityBar(activity, start, days);
            return (
              <Fragment key={activity.id}>
                <div className={styles.metaRow}>
                  <div className="min-w-0">
                    <button
                      type="button"
                      className={styles.activityName}
                      onClick={() => onEdit(activity)}
                    >
                      {activity.nombre}
                    </button>
                    <p className={styles.activityDates}>
                      {range
                        ? `${dateLabel(range.start)} – ${dateLabel(range.end)}`
                        : "Revisar fechas"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={styles.assignee}
                    aria-label={`Cambiar responsable de ${activity.nombre}`}
                    onClick={() => onEdit(activity)}
                  >
                    <User size={14} className="shrink-0" />
                    <span>{activity.responsable?.nombre || "Sin asignar"}</span>
                  </button>
                  <span
                    className={styles.percent}
                    style={{
                      color:
                        activity.estado === "terminada"
                          ? "#6B8F72"
                          : activity.estado === "en_curso"
                            ? "#FF6A00"
                            : undefined,
                    }}
                  >
                    {progressValue(activity.porcentaje_avance)}%
                  </span>
                </div>
                <div className={styles.lane} style={background}>
                  {todayVisible && (
                    <span
                      className={styles.today}
                      style={{ left: `${todayPosition}%` }}
                    />
                  )}
                  {bar ? (
                    <button
                      type="button"
                      className={styles.bar}
                      data-activity-bar={activity.id}
                      data-status={activity.estado}
                      style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                      onClick={() => onEdit(activity)}
                      aria-label={`Editar ${activity.nombre}: ${dateLabel(range!.start, true)} al ${dateLabel(range!.end, true)}, ${progressValue(activity.porcentaje_avance)}% de avance`}
                      title={`${activity.nombre} · ${range!.days} días · ${progressValue(activity.porcentaje_avance)}%${bar.clipped ? " · Continúa fuera del periodo" : ""}`}
                    >
                      <span
                        style={{
                          width: `${bar.fill}%`,
                          background:
                            activity.estado === "terminada"
                              ? "#6B8F72"
                              : activity.estado === "en_curso"
                                ? "#FF6A00"
                                : "#9CA3AF",
                        }}
                      />
                      <span>
                        {activity.estado === "terminada" ? "✓ " : ""}
                        {activity.nombre}
                      </span>
                    </button>
                  ) : (
                    <span className={styles.outside}>
                      {range ? "Fuera de este periodo" : "Fechas por revisar"}
                    </span>
                  )}
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>
      <footer className={styles.legend}>
        <div>
          <span>
            <i className={styles.dot} style={{ background: "#6B8F72" }} />
            Terminada
          </span>
          <span>
            <i className={styles.dot} style={{ background: "#FF6A00" }} />
            En curso
          </span>
          <span>
            <i className={styles.dot} style={{ background: "#9CA3AF" }} />
            Pendiente
          </span>
        </div>
        <span>Desliza el calendario para ver más fechas</span>
      </footer>
    </section>
  );
}
