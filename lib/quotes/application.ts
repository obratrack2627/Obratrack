import type { CotizacionEstimacion, Proyecto } from '@/types/database';
import type { BudgetGroup } from '@/lib/presupuestos';
import { roundLine } from '@/lib/ai/protocol';

export function budgetApplication(q: CotizacionEstimacion, project: Proyecto, activities: any[], group: BudgetGroup | null, options: { incluir_gantt?: boolean; incluir_materiales?: boolean } = {}) {
  const previous = new Set((group?.ejecucion?.actividades || []).map((r) => r.id));
  const remaining = activities.filter((r) => r.proyecto_id === project.id && !previous.has(r.id));
  let order = Math.max(0, ...remaining.map((r) => Number(r.orden) || 0));
  const cursor = new Date(`${project.fecha_inicio}T12:00:00Z`);
  const date = () => cursor.toISOString().slice(0, 10);
  const phases = q.actividades_gantt.length ? q.actividades_gantt : [{ nombre: 'Ejecutar alcance presupuestado', dias: q.duracion_dias_estimada }];
  return {
    incluir_gantt: options.incluir_gantt !== false,
    incluir_materiales: options.incluir_materiales !== false,
    actividades: options.incluir_gantt === false ? [] : phases.map((a) => {
      const start = date(); cursor.setUTCDate(cursor.getUTCDate() + Math.max(1, Math.ceil(a.dias)) - 1); const end = date(); cursor.setUTCDate(cursor.getUTCDate() + 1);
      return { id: `act-${crypto.randomUUID()}`, proyecto_id: project.id, nombre: a.nombre, fecha_inicio: start, fecha_termino: end, porcentaje_avance: 0, estado: 'pendiente', orden: ++order };
    }),
    materiales_proyecto: options.incluir_materiales === false ? [] : q.materiales.map((m) => ({
      id: `m-${crypto.randomUUID()}`, proyecto_id: project.id, nombre: m.nombre, categoria: m.categoria || 'Cubicación Presupuesto',
      cantidad: m.cantidad, unidad: m.unidad, precio_unitario: m.precio_unitario_estimado,
      subtotal: roundLine(m.cantidad, m.precio_unitario_estimado), proveedor: m.mejor_tienda || 'Por confirmar', comprado: false,
    })),
  };
}
