import { chileToday } from "@/lib/ai/project-deadlines";
export { chileToday };
export function civilDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Revisa la fecha.");
  const time = Date.parse(value + "T00:00:00Z");
  if (
    !Number.isFinite(time) ||
    new Date(time).toISOString().slice(0, 10) !== value
  )
    throw new Error("Revisa la fecha.");
  return time;
}
export function calendarDays(from: string, to: string) {
  return Math.round((civilDay(to) - civilDay(from)) / 86400000);
}
export function addCalendarDays(date: string, days: number) {
  return new Date(civilDay(date) + days * 86400000).toISOString().slice(0, 10);
}
export function addWorkingDays(
  date: string,
  days: number,
  weekdays: number[] = [1, 2, 3, 4, 5],
  excluded: string[] = [],
) {
  if (
    !Number.isInteger(days) ||
    Math.abs(days) > 3650 ||
    !weekdays.length ||
    weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  )
    throw new Error("Revisa el calendario y los días de trabajo.");
  let result = date,
    remaining = Math.abs(days),
    attempts = 0;
  while (remaining && attempts++ < 30000) {
    result = addCalendarDays(result, Math.sign(days));
    if (
      weekdays.includes(new Date(civilDay(result)).getUTCDay()) &&
      !excluded.includes(result)
    )
      remaining--;
  }
  if (remaining)
    throw new Error("No se encontraron días de trabajo en el calendario.");
  return result;
}
export function projectProgress(
  activities: { porcentaje_avance: number; monto_contratado?: number | null }[],
) {
  if (!activities.length) return { percentage: 0, weighted: false };
  const weighted = activities.every((row) => Number(row.monto_contratado) > 0);
  const total = activities.reduce(
    (sum, row) => sum + (weighted ? Number(row.monto_contratado) : 1),
    0,
  );
  const done = activities.reduce(
    (sum, row) =>
      sum +
      Math.max(0, Math.min(100, Number(row.porcentaje_avance) || 0)) *
        (weighted ? Number(row.monto_contratado) : 1),
    0,
  );
  return {
    percentage: Math.min(
      activities.every((row) => Number(row.porcentaje_avance) >= 100)
        ? 100
        : 99,
      Math.round(done / total),
    ),
    weighted,
  };
}
export function csvCell(value: unknown) {
  const text = String(value ?? "");
  return (
    '"' +
    (/^[=+@\-\t\r]/.test(text) ? "'" : "") +
    text.replace(/"/g, '""') +
    '"'
  );
}
