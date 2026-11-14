import type { CotizacionEstimacion } from '@/types/database';
import { stripTrailingPunctuation } from './text';
export function requestsQuotedProject(text: string) {
  const value = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/^[¿¡]+/, '');
  if (/^(?:como\b|que\b|cual\b|se puede\b|es posible\b)/.test(value) || /\b(?:no|sin)\s+(?:(?:quiero|debes|puedes|que)\s+){0,3}(?:crea\w*|convert\w*|usa\w*|utiliza\w*)\b/.test(value)) return false;
  if (/\b(?:registr\w*|paga\w*|envia\w*|elimina\w*|borra\w*|asigna\w*)\b/.test(value)) return false;
  const command = /^(?:por favor[, ]+)?(?:(?:quiero|necesito|puedes|podrias)(?: que)?\s+)?(?:usa\w*|utiliza\w*|crea\w*|convert\w*|retoma\w*)\b/.test(value);
  const reference = /\b(?:esa|esta|ese|este|la|el|ultima|ultimo)\s+(?:cotizacion|presupuesto)\b|\b(?:cotizacion|presupuesto)\s+(?:anterior|guardad[oa]|seleccionad[oa])\b/.test(value);
  return command && reference && /\b(?:crea\w*|convert\w*)\b/.test(value) && /\b(?:obra|proyecto)\b/.test(value);
}
export function cancelsProjectDraft(text: string) {
  const value = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return /^(?:cancela(?:r)?|olvida(?:r)?)(?:\s+(?:la\s+|el\s+)?(?:creacion|obra|proyecto|eso|borrador)(?:\s+pendiente)?)?[.!]?$/.test(value);
}
export function resumesProjectDraft(text: string) {
  const value = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return /^(?:continua|continuar|continuemos|sigue|retoma|retomar|creala|listo|ya te (?:di|pase|envie) (?:todos )?los datos)[.!]?$/.test(value);
}
export function startsProjectDraft(text: string) {
  const value = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return requestsQuotedProject(text) || /\b(?:crea\w*|registra\w*)\s+(?:(?:una?|la|el|otra?|otro|nueva?)\s+){0,3}(?:obra|proyecto)\b/.test(value);
}
/** Recupera solo el inicio del borrador vigente; una cancelación u otra obra corta la búsqueda. */
export function legacyQuotedProjectMessage(rows: any[]) {
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]; const text = row.texto || '';
    const action = row.acciones;
    if (cancelsProjectDraft(text) || action?.presupuesto_proyecto_id || action?.tipo === 'crear_proyecto') return null;
    if (requestsQuotedProject(text)) return rows.slice(index + 1).find(candidate => candidate.cotizacion) || null;
    if (startsProjectDraft(text)) return null;
  }
  return null;
}
export function acceptsQuotedProject(text: string) {
  const value = stripTrailingPunctuation(text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(), '.!');
  return requestsQuotedProject(text) || /^(?:si|si[, ]+(?:creala|crea (?:la|esa|esta) obra)(?: con (?:el |un )?gantt(?: y (?:los |sus )?materiales)?)?|creala|crea(?:r)? (?:la |esa |esta )?obra(?: con (?:el |un )?gantt(?: y (?:los |sus )?materiales)?)?)$/.test(value);
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
