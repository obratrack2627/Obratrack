import type { Actividad } from "@/types/database";
import { chileToday } from "@/lib/ai/project-deadlines";
const DAY = 86400000;
export type CalendarScale = "dias" | "semanas" | "meses";
export const calendarDays: Record<CalendarScale, number> = {
  dias: 14,
  semanas: 35,
  meses: 91,
};

export function civilDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 10) === value
    ? time / DAY
    : null;
}
export const isoDay = (day: number) =>
  new Date(day * DAY).toISOString().slice(0, 10);
export const monday = (day: number) =>
  day - ((new Date(day * DAY).getUTCDay() + 6) % 7);
export const todayDay = () => civilDay(chileToday())!;
export const dateLabel = (day: number, year = false) =>
  new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "short",
    ...(year ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  }).format(new Date(day * DAY));
export const progressValue = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;

export function activityDates(
  activity: Pick<Actividad, "fecha_inicio" | "fecha_termino">,
) {
  const start = civilDay(activity.fecha_inicio),
    end = civilDay(activity.fecha_termino);
  return start !== null && end !== null && end >= start
    ? { start, end, days: end - start + 1 }
    : null;
}
export function scheduleBounds(activities: Actividad[]) {
  const ranges = activities
    .map(activityDates)
    .filter((range): range is NonNullable<typeof range> => !!range);
  return ranges.length
    ? {
        start: Math.min(...ranges.map((range) => range.start)),
        end: Math.max(...ranges.map((range) => range.end)),
      }
    : null;
}
export function calendarMonths(start: number, days: number) {
  const groups: {
    key: string;
    start: number;
    days: number;
    label: string;
    short: string;
  }[] = [];
  for (let offset = 0; offset < days; offset++) {
    const date = new Date((start + offset) * DAY),
      key = date.toISOString().slice(0, 7);
    const last = groups.at(-1);
    if (last?.key === key) last.days++;
    else
      groups.push({
        key,
        start: offset,
        days: 1,
        label: new Intl.DateTimeFormat("es-CL", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(date),
        short: new Intl.DateTimeFormat("es-CL", {
          month: "short",
          timeZone: "UTC",
        }).format(date),
      });
  }
  return groups;
}
/** Fechas inclusivas; el relleno de avance conserva su posición al recortar el periodo. */
export function activityBar(
  activity: Pick<
    Actividad,
    "fecha_inicio" | "fecha_termino" | "porcentaje_avance"
  >,
  start: number,
  days: number,
) {
  const range = activityDates(activity);
  if (!range) return null;
  const visibleStart = Math.max(start, range.start),
    visibleEnd = Math.min(start + days, range.end + 1);
  if (visibleEnd <= visibleStart) return null;
  const completedUntil =
    range.start +
    (range.days * progressValue(activity.porcentaje_avance)) / 100;
  return {
    left: ((visibleStart - start) / days) * 100,
    width: ((visibleEnd - visibleStart) / days) * 100,
    fill:
      Math.max(
        0,
        Math.min(
          1,
          (completedUntil - visibleStart) / (visibleEnd - visibleStart),
        ),
      ) * 100,
    clipped: visibleStart !== range.start || visibleEnd !== range.end + 1,
  };
}
