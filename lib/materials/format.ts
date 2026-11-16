import type { ComparacionMateriales } from "./types";
const clp = (v: number) => "$" + v.toLocaleString("es-CL") + " CLP";
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

export function formatMaterialComparison(data: ComparacionMateriales) {
  const rows = data.ofertas.map(
    (o, i) =>
      `${i + 1}. ${o.tienda}: ${o.nombre}\nPrecio publicado: ${clp(o.precio)}${o.total_solicitado != null ? ` · ${data.consulta.cantidad} unidades: ${clp(o.total_solicitado)}` : ""}${data.mejores_ids.includes(o.id) ? " · Menor precio entre productos equivalentes consultados" : ""}\n${o.url}`,
  );
  const providers = data.proveedores
    .map(
      (p) =>
        `${p.nombre}: ${p.estado === "consultado" ? "consultado" : p.estado === "sin_resultados" ? "sin coincidencias" : "no disponible para esta consulta"}`,
    )
    .join("; ");
  return [
    data.resumen,
    ...rows,
    `Consulta: ${new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "medium", timeStyle: "short" }).format(new Date(data.consultado_en))} · ${providers}.`,
    `Precios publicados en CLP; confirma IVA, stock local, promociones y despacho${data.consulta.ubicacion ? " para " + data.consulta.ubicacion : ""} en la tienda antes de comprar.`,
  ].join("\n\n");
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
        `• ${o.tienda}: ${o.nombre} — ${clp(o.precio)}${o.total_solicitado != null ? ` (${comparison.consulta.cantidad} u.: ${clp(o.total_solicitado)})` : ""}\n  ${o.url}`,
    );
    return `${idx + 1}. ${label}\n${lines.join("\n")}`;
  });
  return [
    `Precios reales consultados en tiendas para ${items.length} ${items.length === 1 ? "material" : "materiales"}:`,
    ...blocks,
    `Precios publicados en CLP; confirma formato, IVA, stock local y despacho${ubicacion && ubicacion !== "Por definir" ? " en " + ubicacion : ""} antes de comprar o ajustar la cotización.`,
  ].join("\n\n");
}
