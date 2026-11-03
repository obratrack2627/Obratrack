import type { CotizacionEstimacion } from "@/types/database";
import { formatCLP } from "@/lib/utils";

export function profitLabel(q: CotizacionEstimacion) {
  const f = q.estructura_financiera;
  return `${f.tipo_utilidad === "margen_venta" ? "Margen sobre venta" : "Utilidad sobre costos e indirectos"} (${f.margen_utilidad_porcentaje}%)`;
}

export function quoteSummaryText(q: CotizacionEstimacion) {
  const f = q.estructura_financiera;
  if (q.alternativas?.length) return ['Alternativas para ' + q.titulo_proyecto, ...[q, ...q.alternativas].map((a) => `${a.nombre_alternativa || a.titulo_proyecto}: ${formatCLP(a.estructura_financiera.precio_total_con_iva)}`), 'Elige una alternativa para continuar. Las opciones no se suman entre sí.'].join('\n');
  if (q.modo_presupuesto === 'precio_acordado') return ['Presupuesto: ' + q.titulo_proyecto, q.nombre_alternativa, q.resumen_ejecutivo, ...(q.partidas_venta || []).map((p) => `${p.nombre}: ${formatCLP(p.subtotal)}`), `Neto: ${formatCLP(f.precio_sugerido_neto)}`, `IVA (19%): ${formatCLP(f.iva_19)}`, `Total: ${formatCLP(f.precio_total_con_iva)}`, ...(q.hitos_pago || []).map((h) => `${h.nombre} (${h.porcentaje}%): ${formatCLP(h.monto)}`)].filter(Boolean).join('\n');
  return [
    `Presupuesto estimado: ${q.titulo_proyecto}`,
    q.resumen_ejecutivo,
    `Materiales: ${formatCLP(f.costo_materiales_total)}`,
    `Mano de obra: ${formatCLP(f.costo_mano_obra_total)}`,
    `Gastos generales: ${formatCLP(f.gastos_generales_monto)}`,
    `Imprevistos: ${formatCLP(f.imprevistos_monto)}`,
    `${profitLabel(q)}: ${formatCLP(f.margen_utilidad_monto)}`,
    `Neto: ${formatCLP(f.precio_sugerido_neto)}`,
    `IVA (19%): ${formatCLP(f.iva_19)}`,
    `Total: ${formatCLP(f.precio_total_con_iva)}`,
    "Precios estimados; confirmar cantidades, valores y disponibilidad antes de contratar.",
  ]
    .filter(Boolean)
    .join("\n");
}
