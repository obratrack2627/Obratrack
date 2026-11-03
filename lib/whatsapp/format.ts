import type { CotizacionEstimacion } from "@/types/database";
import type { ComparacionMateriales } from "@/lib/materials/types";
import { formatCLP } from "@/lib/utils";
import { profitLabel } from "@/lib/ai/quote-format";

export const WHATSAPP_BRAND = "🟧 *ObraTrack*";
const createOption = "*1* · Crear la obra";
const modifyOption = "*2* · Modificar la cotización";
const compareOption = "*3* · Comparar materiales";
const line = (text: string) => text.replace(/[\r\n*]+/g, " ").trim();
const count = (n: number, singular: string, plural: string) => `${n.toLocaleString("es-CL")} ${n === 1 ? singular : plural}`;

export function whatsappText(text: string) {
  return text.replace(/\r\n?/g, "\n")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s]+)\)/g, "$1\n$2")
    .replace(/\*\*([^*]+)\*\*/g, "*$1*")
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/^[ \t]*[-+]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function whatsappCard(title: string, body: string) {
  const content = whatsappText(body).split("\n")
    .filter((s) => s.trim() !== WHATSAPP_BRAND).join("\n").trim();
  return `${WHATSAPP_BRAND}\n*${line(title)}*\n\n${content}`;
}

export function quoteWhatsApp(q: CotizacionEstimacion, canCreate = true) {
  if (q.alternativas?.length) {
    const options = [q, ...q.alternativas];
    return whatsappCard(`Alternativas · ${q.titulo_proyecto}`, [
      '*ALTERNATIVAS*', ...options.map((a, i) => [`*${i + 1}* · *${line(a.nombre_alternativa || `Opción ${i + 1}`)}*`,
        a.resumen_ejecutivo,
        ...(a.partidas_venta || []).map((p) => `• ${line(p.nombre)}: ${formatCLP(p.subtotal)}`),
        ...a.materiales.map((m) => `• ${line(m.nombre)}: ${m.cantidad} ${m.unidad}`),
        `*TOTAL: ${formatCLP(a.estructura_financiera.precio_total_con_iva)}*`,
      ].filter(Boolean).join('\n')),
      'Estas propuestas son alternativas completas para la misma obra. Sus totales no se suman.',
      canCreate ? 'Responde con el número o nombre de la alternativa que quieres elegir. Si falta información del cliente, te pediré los datos necesarios.' : 'Puedes revisar las propuestas en ObraTrack.',
      'Para editar o comparar un material, indica la alternativa y el cambio que necesitas.',
    ].join('\n\n'));
  }
  const f = q.estructura_financiera;
  const sections = [
    [q.comuna_region ? `📍 ${q.comuna_region}` : "", q.metros_cuadrados ? `Superficie: ${q.metros_cuadrados.toLocaleString("es-CL")} m²` : ""].filter(Boolean).join(" · "),
    q.resumen_ejecutivo,
    q.modo_presupuesto === 'precio_acordado' ? ['*PRECIOS ACORDADOS*', ...(q.partidas_venta || []).map((p) => `• ${line(p.nombre)}: ${formatCLP(p.subtotal)}`)].join('\n') : ["*DETALLE*", `• Materiales: ${formatCLP(f.costo_materiales_total)}`, `• Mano de obra: ${formatCLP(f.costo_mano_obra_total)}`,
      `• Gastos generales: ${formatCLP(f.gastos_generales_monto)}`, `• Imprevistos: ${formatCLP(f.imprevistos_monto)}`,
      `• ${profitLabel(q)}: ${formatCLP(f.margen_utilidad_monto)}`].join("\n"),
    [`Neto: ${formatCLP(f.precio_sugerido_neto)}`, `IVA (19%): ${formatCLP(f.iva_19)}`, `*TOTAL: ${formatCLP(f.precio_total_con_iva)}*`].join("\n"),
    q.materiales.length ? "*MATERIALES COTIZADOS · NETO*\n" + q.materiales.map((m) =>
      `• ${line(m.nombre)}\n  ${m.cantidad.toLocaleString("es-CL")} ${m.unidad} × ${formatCLP(m.precio_unitario_estimado)} · ${formatCLP(m.subtotal)}`).join("\n\n") : "",
    q.mano_de_obra.length ? "*MANO DE OBRA*\n" + q.mano_de_obra.map((m) =>
      `• ${line(m.rol)}\n  ${count(m.cantidad_personas, "persona", "personas")} × ${count(m.dias_estimados, "día", "días")} · ${formatCLP(m.subtotal)}`).join("\n\n") : "",
    q.duracion_dias_estimada ? `🗓️ *Plazo sugerido: ${count(q.duracion_dias_estimada, "día", "días")}*` : "",
    q.actividades_gantt?.length ? "*GANTT SUGERIDO*\n" + q.actividades_gantt.map((a, i) => `${i + 1}. ${line(a.nombre)} — ${count(a.dias, "día", "días")}`).join("\n") : "",
    q.observaciones ? `*OBSERVACIONES*\n${q.observaciones}` : "",
    q.condiciones_pago ? `*CONDICIONES DE PAGO*\n${q.condiciones_pago}` : "",
    q.hitos_pago?.length ? '*PLAN DE COBRO*\n' + q.hitos_pago.map((h) => `• ${h.nombre} (${h.porcentaje}%): ${formatCLP(h.monto)}`).join('\n') : '',
    (q.modo_presupuesto === 'precio_acordado' ? 'Precios proporcionados para esta propuesta.' : '📌 Precios estimados, sujetos a confirmación.') + '\nPDF disponible en ObraTrack → Reportes WhatsApp.',
    ["*¿Cómo seguimos?*", ...(canCreate ? [createOption] : []), modifyOption, compareOption,
      ...(canCreate ? ["", "Para crearla responde *1* o *sí*. Se incorporarán el Gantt sugerido y sus materiales; te pediré los datos del cliente que falten."] : [])].join("\n"),
  ];
  return whatsappCard(`Cotización · ${q.titulo_proyecto}`, sections.filter(Boolean).join("\n\n"));
}

// Las opciones numéricas solo tienen significado inmediatamente después del menú mostrado.
export function quoteMenuChoice(text: string, previous: any): 1 | 2 | 3 | null {
  if (!previous?.cotizacion || !/^[123][.!]?\s*$/.test(text.trim())) return null;
  const choice = Number(text.trim()[0]) as 1 | 2 | 3;
  const label = { 1: createOption, 2: modifyOption, 3: compareOption }[choice];
  return previous.respuesta?.includes(label) ? choice : null;
}

export function materialComparisonWhatsApp(data: ComparacionMateriales) {
  const sections = [data.resumen,
    ...data.ofertas.map((o, i) => [
      `*${i + 1}. ${line(o.tienda)} · ${line(o.nombre)}*`,
      `Precio publicado: *${formatCLP(o.precio)}*`,
      `Unidad de venta: ${o.unidad}`,
      o.total_solicitado != null ? `Total solicitado: *${formatCLP(o.total_solicitado)}*` : "",
      data.mejores_ids.includes(o.id) ? "✓ Menor precio entre productos equivalentes consultados" : "",
      o.url,
    ].filter(Boolean).join("\n")),
    "*FERRETERÍAS CONSULTADAS*\n" + data.proveedores.map((p) =>
      `• ${p.nombre}: ${p.estado === "consultado" ? "consultado" : p.estado === "sin_resultados" ? "sin coincidencias" : "no disponible para esta consulta"}`).join("\n"),
    `Consulta: ${new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "medium", timeStyle: "short" }).format(new Date(data.consultado_en))}`,
    `Precios publicados en CLP; confirma IVA, stock local, promociones y despacho${data.consulta.ubicacion ? " para " + data.consulta.ubicacion : ""} en la tienda antes de comprar.`,
  ];
  return whatsappCard("Precios de materiales", sections.filter(Boolean).join("\n\n"));
}

export function splitWhatsAppMessage(text: string) {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > 3900) {
    let end = rest.lastIndexOf("\n\n", 3900);
    if (end <= 0) end = rest.lastIndexOf("\n", 3900);
    if (end <= 0) end = rest.lastIndexOf(" ", 3900);
    if (end <= 0) end = 3900;
    // No cortar un carácter Unicode representado por dos unidades UTF-16.
    if (/[\uD800-\uDBFF]/.test(rest[end - 1])) end--;
    parts.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  if (rest) parts.push(rest);
  return parts.map((part, i) => i === 0 ? part : `${WHATSAPP_BRAND}\n_Continuación ${i + 1}/${parts.length}_\n\n${part}`);
}
