import type { Presupuesto } from '@/lib/presupuestos';
import { stripTrailingPunctuation } from './text';
const norm = (s: string) => stripTrailingPunctuation(s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(), '.!?');

export function chooseBudgetOption(text: string, rows: Presupuesto[], menuShown: boolean) {
  const value = norm(text);
  if (menuShown && /^(?:(?:opcion|alternativa)\s*)?[1-4]$/.test(value)) {
    const number = Number(value.match(/[1-4]$/)![0]);
    return rows[number - 1] || null;
  }
  // norm ya convierte los espacios repetidos en uno; no hace falta una regex
  // con cuantificadores superpuestos para separar la orden y el nombre.
  const commands = ['elige', 'elegir', 'aprueba', 'aprobar', 'selecciona', 'usar', 'usa', 'me quedo con', 'crea la obra con', 'crea obra con'];
  const command = commands.find((prefix) => value.startsWith(prefix + ' '));
  let requested = command ? value.slice(command.length + 1) : menuShown ? value : '';
  if (command) {
    const article = ['la ', 'el '].find((prefix) => requested.startsWith(prefix));
    if (article) requested = requested.slice(article.length);
    const option = ['opcion ', 'alternativa '].find((prefix) => requested.startsWith(prefix));
    if (option) requested = requested.slice(option.length);
  }
  if (!requested) return null;
  const matches = rows.filter((r) => [r.nombre_alternativa, r.cotizacion.nombre_alternativa].filter(Boolean).some((label) => norm(label!) === requested));
  return matches.length === 1 ? matches[0] : null;
}
