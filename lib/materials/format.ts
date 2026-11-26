import type { ComparacionMateriales, OfertaMaterial } from "./types";
const clp = (v: number) => "$" + v.toLocaleString("es-CL") + " CLP";
const effectiveOfferTotal = (o: OfertaMaterial) => o.total_solicitado ?? o.precio;

function offerQuantityDetail(o: OfertaMaterial, data: ComparacionMateriales): string {
  if (o.cajas_necesarias != null && o.rendimiento_m2 != null && o.total_solicitado != null) {
    const m2Str = o.rendimiento_m2.toLocaleString("es-CL");
    const pm2 = o.precio_m2 != null ? ` (${clp(o.precio_m2)}/m²)` : "";
    return ` · ${o.cajas_necesarias} ${o.cajas_necesarias === 1 ? "caja" : "cajas"} de ${m2Str} m²${pm2}: ${clp(o.total_solicitado)}`;
  }
  if (o.total_solicitado != null) {
    const unitLabel = data.consulta.unidad_cantidad?.trim() || "unidades";
    return ` · ${data.consulta.cantidad} ${unitLabel}: ${clp(o.total_solicitado)}`;
  }
  return "";
}

function storeComparisonSummary(data: ComparacionMateriales): string | null {
  const bestByStore = new Map<string, OfertaMaterial>();
  for (const o of data.ofertas) {
    const prev = bestByStore.get(o.tienda);
    if (!prev || effectiveOfferTotal(o) < effectiveOfferTotal(prev)) {
      bestByStore.set(o.tienda, o);
    }
  }
  if (bestByStore.size < 2) return null;
  const ranked = Array.from(bestByStore.entries()).sort(
    (a, b) => effectiveOfferTotal(a[1]) - effectiveOfferTotal(b[1]),
  );
  const low = effectiveOfferTotal(ranked[0][1]);
  const high = effectiveOfferTotal(ranked[ranked.length - 1][1]);
  const savings = high - low;
  const storeList = ranked
    .map(([store, offer]) => `${store} desde ${clp(effectiveOfferTotal(offer))}`)
    .join(" · ");
  return savings > 0
    ? `Comparativa por tienda: ${storeList}. Ahorro estimado de ${clp(savings)} eligiendo la opción más baja de ${ranked[0][0]}.`
    : `Comparativa por tienda: ${storeList}.`;
}

function batchCartSummary(
  items: Array<{ label: string; comparison: ComparacionMateriales }>,
): string | null {
  const pricedItems = items.filter((item) => item.comparison.ofertas.length > 0);
  if (pricedItems.length < 2) return null;
  let mixedTotal = 0;
  const storeTotals = new Map<string, { sum: number; covered: number }>();
  for (const { comparison } of pricedItems) {
    const sorted = [...comparison.ofertas].sort(
      (a, b) => effectiveOfferTotal(a) - effectiveOfferTotal(b),
    );
    mixedTotal += effectiveOfferTotal(sorted[0]);
    const cheapestInStore = new Map<string, number>();
    for (const o of sorted) {
      const val = effectiveOfferTotal(o);
      const prev = cheapestInStore.get(o.tienda);
      if (prev == null || val < prev) cheapestInStore.set(o.tienda, val);
    }
    for (const [store, val] of cheapestInStore.entries()) {
      const prev = storeTotals.get(store) || { sum: 0, covered: 0 };
      storeTotals.set(store, { sum: prev.sum + val, covered: prev.covered + 1 });
    }
  }
  const fullCoverageStores = Array.from(storeTotals.entries())
    .filter(([, stats]) => stats.covered === pricedItems.length)
    .sort((a, b) => a[1].sum - b[1].sum);
  const lines = [
    `Resumen de compra (${pricedItems.length} de ${items.length} materiales con precio):`,
    `• Compra mixta más barata: ${clp(mixedTotal)}`,
  ];
  if (fullCoverageStores.length > 0) {
    const [bestStore, bestStats] = fullCoverageStores[0];
    const diff = bestStats.sum - mixedTotal;
    lines.push(
      `• Todo en ${bestStore}: ${clp(bestStats.sum)}${diff > 0 ? ` (+${clp(diff)} vs mixta, ahorra doble flete)` : " (mismo costo total)"}`,
    );
  }
  return lines.join("\n");
}
export const MATERIAL_CATEGORY_LABELS: Record<string, string> = {
  obra_gruesa: "Obra gruesa",
  ferreteria: "Ferretería",
  terminaciones: "Terminaciones",
  pintura: "Pintura",
  instalaciones: "Instalaciones",
  electricidad: "Electricidad",
  gasfiteria: "Gasfitería",
  estructura: "Estructura",
  herramientas: "Herramientas",
  otro: "Otro",
};

export function formatMaterialCategory(raw?: string | null): string {
  if (!raw || !raw.trim()) return "General";
  const key = raw.trim().toLowerCase();
  if (MATERIAL_CATEGORY_LABELS[key]) return MATERIAL_CATEGORY_LABELS[key];
  if (raw.includes("_")) {
    const cleaned = raw.replace(/_/g, " ").trim();
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return raw;
}

function nearbyStoresSummary(data: ComparacionMateriales): string | null {
  if (!data.ferreterias_cercanas?.length) return null;
  const lines = data.ferreterias_cercanas.slice(0, 6).map((f) => {
    const kind = f.tipo === "cadena" ? "Cadena" : "Ferretería local";
    const dist = `${f.distancia_km.toLocaleString("es-CL")} km`;
    const parts = [
      `• ${f.nombre} (${kind} · ${dist})`,
      f.direccion ? f.direccion : "",
      f.url_whatsapp ? `Cotizar WhatsApp: ${f.url_whatsapp}` : "",
      f.url_busqueda ? `Ver catálogo: ${f.url_busqueda}` : "",
      `Mapa: ${f.url_mapa}`,
    ].filter(Boolean);
    return parts.join(" · ");
  });
  return `Ferreterías cercanas a la obra:\n${lines.join("\n")}`;
}

function historyComparisonSummary(data: ComparacionMateriales): string | null {
  if (!data.historial_empresa?.length) return null;
  const bestOnline = data.ofertas.length > 0 ? data.ofertas[0].precio : null;
  const lines = data.historial_empresa.map((h) => {
    const daysText =
      h.dias_desde_compra != null
        ? h.dias_desde_compra === 0
          ? "hoy"
          : `hace ${h.dias_desde_compra} día${h.dias_desde_compra === 1 ? "" : "s"}`
        : "";
    const diff =
      bestOnline != null ? h.precio_unitario - bestOnline : null;
    const diffText =
      diff == null
        ? ""
        : diff < 0
          ? ` (${clp(Math.abs(diff))} más barato que el menor online)`
          : diff > 0
            ? ` (+${clp(diff)} vs el menor online)`
            : " (mismo valor que el menor online)";
    const meta = [h.proyecto_nombre, h.comuna, daysText].filter(Boolean).join(" · ");
    return `• ${h.proveedor}: ${h.nombre} — ${clp(h.precio_unitario)} / ${h.unidad}${diffText}${meta ? ` (${meta})` : ""}`;
  });
  return `Tus compras anteriores en ObraTrack:\n${lines.join("\n")}`;
}

export function formatMaterialComparison(data: ComparacionMateriales) {
  const rows = data.ofertas.map(
    (o, i) =>
      `${i + 1}. ${o.tienda}: ${o.nombre}\nPrecio publicado: ${clp(o.precio)}${offerQuantityDetail(o, data)}${o.sucursal_cercana_km != null ? ` · Sucursal a ${o.sucursal_cercana_km.toLocaleString("es-CL")} km` : ""}${data.mejores_ids.includes(o.id) ? " · Menor precio entre productos equivalentes consultados" : ""}\n${o.url}`,
  );
  const storeSummary = storeComparisonSummary(data);
  const historySummary = historyComparisonSummary(data);
  const nearbySummary = nearbyStoresSummary(data);
  const providers = data.proveedores
    .map(
      (p) =>
        `${p.nombre}: ${p.estado === "consultado" ? "consultado" : p.estado === "sin_resultados" ? "sin coincidencias" : "no disponible para esta consulta"}`,
    )
    .join("; ");
  return [
    data.resumen,
    storeSummary,
    ...rows,
    historySummary,
    nearbySummary,
    `Consulta: ${new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "medium", timeStyle: "short" }).format(new Date(data.consultado_en))} · ${providers}.`,
    `Precios publicados en CLP; confirma IVA, stock local, promociones y despacho${data.consulta.ubicacion ? " para " + data.consulta.ubicacion : ""} en la tienda antes de comprar.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function formatBatchMaterialComparison(
  items: Array<{ label: string; comparison: ComparacionMateriales }>,
  ubicacion?: string,
) {
  const blocks = items.map(({ label, comparison }, idx) => {
    const top = comparison.ofertas.slice(0, 3);
    if (!top.length) {
      return `${idx + 1}. ${label}\nSin coincidencias exactas en los catálogos consultados (${comparison.proveedores.filter((p) => p.estado === "no_disponible").map((p) => p.nombre).join(", ") || "tiendas sin stock publicado"}).`;
    }
    const lines = top.map(
      (o) =>
        `• ${o.tienda}: ${o.nombre} — ${clp(o.precio)}${o.cajas_necesarias != null && o.total_solicitado != null ? ` (${o.cajas_necesarias} cajas: ${clp(o.total_solicitado)})` : o.total_solicitado != null ? ` (${comparison.consulta.cantidad} u.: ${clp(o.total_solicitado)})` : ""}\n  ${o.url}`,
    );
    return `${idx + 1}. ${label}\n${lines.join("\n")}`;
  });
  const cartSummary = batchCartSummary(items);
  return [
    `Precios reales consultados en tiendas para ${items.length} ${items.length === 1 ? "material" : "materiales"}:`,
    ...blocks,
    cartSummary,
    `Precios publicados en CLP; confirma formato, IVA, stock local y despacho${ubicacion && ubicacion !== "Por definir" ? " en " + ubicacion : ""} antes de comprar o ajustar la cotización.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
