import type { Presupuesto } from '@/lib/presupuestos';
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');

export function chooseBudgetOption(text: string, rows: Presupuesto[], menuShown: boolean) {
  const value = norm(text);
  if (menuShown && /^(?:(?:opcion|alternativa)\s*)?[1-4]$/.test(value)) {
    const number = Number(value.match(/[1-4]$/)![0]);
    return rows[number - 1] || null;
  }
  const explicit = /^(?:elige|elegir|aprueba|aprobar|selecciona|usar|usa|me quedo con|crea (?:la )?obra con)\s+(?:(?:la|el)\s+)?(?:(?:opcion|alternativa)\s+)?(.+)$/.exec(value)?.[1];
  const requested = explicit || (menuShown ? value : '');
  if (!requested) return null;
  const matches = rows.filter((r) => [r.nombre_alternativa, r.cotizacion.nombre_alternativa].filter(Boolean).some((label) => norm(label!) === requested));
  return matches.length === 1 ? matches[0] : null;
}
