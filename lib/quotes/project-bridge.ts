import { resolveSaleLineKind } from '@/lib/quotes/classify';
import type { CotizacionEstimacion } from '@/types/database';

const foldName = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const GROUP_SUMMARY_RE = /^(?:materiales|total\s+materiales|mano\s+de\s+obra|obra\s+de\s+mano)$/i;

function scopeTaskLines(raw?: string): string[] {
  if (!raw?.trim()) return [];
  const tasks: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const clean = line
      .trim()
      .replace(/^(?:[•·*▪▫‣⁃–—]\s*|-\s+|\d+[.)]\s*)/, '')
      .trim();
    if (!clean || clean.endsWith(':')) continue;
    if (/^(?:seg[uú]n\s+detalle\s+de\s+partidas|alternativa:|descripci[oó]n\s+(?:del\s+trabajo|de\s+la\s+obra)|alcance)\b/i.test(clean)) {
      continue;
    }
    tasks.push(clean[0].toUpperCase() + clean.slice(1));
    if (tasks.length >= 25) break;
  }
  return tasks;
}

function distributeDays(names: string[], totalDays?: number): { nombre: string; dias: number }[] {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (!clean.length) return [];
  const target = Math.max(clean.length, Math.round(Number(totalDays) || clean.length));
  const base = Math.floor(target / clean.length);
  let extra = target - base * clean.length;
  return clean.map((nombre) => {
    const bump = extra > 0 ? 1 : 0;
    if (extra > 0) extra -= 1;
    return { nombre: nombre.slice(0, 150), dias: Math.max(1, base + bump) };
  });
}

export function extractQuoteGanttTasks(quote: CotizacionEstimacion): { nombre: string; dias: number }[] {
  const explicit = (quote.actividades_gantt || [])
    .filter((a) => a && typeof a.nombre === 'string' && a.nombre.trim())
    .map((a) => ({ nombre: a.nombre.trim().slice(0, 150), dias: Math.max(1, Math.round(Number(a.dias) || 1)) }));
  const scopeTasks = scopeTaskLines(quote.resumen_ejecutivo);

  if (explicit.length >= 2) return explicit;
  if (
    explicit.length === 1 &&
    !/^ejecutar alcance presupuestado$/i.test(explicit[0].nombre) &&
    scopeTasks.length < 2
  ) {
    return explicit;
  }

  const workItems = (quote.partidas_venta || [])
    .filter((p) => p && typeof p.nombre === 'string' && p.nombre.trim())
    .filter((p) => resolveSaleLineKind(p) !== 'material' && !GROUP_SUMMARY_RE.test(p.nombre.trim()));

  if (workItems.length >= 2) {
    return distributeDays(workItems.map((p) => p.nombre), quote.duracion_dias_estimada);
  }
  if (scopeTasks.length >= 2) {
    return distributeDays(scopeTasks, quote.duracion_dias_estimada);
  }
  if (workItems.length === 1) {
    return distributeDays([workItems[0].nombre], quote.duracion_dias_estimada);
  }
  if (explicit.length === 1) return explicit;

  const fallback = quote.titulo_proyecto?.trim() || 'Ejecutar alcance presupuestado';
  return [{ nombre: fallback.slice(0, 150), dias: Math.max(1, Math.round(Number(quote.duracion_dias_estimada) || 1)) }];
}

export function extractQuoteMaterials(
  quote: CotizacionEstimacion,
): { nombre: string; cantidad: number; unidad: string; precio_unitario: number }[] {
  const seen = new Set<string>();
  const out: { nombre: string; cantidad: number; unidad: string; precio_unitario: number }[] = [];

  const pushUnique = (nombre: string, cantidad: number, unidad: string, precioUnitario: number) => {
    const clean = nombre.trim();
    const key = foldName(clean);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({
      nombre: clean.slice(0, 300),
      cantidad: Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1,
      unidad: (unidad || 'un').trim().slice(0, 30) || 'un',
      precio_unitario: Number.isFinite(precioUnitario) && precioUnitario >= 0 ? Math.round(precioUnitario) : 0,
    });
  };

  for (const m of quote.materiales || []) {
    if (!m?.nombre?.trim()) continue;
    pushUnique(
      m.nombre,
      Number(m.cantidad) || 1,
      m.unidad || 'un',
      Number(m.precio_unitario_estimado) || 0,
    );
  }

  for (const p of quote.partidas_venta || []) {
    if (!p?.nombre?.trim()) continue;
    if (resolveSaleLineKind(p) !== 'material' || GROUP_SUMMARY_RE.test(p.nombre.trim())) continue;
    const qty = Number(p.cantidad) > 0 ? Number(p.cantidad) : 1;
    const unitPrice = p.precio_partida == null ? Number(p.precio_unitario) || 0 : Math.round(p.subtotal / qty);
    pushUnique(p.nombre, qty, p.unidad || 'un', unitPrice);
  }

  for (const m of quote.materiales_considerados || []) {
    if (!m?.nombre?.trim()) continue;
    const qty = typeof m.cantidad === 'number' && m.cantidad > 0 ? m.cantidad : 1;
    pushUnique(m.nombre, qty, m.unidad || 'un', 0);
  }

  return out;
}
