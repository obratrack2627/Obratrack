import type { ComparacionMateriales } from "./types";
const clp = (v: number) => "$" + v.toLocaleString("es-CL") + " CLP";
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
