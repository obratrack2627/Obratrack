import type {
  AsistenciaObrero,
  BitacoraEntrada,
  Proyecto,
  MaterialProyecto,
  Imprevisto,
  Pago,
  ReclamoCambioObra,
  Actividad,
  Usuario,
} from "@/types/database";
import { addWorkingDays } from "@/lib/work-calendar";
export interface DailyClose {
  version: number;
  fecha: string;
  proyecto_nombre: string;
  confirmado_por: string;
  confirmado_en: string;
  proxima_jornada?: string;
  presentes: number;
  horas: number;
  personas: { nombre: string; estado: string; horas: number }[];
  avances: { titulo: string; nota: string; foto_url?: string }[];
  recepciones: { material: string; cantidad: number; unidad: string }[];
  ingresos: number;
  gastos: number;
  mano_obra: number;
  pendientes: string[];
  tareas_manana: string[];
  nota: string;
}
export function dailySummary(
  project: Proyecto,
  date: string,
  users: Usuario[],
  attendance: AsistenciaObrero[],
  log: BitacoraEntrada[],
  materials: MaterialProyecto[],
  costs: Imprevisto[],
  payments: Pago[],
  changes: ReclamoCambioObra[],
  tasks: Actividad[],
): DailyClose {
  const present = attendance.filter((row) => row.fecha === date);
  const next = addWorkingDays(
    date,
    1,
    project.dias_laborales,
    project.fechas_no_laborales,
  );
  return {
    version: 0,
    fecha: date,
    proyecto_nombre: project.nombre,
    confirmado_por: "",
    confirmado_en: "",
    presentes: present.filter((row) =>
      ["presente", "atraso"].includes(row.estado),
    ).length,
    horas: present.reduce(
      (sum, row) => sum + Number(row.horas_trabajadas || 0),
      0,
    ),
    personas: present.map((row) => ({
      nombre:
        users.find((user) => user.id === row.usuario_id)?.nombre ||
        row.trabajador_nombre,
      estado: row.estado,
      horas: row.horas_trabajadas || 0,
    })),
    avances: log
      .filter((row) => row.fecha === date)
      .map((row) => ({
        titulo: row.titulo,
        nota: row.nota,
        foto_url: row.foto_url,
      })),
    recepciones: log
      .filter(
        (row) =>
          row.fecha === date &&
          row.material_id &&
          Number(row.cantidad_recibida) > 0,
      )
      .map((row) => {
        const m = materials.find((item) => item.id === row.material_id);
        return {
          material: m?.nombre || "Material",
          cantidad: row.cantidad_recibida!,
          unidad: m?.unidad || "",
        };
      }),
    ingresos: payments
      .filter(
        (row) =>
          row.fecha === date && (!row.estado || row.estado === "completado"),
      )
      .reduce((sum, row) => sum + Number(row.monto), 0),
    gastos: costs
      .filter((row) => row.fecha === date)
      .reduce((sum, row) => sum + Number(row.monto), 0),
    mano_obra: costs
      .filter(
        (row) => row.fecha === date && row.categoria_gasto === "mano_obra",
      )
      .reduce((sum, row) => sum + Number(row.monto), 0),
    pendientes: changes
      .filter((row) => ["pendiente", "en_revision"].includes(row.estado))
      .map((row) => row.titulo),
    tareas_manana: tasks
      .filter(
        (row) =>
          row.estado !== "terminada" &&
          row.fecha_inicio <= next &&
          row.fecha_termino >= next,
      )
      .map((row) => row.nombre),
    nota: "",
  };
}
