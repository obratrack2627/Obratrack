import type { CotizacionEstimacion } from '@/types/database';
import { stripTrailingPunctuation } from './text';
export function acceptsQuotedProject(text: string) {
  const value = stripTrailingPunctuation(text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(), '.!');
  return /^(?:si|si[, ]+(?:creala|crea (?:la|esa|esta) obra)(?: con (?:el |un )?gantt(?: y (?:los |sus )?materiales)?)?|creala|crea(?:r)? (?:la |esa |esta )?obra(?: con (?:el |un )?gantt(?: y (?:los |sus )?materiales)?)?)$/.test(value);
}
export function quotedProjectDraft(q: CotizacionEstimacion) {
  return {
    nombre: q.titulo_proyecto, cliente_id: q.cliente_id, cliente_nombre: q.cliente_nombre,
    cliente_email: q.cliente_email, cliente_telefono: q.cliente_telefono,
    monto_cotizado: q.estructura_financiera.precio_total_con_iva, comuna: q.comuna_region,
    descripcion: q.resumen_ejecutivo, dias: q.duracion_dias_estimada,
    partidas: q.actividades_gantt.length ? q.actividades_gantt.map((a) => ({ nombre: a.nombre, dias: a.dias })) : [{ nombre: 'Ejecutar alcance presupuestado', dias: q.duracion_dias_estimada }],
    materiales: q.materiales.map((m) => ({ nombre: m.nombre, cantidad: m.cantidad, unidad: m.unidad, precio_unitario: m.precio_unitario_estimado })),
    presupuesto_cotizacion_id: q.id,
  };
}
