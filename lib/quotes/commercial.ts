import { AIError } from '@/lib/ai/errors';
import type { CotizacionEstimacion } from '@/types/database';

const fail = (message: string): never => { throw new AIError('QUOTE_INVALID', message, 422); };
export function commercialLines(raw: any): NonNullable<CotizacionEstimacion['partidas_venta']> {
  if (!Array.isArray(raw) || !raw.length || raw.length > 300) fail('Agrega entre 1 y 300 partidas con el precio acordado.');
  return raw.map((line: any) => {
    if (typeof line.nombre !== 'string' || !line.nombre.trim() || line.nombre.length > 500 || typeof line.unidad !== 'string' || !line.unidad.trim() || line.unidad.length > 30) fail('Revisa el nombre y la unidad de las partidas.');
    if (!Number.isFinite(line.cantidad) || line.cantidad <= 0 || line.cantidad > 1e9 || !Number.isSafeInteger(line.precio_unitario) || line.precio_unitario < 0) fail('Revisa cantidades y precios acordados en CLP.');
    const subtotal = Number((BigInt(Math.round(line.cantidad * 1e6)) * BigInt(line.precio_unitario) + BigInt(500000)) / BigInt(1000000));
    if (!Number.isSafeInteger(subtotal)) fail('El precio supera el rango admitido.');
    return { nombre: line.nombre.trim(), unidad: line.unidad.trim(), cantidad: line.cantidad, precio_unitario: line.precio_unitario, subtotal };
  });
}
export function agreedTotals(lines: NonNullable<CotizacionEstimacion['partidas_venta']>, iva: unknown) {
  if (iva !== 'neto' && iva !== 'incluido') fail('Confirma si los precios acordados son netos o incluyen IVA.');
  const sum = lines.reduce((a, b) => a + b.subtotal, 0);
  if (!Number.isSafeInteger(sum) || sum <= 0) fail('El presupuesto debe tener un total positivo.');
  const net = iva === 'incluido' ? Number((BigInt(sum) * BigInt(100) + BigInt(59)) / BigInt(119)) : sum;
  const tax = iva === 'incluido' ? sum - net : Number((BigInt(net) * BigInt(19) + BigInt(50)) / BigInt(100));
  if (!Number.isSafeInteger(net + tax)) fail('El total con IVA supera el rango admitido.');
  return { net, tax, total: net + tax };
}
export function paymentMilestones(raw: any, total: number) {
  if (raw == null || (Array.isArray(raw) && !raw.length)) return undefined;
  if (!Array.isArray(raw) || raw.length > 12) fail('El plan de cobro admite hasta 12 hitos.');
  const rows: { nombre: string; porcentaje: number; monto: number }[] = raw.map((r: any) => {
    if (typeof r.nombre !== 'string' || !r.nombre.trim() || r.nombre.length > 150 || !Number.isFinite(r.porcentaje) || r.porcentaje <= 0 || r.porcentaje > 100) fail('Revisa los nombres y porcentajes del plan de cobro.');
    return { nombre: r.nombre.trim(), porcentaje: r.porcentaje, monto: Math.round(total * r.porcentaje / 100) };
  });
  if (Math.abs(rows.reduce((a, r) => a + r.porcentaje, 0) - 100) > 0.000001) fail('Los hitos de cobro deben sumar el 100%.');
  rows[rows.length - 1].monto = total - rows.slice(0, -1).reduce((a, r) => a + r.monto, 0);
  return rows;
}
