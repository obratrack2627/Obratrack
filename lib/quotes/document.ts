import type { CotizacionEstimacion, EmpresaConfiguracion } from '@/types/database';

import { formatCLP } from '@/lib/utils';
import { resolveSaleLineKind, type QuoteLineKind } from './classify';

export interface QuoteDocumentEmisorInput {
  nombre?: string;
  empresa_nombre?: string;
  empresa_rut?: string | null;
  empresa_logo_url?: string | null;
  empresa_configuracion?: EmpresaConfiguracion;
  email?: string;
  telefono_whatsapp?: string;
  rut?: string;
  especialidades?: string[];
}

export interface QuoteDocumentOptions {
  clienteNombre?: string;
  clienteContacto?: string;
  clienteEmail?: string;
  clienteTelefono?: string;
  emisor?: QuoteDocumentEmisorInput | null;
}

export interface QuoteLine {
  nombre: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnit: number | null;
  total: number;
  tipo?: QuoteLineKind;
}

export interface QuoteConsideredMaterial {
  nombre: string;
  cantidadTexto: string;
}

export interface QuoteEconomicRow {
  label: string;
  amount: number;
}

export const quoteMoney = (value: number) => `$ ${value.toLocaleString('es-CL')}`;

const foldLine = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

function formatConsideredQty(item: { cantidad?: number | string | null; unidad?: string }): string {
  if (item.cantidad == null || item.cantidad === '') return '—';
  const qtyText =
    typeof item.cantidad === 'number'
      ? item.cantidad.toLocaleString('es-CL', { maximumFractionDigits: 6 })
      : String(item.cantidad).trim();
  const unit = item.unidad?.trim();
  if (!unit || /^(?:un|unidad|unidades|gl)$/i.test(unit)) return qtyText;
  return `${qtyText} ${unit}`;
}

function stripDuplicateMaterialsNote(rawNote: string | undefined, knownNames: string[]): string | undefined {
  if (!rawNote?.trim()) return undefined;
  if (!knownNames.length) return rawNote.trim();
  const knownFolded = knownNames.map(foldLine).filter((n) => n.length >= 3);
  const filtered = rawNote
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (/^(?:materiales(?:\s+considerados)?|insumos(?:\s+considerados)?)\s*:?$/i.test(line)) return false;
      const clean = foldLine(line.replace(/^(?:[•*▪–-]\s*|\d+[.)]\s*)/, ''));
      return !knownFolded.some((mat) => clean === mat || clean.endsWith(` ${mat}`) || clean.includes(mat));
    });
  const text = filtered.join('\n').trim();
  return text || undefined;
}

const dateLabel = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('-');
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Por definir' : date.toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Santiago',
  });
};

export function quoteLinePreview(row: QuoteLine) {
  const quantity = row.cantidad.toLocaleString('es-CL', { maximumFractionDigits: 6 });
  const plain = (text: string) => text.replace(/[\r\n*]+/g, ' ').trim();
  if (row.precioUnit === null) {
    const amount = row.unidad === 'gl' ? '' : ` · ${quantity} ${plain(row.unidad)}`;
    return `• ${plain(row.nombre)}${amount} · ${formatCLP(row.total)}`;
  }
  return `• ${plain(row.nombre)} · ${quantity} ${plain(row.unidad)} × ${formatCLP(row.precioUnit)} = ${formatCLP(row.total)}`;
}

export function materialLines(quote: CotizacionEstimacion): QuoteLine[] {
  return quote.materiales.map(m => ({
    nombre: m.nombre, descripcion: m.alternativa_economica || '', unidad: m.unidad || 'un',
    cantidad: m.cantidad, precioUnit: m.precio_unitario_estimado ?? m.precio_mas_barato, total: m.subtotal,
    tipo: 'material',
  }));
}

export function saleLines(quote: CotizacionEstimacion): QuoteLine[] {
  return (quote.partidas_venta || []).map(p => ({
    nombre: p.nombre, descripcion: '', unidad: p.unidad, cantidad: p.cantidad,
    precioUnit: p.precio_partida == null ? p.precio_unitario : null, total: p.subtotal,
    tipo: resolveSaleLineKind(p),
  }));
}

// La vista previa y el PDF consumen el mismo detalle y los mismos montos guardados.
export function buildQuoteDocument(quote: CotizacionEstimacion, options: QuoteDocumentOptions = {}) {
  const f = quote.estructura_financiera;
  const cfg: EmpresaConfiguracion = options.emisor?.empresa_configuracion || {};
  const isAgreed = quote.modo_presupuesto === 'precio_acordado';
  const materials = materialLines(quote);
  const laborItems: QuoteLine[] = quote.mano_de_obra.map((m) => ({
    nombre: `Mano de obra: ${m.rol}`,
    descripcion: `${m.cantidad_personas} persona(s) · ${m.dias_estimados} día(s)`,
    unidad: 'gl', cantidad: 1, precioUnit: m.subtotal, total: m.subtotal, tipo: 'partida',
  }));
  const indirects: [string, number][] = [
    ['Gastos generales', f.gastos_generales_monto],
    ['Provisión de imprevistos', f.imprevistos_monto],
    [f.tipo_utilidad === 'margen_venta' ? 'Margen sobre venta' : 'Utilidad', f.margen_utilidad_monto],
  ];
  const indirectItems: QuoteLine[] = isAgreed ? [] : indirects
    .filter(([, total]) => Boolean(total))
    .map(([nombre, total]) => ({ nombre, descripcion: '', unidad: 'gl', cantidad: 1, precioUnit: total, total, tipo: 'partida' as const }));
  const items: QuoteLine[] = isAgreed ? saleLines(quote) : [...materials, ...laborItems, ...indirectItems];

  const hasZeroPricedMaterials =
    isAgreed &&
    quote.materiales.length > 0 &&
    quote.materiales.every((m) => (m.precio_unitario_estimado ?? 0) === 0 && m.subtotal === 0);
  const materialesConsiderados: QuoteConsideredMaterial[] = quote.materiales_considerados?.length
    ? quote.materiales_considerados.map((m) => ({ nombre: m.nombre, cantidadTexto: formatConsideredQty(m) }))
    : hasZeroPricedMaterials
      ? quote.materiales.map((m) => ({ nombre: m.nombre, cantidadTexto: formatConsideredQty({ cantidad: m.cantidad, unidad: m.unidad }) }))
      : [];
  const SUMMARY_LINE_RE = /^(?:materiales|total\s+materiales|mano\s+de\s+obra|obra\s+de\s+mano|gastos\s+generales|imprevistos|utilidad|margen)$/i;
  const isGroupedSummaryOnly =
    isAgreed &&
    materialesConsiderados.length > 0 &&
    items.length > 0 &&
    items.every((l) => SUMMARY_LINE_RE.test(l.nombre.trim()));

  const billedMaterials = isAgreed ? items.filter((l) => l.tipo === 'material') : [];
  const partidasSeccion = isGroupedSummaryOnly
    ? []
    : isAgreed
      ? items.filter((l) => l.tipo !== 'material')
      : [...laborItems, ...indirectItems];
  const materialesSeccion = isGroupedSummaryOnly
    ? []
    : isAgreed
      ? (billedMaterials.length > 0 ? billedMaterials : hasZeroPricedMaterials ? [] : materials)
      : materials;
  const materialesEsReferencia = !isGroupedSummaryOnly && isAgreed && billedMaterials.length === 0 && !hasZeroPricedMaterials && materials.length > 0;
  const materialesIncluidos = !isGroupedSummaryOnly && isAgreed && billedMaterials.length === 0 && !hasZeroPricedMaterials ? materials : [];
  const trabajosIncluidos = (quote.actividades_gantt || []).map((a) => ({ nombre: a.nombre, dias: a.dias }));

  const ivaIncluded = isAgreed && quote.tratamiento_iva === 'incluido';
  const indirectTotal = f.gastos_generales_monto + f.imprevistos_monto + f.margen_utilidad_monto;
  const resumenEconomico: QuoteEconomicRow[] = isGroupedSummaryOnly
    ? [
        ...items.map((l) => ({ label: l.nombre.toUpperCase(), amount: l.total })),
        ...(!ivaIncluded && f.iva_19 > 0 && f.precio_total_con_iva !== f.precio_sugerido_neto
          ? [{ label: 'IVA (19%)', amount: f.iva_19 }]
          : []),
      ]
    : isAgreed
      ? [
          ...(partidasSeccion.length && materialesSeccion.length && !materialesEsReferencia
            ? [
                { label: 'PARTIDAS / TRABAJOS', amount: partidasSeccion.reduce((s, r) => s + r.total, 0) },
                { label: 'MATERIALES', amount: materialesSeccion.reduce((s, r) => s + r.total, 0) },
              ]
            : []),
          ...(ivaIncluded
            ? [
                { label: 'NETO (DESGLOSE)', amount: f.precio_sugerido_neto },
                { label: 'IVA INCLUIDO (19%)', amount: f.iva_19 },
              ]
            : [
                { label: 'SUBTOTAL NETO', amount: f.precio_sugerido_neto },
                { label: 'IVA (19%)', amount: f.iva_19 },
              ]),
        ]
      : [
          ...(f.costo_materiales_total ? [{ label: 'MATERIALES', amount: f.costo_materiales_total }] : []),
          ...(f.costo_mano_obra_total ? [{ label: 'MANO DE OBRA', amount: f.costo_mano_obra_total }] : []),
          ...(indirectTotal > 0 ? [{ label: 'GASTOS GENERALES, IMPREVISTOS Y UTILIDAD', amount: indirectTotal }] : []),
          { label: 'SUBTOTAL NETO', amount: f.precio_sugerido_neto },
          { label: 'IVA (19%)', amount: f.iva_19 },
        ];

  const knownMaterialNames = [
    ...materialesConsiderados.map((m) => m.nombre),
    ...quote.materiales.map((m) => m.nombre),
  ];
  const cleanedObservation = stripDuplicateMaterialsNote(quote.observaciones, knownMaterialNames);

  const folio = quote.id.replace(/\D/g, '').slice(-6).padStart(6, '0');
  const rawConditions = [
    ...(quote.hitos_pago || []).map((h) => `${h.nombre} (${h.porcentaje}%): ${quoteMoney(h.monto)}`),
    ...(quote.condiciones_pago ? [quote.condiciones_pago] : []),
  ].join('\n').trim();
  const baseConditions = rawConditions || cfg.condiciones_pago_defecto?.trim() || '';
  const bankDetails = cfg.mostrar_datos_bancarios && cfg.datos_bancarios?.trim() ? cfg.datos_bancarios.trim() : '';
  const condiciones = bankDetails && !baseConditions.includes(bankDetails)
    ? [baseConditions, `Datos transferencia: ${bankDetails}`].filter(Boolean).join('\n')
    : baseConditions || 'Por acordar con el cliente.';

  const companyName = options.emisor?.empresa_nombre?.trim();
  const defaultPrefix = companyName && companyName !== 'Emitido con ObraTrack'
    ? `Cotizacion_${companyName}`
    : 'ObraTrack_Cotizacion';

  return {
    folio,
    filename: (quote.nombre_archivo?.trim() ? quote.nombre_archivo.replace(/\.pdf$/i, '') : `${defaultPrefix}_${folio}_${quote.titulo_proyecto}${quote.nombre_alternativa ? '_' + quote.nombre_alternativa : ''}`).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 120) + '.pdf',
    fecha: quote.mostrar_fecha === false ? '' : dateLabel(quote.fecha_creacion),
    validez: quote.fecha_validez ? dateLabel(quote.fecha_validez) : 'Por acordar',
    cliente: {
      nombre: (options.clienteNombre ?? quote.cliente_nombre) || 'Por definir',
      contacto: (options.clienteContacto ?? quote.cliente_contacto) || 'Por definir',
      email: (options.clienteEmail ?? quote.cliente_email) || 'Por definir',
      telefono: (options.clienteTelefono ?? quote.cliente_telefono) || 'Por definir',
    },
    proyecto: { nombre: quote.titulo_proyecto, ubicacion: quote.comuna_region || 'Por definir', descripcion: [quote.nombre_alternativa ? `Alternativa: ${quote.nombre_alternativa}` : '', quote.resumen_ejecutivo || 'Según detalle de partidas.'].filter(Boolean).join('\n') },
    items,
    partidasSeccion,
    materialesSeccion,
    materialesEsReferencia,
    materialesConsiderados,
    isGroupedSummaryOnly,
    resumenEconomico,
    trabajosIncluidos,
    materialesIncluidos,
    ivaIncluidoEnPartidas: ivaIncluded,
    subtotal: f.precio_sugerido_neto,
    iva: f.iva_19,
    total: f.precio_total_con_iva,
    observaciones: [
      quote.modo_presupuesto === 'precio_acordado' ? (quote.tratamiento_iva === 'incluido' ? 'Precios acordados en CLP, IVA incluido en las partidas.' : 'Precios acordados netos en CLP. IVA del 19% desglosado al final.') : 'Valores netos en CLP. IVA del 19% desglosado al final.',
      ...(quote.modo_presupuesto === 'precio_acordado' ? [] : ['Precios estimados sujetos a confirmación de cantidades, disponibilidad y despacho.']),
      quote.plazo_texto ? `Plazo estimado: ${quote.plazo_texto}.` : quote.duracion_dias_estimada ? `Plazo estimado: ${quote.duracion_dias_estimada} día(s). Cronograma a acordar.` : 'Plazo de ejecución por acordar.',
      ...(cleanedObservation ? [cleanedObservation] : []),
    ],
    condiciones,
    emisor: {
      nombre: options.emisor?.nombre || '',
      empresa: options.emisor?.empresa_nombre || 'Emitido con ObraTrack',
      rut: options.emisor?.empresa_rut || options.emisor?.rut || '',
      logoUrl: options.emisor?.empresa_logo_url || '',
      giro: cfg.giro || '',
      direccion: [cfg.direccion, cfg.comuna].filter(Boolean).join(', '),
      sitioWeb: cfg.sitio_web || '',
      firma: cfg.firma_texto || options.emisor?.empresa_nombre || 'ObraTrack',
      email: cfg.email_comercial || options.emisor?.email || '',
      telefono: cfg.telefono_comercial || options.emisor?.telefono_whatsapp || '',
      cargo: options.emisor?.especialidades?.[0] || '',
    },
  };
}
export type QuoteDocument = ReturnType<typeof buildQuoteDocument>;
