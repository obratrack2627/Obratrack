import type { CotizacionEstimacion } from "@/types/database";
import type { ComparacionMateriales } from "@/lib/materials/types";
import { formatCLP, formatDate } from "@/lib/utils";
import { quoteLinePreview, materialLines, saleLines, type QuoteLine } from '@/lib/quotes/document';
import { actionReply } from '@/lib/ai/action-reply';

export const WHATSAPP_BRAND = "🟧 *ObraTrack*";
const createOption = "*1* · Crear la obra";
const modifyOption = "*2* · Modificar la cotización";
const compareOption = "*3* · Comparar materiales";
const line = (text: string) => text.replace(/[\r\n*]+/g, " ").trim();
const count = (n: number, singular: string, plural: string) => `${n.toLocaleString("es-CL")} ${n === 1 ? singular : plural}`;

export function whatsappText(text: string) {
  return text.replace(/\r\n?/g, "\n")
    // Las partes no admiten otro inicio de enlace; un Markdown incompleto
    // no vuelve a recorrer el mismo sufijo desde cada corchete.
    .replace(/\[([^[\]\r\n]+)\]\((https?:\/\/[^\s[\]]+)\)/g, "$1\n$2")
    .replace(/\*\*([^*]+)\*\*/g, "*$1*")
    .split("\n").filter(row => ![WHATSAPP_BRAND, "*Consulta de obra*", "*Registro de obra*", "✅ *Guardado en ObraTrack*"].includes(row.trim())).map((row) => {
      const heading = /^#{1,6}[ \t]+/.exec(row);
      if (heading && heading[0].length < row.length) return `*${row.slice(heading[0].length)}*`;
      return row.replace(/^[ \t]*[-+][ \t]+/, "• ");
    }).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function whatsappCard(title: string, body: string) {
  const content = whatsappText(body).split("\n")
    .filter((s) => s.trim() !== WHATSAPP_BRAND).join("\n").trim();
  return /^(Cotización|Alternativas|Precios de materiales)/.test(title) ? `*${line(title)}*\n\n${content}` : content;
}

/** Confirmación breve derivada del registro preparado; se envía solo tras persistir. */
export function photoReceiptWhatsApp(result: any, attachment: any, projects: any[]): string | null {
  if (!attachment?.proyecto_id) return null;
  const leaves = (value: any): any[] => value?.tipo === 'lote_acciones'
    ? (value.detalles?.acciones || []).flatMap(leaves) : value ? [value] : [];
  const results = leaves(result);
  const photoLog = results.find(row => row.tipo === 'crear_bitacora' && row.detalles?.proyecto_id === attachment.proyecto_id
    && String(row.detalles.foto_url || '').includes(attachment.path));
  const record = photoLog?.detalles;
  const project = projects.find(row => row.id === attachment.proyecto_id);
  if (!record || !project) return null;
  const types: Record<string,string> = { incidente: 'Incidente', avance: 'Avance', clima: 'Clima', entrega_material: 'Entrega de materiales' };
  const other = results.filter(row => row !== photoLog).map(actionReply).filter(Boolean);
  return [
    '*Foto guardada*',
    [`*Obra:* ${line(project.nombre)}`, `*Tipo:* ${types[record.tipo] || 'Reporte de terreno'}`, record.titulo ? `*Detalle:* ${line(record.titulo)}` : ''].filter(Boolean).join('\n'),
    'La foto y el reporte quedaron en la bitácora.',
    other.length ? '*Otros cambios*\n' + other.join('\n\n') : '',
  ].filter(Boolean).join('\n\n');
}

export function dailyCloseWhatsApp(result: any): string | null {
  const doc = result?.detalles;
  if (result?.tipo !== 'registrar_documento' || doc?.categoria !== 'cierre_diario' || !doc.cierre_resumen || !doc.id || !doc.proyecto_id) return null;
  const summary = doc.cierre_resumen;
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://obratrack-cl.vercel.app').replace(/\/+$/, '');
  return ['*Cierre de jornada guardado*',
    [`*Obra:* ${line(summary.proyecto_nombre)}`, `*Fecha:* ${formatDate(summary.fecha)}`, summary.confirmado_por ? `*Responsable:* ${line(summary.confirmado_por)}` : ''].filter(Boolean).join('\n'),
    'Ver resumen y descargar PDF:\n' + `${base}/proyectos/${encodeURIComponent(doc.proyecto_id)}/documentos?documento=${encodeURIComponent(doc.id)}`,
  ].join('\n\n');
}

function previewSection(label: string, rows: QuoteLine[]) {
  if (!rows.length) return '';
  const visible = rows.slice(0, 8);
  return [
    `*${label}*`,
    ...visible.map(quoteLinePreview),
    rows.length > visible.length ? `Se muestran ${visible.length} de ${rows.length}. El PDF incluye el listado completo.` : '',
  ].filter(Boolean).join('\n');
}

function quoteSummary(q: CotizacionEstimacion) {
  const f = q.estructura_financiera;
  const agreed = q.modo_presupuesto === 'precio_acordado';
  const otherCosts = f.gastos_generales_monto + f.imprevistos_monto + f.margen_utilidad_monto;
  const tax = q.tratamiento_iva === 'incluido' ? 'IVA incluido' : 'valores netos';
  const location = [q.comuna_region, q.metros_cuadrados ? `${q.metros_cuadrados.toLocaleString('es-CL')} m²` : '',
    q.duracion_dias_estimada ? count(q.duracion_dias_estimada, 'día', 'días') : ''].filter(Boolean).join(' · ');
  const sale = agreed ? saleLines(q) : [];
  const saleWork = sale.filter((l) => l.tipo !== 'material');
  const saleMat = sale.filter((l) => l.tipo === 'material');
  const splitAgreedSections = agreed && saleWork.length > 0 && saleMat.length > 0;
  return [
    location,
    splitAgreedSections ? previewSection(`Partidas / Trabajos · ${tax}`, saleWork) : '',
    splitAgreedSections ? previewSection(`Materiales · ${tax}`, saleMat) : '',
    agreed && !splitAgreedSections ? previewSection(`Partidas acordadas · ${tax}`, sale) : '',
    !splitAgreedSections
      ? previewSection(agreed ? 'Materiales incluidos · referencia neta' : 'Materiales · valores netos', materialLines(q))
      : '',
    !agreed && f.costo_mano_obra_total ? `Mano de obra · ${formatCLP(f.costo_mano_obra_total)}` : '',
    !agreed && otherCosts ? `Gastos, imprevistos y utilidad · ${formatCLP(otherCosts)}` : '',
    `Neto ${formatCLP(f.precio_sugerido_neto)} · IVA (19%) ${formatCLP(f.iva_19)}\n*TOTAL: ${formatCLP(f.precio_total_con_iva)}* (IVA incluido)`,
  ].filter(Boolean).join('\n\n');
}

export function quoteWhatsApp(q: CotizacionEstimacion, canCreate = true) {
  if (q.alternativas?.length) {
    const options = [q, ...q.alternativas];
    return whatsappCard(`Alternativas · ${q.titulo_proyecto}`, [
      '*ALTERNATIVAS*',
      ...options.map((option, index) =>
        `*${index + 1}* · *${line(option.nombre_alternativa || `Opción ${index + 1}`)}*\n${quoteSummary(option)}`),
      'Los totales de las alternativas no se suman.',
      canCreate ? 'Elige por número o nombre para aprobar la alternativa y crear o actualizar la obra.' : '',
    ].filter(Boolean).join('\n\n'));
  }
  const menu = [...(canCreate ? [createOption] : []), modifyOption, compareOption].join('  |  ');
  return whatsappCard(`Cotización · ${q.titulo_proyecto}`, `${quoteSummary(q)}\n\n${menu}`);
}

// Las opciones numéricas solo tienen significado inmediatamente después del menú mostrado.
export function quoteMenuChoice(text: string, previous: any): 1 | 2 | 3 | null {
  if (!previous?.cotizacion || !/^[123][.!]?\s*$/.test(text.trim())) return null;
  const choice = Number(text.trim()[0]) as 1 | 2 | 3;
  const label = { 1: createOption, 2: modifyOption, 3: compareOption }[choice];
  return previous.respuesta?.includes(label) ? choice : null;
}

export function materialComparisonWhatsApp(data: ComparacionMateriales) {
  const effective = (o: ComparacionMateriales["ofertas"][number]) => o.total_solicitado ?? o.precio;
  const bestByStore = new Map<string, number>();
  for (const o of data.ofertas) {
    const val = effective(o);
    const prev = bestByStore.get(o.tienda);
    if (prev == null || val < prev) bestByStore.set(o.tienda, val);
  }
  const rankedStores = Array.from(bestByStore.entries()).sort((a, b) => a[1] - b[1]);
  const storeSummaryLine =
    rankedStores.length >= 2
      ? `*COMPARATIVA POR TIENDA*\n` +
        rankedStores.map(([store, val]) => `• ${store}: desde *${formatCLP(val)}*`).join("\n") +
        (rankedStores[rankedStores.length - 1][1] > rankedStores[0][1]
          ? `\nAhorro estimado eligiendo ${rankedStores[0][0]}: *${formatCLP(rankedStores[rankedStores.length - 1][1] - rankedStores[0][1])}*`
          : "")
      : "";
  const sections = [data.resumen,
    storeSummaryLine,
    ...data.ofertas.map((o, i) => [
      `*${i + 1}. ${line(o.tienda)} · ${line(o.nombre)}*`,
      `Precio publicado: *${formatCLP(o.precio)}*`,
      o.cajas_necesarias != null && o.rendimiento_m2 != null && o.total_solicitado != null
        ? `Rendimiento: ${o.rendimiento_m2.toLocaleString("es-CL")} m²/caja · *${o.cajas_necesarias} ${o.cajas_necesarias === 1 ? "caja" : "cajas"}* (${formatCLP(o.precio_m2 || Math.round(o.precio / o.rendimiento_m2))}/m²) · Total: *${formatCLP(o.total_solicitado)}*`
        : `Unidad de venta: ${o.unidad}`,
      o.cajas_necesarias == null && o.total_solicitado != null ? `Total solicitado: *${formatCLP(o.total_solicitado)}*` : "",
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

export function materialBatchComparisonWhatsApp(
  items: Array<{ label: string; comparison: ComparacionMateriales }>,
  ubicacion?: string,
) {
  const effective = (o: ComparacionMateriales["ofertas"][number]) => o.total_solicitado ?? o.precio;
  const blocks = items.map(({ label, comparison }, idx) => {
    const top = comparison.ofertas.slice(0, 3);
    if (!top.length) {
      return `*${idx + 1}. ${line(label)}*\nSin coincidencias exactas en las tiendas consultadas.`;
    }
    const offersText = top.map(
      (o) =>
        `• *${line(o.tienda)}* · ${line(o.nombre)}\n  Precio publicado: *${formatCLP(o.precio)}*` +
        (o.cajas_necesarias != null && o.total_solicitado != null
          ? ` (${o.cajas_necesarias} cajas: *${formatCLP(o.total_solicitado)}*)`
          : o.total_solicitado != null
            ? ` (${comparison.consulta.cantidad} u.: *${formatCLP(o.total_solicitado)}*)`
            : "") +
        `\n  ${o.url}`,
    );
    return `*${idx + 1}. ${line(label)}*\n${offersText.join("\n")}`;
  });
  const priced = items.filter((item) => item.comparison.ofertas.length > 0);
  let cartBlock = "";
  if (priced.length >= 2) {
    let mixedTotal = 0;
    const storeTotals = new Map<string, { sum: number; covered: number }>();
    for (const { comparison } of priced) {
      const sorted = [...comparison.ofertas].sort((a, b) => effective(a) - effective(b));
      mixedTotal += effective(sorted[0]);
      const bestPerStore = new Map<string, number>();
      for (const o of sorted) {
        const val = effective(o);
        const prev = bestPerStore.get(o.tienda);
        if (prev == null || val < prev) bestPerStore.set(o.tienda, val);
      }
      for (const [store, val] of bestPerStore.entries()) {
        const prev = storeTotals.get(store) || { sum: 0, covered: 0 };
        storeTotals.set(store, { sum: prev.sum + val, covered: prev.covered + 1 });
      }
    }
    const fullStores = Array.from(storeTotals.entries())
      .filter(([, s]) => s.covered === priced.length)
      .sort((a, b) => a[1].sum - b[1].sum);
    const cartLines = [`*RESUMEN DE COMPRA* (${priced.length}/${items.length} con precio)`, `• Mixta más barata: *${formatCLP(mixedTotal)}*`];
    if (fullStores.length > 0) {
      const [bestStore, stats] = fullStores[0];
      const diff = stats.sum - mixedTotal;
      cartLines.push(`• Todo en ${bestStore}: *${formatCLP(stats.sum)}*${diff > 0 ? ` (+${formatCLP(diff)} vs mixta)` : ""}`);
    }
    cartBlock = cartLines.join("\n");
  }
  const providerStates = new Map<string, "consultado" | "sin_resultados" | "no_disponible">();
  for (const item of items) {
    for (const p of item.comparison.proveedores) {
      const prev = providerStates.get(p.nombre);
      if (p.estado === "consultado" || !prev || (prev === "no_disponible" && p.estado === "sin_resultados")) {
        providerStates.set(p.nombre, p.estado);
      }
    }
  }
  const providersList = Array.from(providerStates.entries())
    .map(([nombre, estado]) => `${nombre}: ${estado === "consultado" ? "consultado" : estado === "sin_resultados" ? "sin coincidencias" : "no disponible"}`)
    .join(" · ");
  return whatsappCard(
    "Precios de materiales",
    [
      `Consulté en tiendas reales ${items.length} ${items.length === 1 ? "material" : "materiales"} de la cotización:`,
      ...blocks,
      cartBlock,
      providersList ? `*FERRETERÍAS CONSULTADAS*\n${providersList}` : "",
      `Precios publicados en CLP; confirma formato exacto, IVA, stock local y despacho${ubicacion && ubicacion !== "Por definir" ? " para " + ubicacion : ""} antes de comprar.`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  );
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
  return parts.map((part, i) => i === 0 ? part : `_Continuación ${i + 1}/${parts.length}_\n\n${part}`);
}
