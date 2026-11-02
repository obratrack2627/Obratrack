import type { CotizacionEstimacion } from '@/types/database';
import { normalizeQuote } from '@/lib/ai/protocol';
import { AIError } from '@/lib/ai/errors';

// Recalcula la edición sin llamar a Gemini y conserva la identidad del presupuesto.
export function reviseQuote(original: CotizacionEstimacion, changes: any): CotizacionEstimacion {
  const fail = (message: string): never => { throw new AIError('QUOTE_INVALID_EDIT', message, 422); };
  if (!changes || typeof changes !== 'object') fail('Revisa los datos de la cotización.');
  for (const field of ['materiales', 'mano_de_obra']) {
    if (!Array.isArray(changes[field]) || changes[field].length > 300) fail('El presupuesto admite hasta 300 materiales y 300 filas de mano de obra.');
  }
  const updated = { ...original };
  for (const field of ['titulo_proyecto', 'comuna_region', 'resumen_ejecutivo', 'cliente_nombre', 'cliente_telefono', 'cliente_email', 'cliente_contacto', 'condiciones_pago', 'observaciones'] as const) {
    if (Object.hasOwn(changes, field) && changes[field] !== undefined) {
      if (typeof changes[field] !== 'string' || changes[field].length > (['resumen_ejecutivo', 'condiciones_pago', 'observaciones'].includes(field) ? 6000 : 300)) fail('Un campo contiene texto demasiado extenso o no válido.');
      updated[field] = changes[field].trim();
    }
  }
  if (updated.cliente_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updated.cliente_email)) fail('Revisa el correo del cliente.');
  if (Object.hasOwn(changes, 'fecha_validez')) {
    const value = changes.fecha_validez;
    if (value && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) fail('Revisa la fecha de validez.');
    updated.fecha_validez = value || '';
  }
  if (!Number.isFinite(changes.duracion_dias_estimada) || changes.duracion_dias_estimada <= 0) fail('El plazo estimado debe ser mayor a cero.');
  if (changes.materiales.some((m: any) => typeof m?.nombre !== 'string' || m.nombre.length > 500 || typeof m.unidad !== 'string' || !m.unidad.trim() || m.unidad.length > 30)) fail('Revisa el nombre y la unidad de los materiales.');
  if (changes.mano_de_obra.some((m: any) => typeof m?.rol !== 'string' || m.rol.length > 300 || !Number.isInteger(m.cantidad_personas))) fail('Revisa el oficio y el número de personas de la mano de obra.');
  const f = changes.estructura_financiera;
  if (!f || !['recargo_costos', 'margen_venta'].includes(f.tipo_utilidad)) fail('Selecciona cómo calcular la utilidad.');
  for (const field of ['gastos_generales_porcentaje', 'imprevistos_porcentaje', 'margen_utilidad_porcentaje']) if (typeof f[field] !== 'number' || !Number.isFinite(f[field]) || f[field] < 0 || f[field] > 1000) fail('Revisa los porcentajes: deben estar entre 0 y 1000.');
  const calculated = normalizeQuote({ ...updated, materiales: changes.materiales, mano_de_obra: changes.mano_de_obra, duracion_dias_estimada: changes.duracion_dias_estimada, estructura_financiera: f });
  return { ...calculated, ...updated, materiales: calculated.materiales, mano_de_obra: calculated.mano_de_obra, estructura_financiera: calculated.estructura_financiera, duracion_dias_estimada: calculated.duracion_dias_estimada, id: original.id, fecha_creacion: original.fecha_creacion };
}
