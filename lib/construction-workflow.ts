import type {
  Actividad,
  AsistenciaObrero,
  Imprevisto,
  MaterialProyecto,
  Pago,
  Proyecto,
} from "@/types/database";
import {
  addCalendarDays,
  addWorkingDays,
  calendarDays,
  chileToday,
  civilDay,
} from "./work-calendar";
export type Reception = {
  estado: "observaciones" | "conforme";
  fecha: string;
  recibido_por: string;
  observaciones: string;
  fotos: string[];
  registrado_por?: string;
  registrado_en?: string;
};
export function validateReception(
  project: Proyecto,
  tasks: Actividad[],
  input: Reception,
) {
  civilDay(input.fecha);
  if (
    project.estado !== "terminado" ||
    !tasks.length ||
    tasks.some((row) => row.porcentaje_avance < 100)
  )
    throw new Error("Completa las partidas antes de registrar la recepción.");
  if (
    !["observaciones", "conforme"].includes(input.estado) ||
    input.fecha > chileToday() ||
    !input.recibido_por?.trim() ||
    input.recibido_por.length > 160 ||
    input.observaciones.length > 4000 ||
    !Array.isArray(input.fotos) ||
    input.fotos.length > 10 ||
    input.fotos.some(
      (photo) => typeof photo !== "string" || photo.length > 2000,
    )
  )
    throw new Error("Revisa los datos de la recepción.");
  if (input.estado === "observaciones" && !input.observaciones.trim())
    throw new Error("Indica las observaciones del mandante.");
  return input;
}
export function recordedFlow(
  project: Proyecto,
  materials: MaterialProyecto[],
  costs: Imprevisto[],
  payments: Pago[],
) {
  const income = payments
    .filter((row) => !row.estado || row.estado === "completado")
    .reduce((s, row) => s + Number(row.monto), 0);
  const paid = [
    ...materials.map((row) => ({ monto: row.subtotal, pagado: row.pagado })),
    ...costs,
  ]
    .filter((row) => row.pagado === true)
    .reduce((s, row) => s + Number(row.monto), 0);
  const unpaidMaterials = materials
    .filter((row) => row.pagado === false)
    .reduce((s, row) => s + Number(row.subtotal), 0);
  const unpaidLabour = costs
    .filter(
      (row) => row.pagado === false && row.categoria_gasto === "mano_obra",
    )
    .reduce((s, row) => s + Number(row.monto), 0);
  const unpaidOther = costs
    .filter(
      (row) => row.pagado === false && row.categoria_gasto !== "mano_obra",
    )
    .reduce((s, row) => s + Number(row.monto), 0);
  return {
    income,
    paid,
    flow: income - paid,
    clientDue: Math.max(0, project.monto_cotizado - income),
    unpaidMaterials,
    unpaidLabour,
    unpaidOther,
    unknown: [...materials, ...costs].filter((row) => row.pagado == null)
      .length,
  };
}
export function labourAmount(
  attendance: AsistenciaObrero,
  daily: number,
  portion: number,
  extraHours = 0,
  hourly = 0,
) {
  if (
    !["presente", "atraso"].includes(attendance.estado) ||
    attendance.fecha > chileToday()
  )
    throw new Error(
      "Solo puedes registrar jornales de asistencias presentes o con atraso ya confirmadas.",
    );
  if (
    !Number.isInteger(daily) ||
    daily <= 0 ||
    ![0.5, 1].includes(portion) ||
    !Number.isFinite(extraHours) ||
    extraHours < 0 ||
    extraHours > 12 ||
    !Number.isInteger(hourly) ||
    hourly < 0 ||
    (extraHours > 0 && hourly === 0)
  )
    throw new Error(
      "Revisa el valor del jornal, la jornada y las horas extra.",
    );
  return Math.round(daily * portion + extraHours * hourly);
}
export function materialNeeds(
  materials: MaterialProyecto[],
  tasks: Actividad[],
  logs: { material_id?: string; cantidad_recibida?: number }[],
  today = chileToday(),
) {
  return materials.flatMap((material) => {
    const task = tasks.find(
      (row) => row.id === material.actividad_id && row.porcentaje_avance < 100,
    );
    if (!task || task.fecha_inicio > addCalendarDays(today, 7)) return [];
    const received = logs
      .filter((row) => row.material_id === material.id)
      .reduce((s, row) => s + Number(row.cantidad_recibida || 0), 0);
    const pending = Math.max(0, material.cantidad - received);
    return pending > 0
      ? [
          {
            material: material.nombre,
            actividad: task.nombre,
            fecha: task.fecha_inicio,
            pendiente: pending,
            unidad: material.unidad,
          },
        ]
      : [];
  });
}
export function rescheduleSuggestion(
  project: Proyecto,
  tasks: Actividad[],
  today = chileToday(),
) {
  const pending = tasks.filter((row) => row.porcentaje_avance < 100);
  const overdue = pending.filter((row) => row.fecha_termino < today);
  if (!overdue.length) return [];
  let base = today;
  const weekdays = project.dias_laborales || [1, 2, 3, 4, 5],
    excluded = project.fechas_no_laborales || [];
  if (
    !weekdays.includes(new Date(civilDay(base)).getUTCDay()) ||
    excluded.includes(base)
  )
    base = addWorkingDays(base, 1, weekdays, excluded);
  const first = overdue.map((row) => row.fecha_termino).sort((a,b)=>a.localeCompare(b))[0];
  const delta = Math.max(1, calendarDays(first, base));
  const working = (date: string) =>
    weekdays.includes(new Date(civilDay(date)).getUTCDay()) &&
    !excluded.includes(date)
      ? date
      : addWorkingDays(date, 1, weekdays, excluded);
  return pending.map((row) => {
    const start =
      row.porcentaje_avance > 0
        ? row.fecha_inicio
        : working(addCalendarDays(row.fecha_inicio, delta));
    const end = working(addCalendarDays(row.fecha_termino, delta));
    return {
      id: row.id,
      nombre: row.nombre,
      anterior_inicio: row.fecha_inicio,
      anterior_termino: row.fecha_termino,
      fecha_inicio: start,
      fecha_termino: end < start ? start : end,
    };
  });
}

export function materialPurchasePaymentPatch(
  current: Pick<MaterialProyecto, "comprado" | "pagado">,
  key: "comprado" | "pagado",
  value: boolean,
): Pick<MaterialProyecto, "comprado" | "pagado"> {
  if (key === "pagado") {
    return value
      ? { comprado: true, pagado: true }
      : { comprado: Boolean(current.comprado), pagado: false };
  }
  return value
    ? { comprado: true, pagado: current.pagado ?? null }
    : { comprado: false, pagado: null };
}
