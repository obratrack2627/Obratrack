import type { CotizacionEstimacion, EmpresaConfiguracion } from '@/types/database';

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
  precioUnit: number;
  total: number;
}

export const quoteMoney = (value: number) => `$ ${value.toLocaleString('es-CL')}`;

const dateLabel = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('-');
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Por definir' : date.toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Santiago',
  });
};

// La vista previa y el PDF consumen el mismo detalle y los mismos montos guardados.
export function buildQuoteDocument(quote: CotizacionEstimacion, options: QuoteDocumentOptions = {}) {
  const f = quote.estructura_financiera;
  const cfg: EmpresaConfiguracion = options.emisor?.empresa_configuracion || {};
  const items: QuoteLine[] = quote.modo_presupuesto === 'precio_acordado' ? (quote.partidas_venta || []).map((p) => ({ nombre: p.nombre, descripcion: '', unidad: p.unidad, cantidad: p.cantidad, precioUnit: p.precio_unitario, total: p.subtotal })) : [
    ...quote.materiales.map((m) => ({
      nombre: m.nombre,
      descripcion: m.alternativa_economica || '',
      unidad: m.unidad || 'un',
      cantidad: m.cantidad,
      precioUnit: m.precio_mas_barato ?? m.precio_unitario_estimado,
      total: m.subtotal,
    })),
    ...quote.mano_de_obra.map((m) => ({
      nombre: `Mano de obra: ${m.rol}`,
      descripcion: `${m.cantidad_personas} persona(s) · ${m.dias_estimados} día(s)`,
      unidad: 'gl', cantidad: 1, precioUnit: m.subtotal, total: m.subtotal,
    })),
  ];
  const indirects: [string, number][] = [
    ['Gastos generales', f.gastos_generales_monto],
    ['Provisión de imprevistos', f.imprevistos_monto],
    [f.tipo_utilidad === 'margen_venta' ? 'Margen sobre venta' : 'Utilidad', f.margen_utilidad_monto],
  ];
  for (const [nombre, total] of quote.modo_presupuesto === 'precio_acordado' ? [] : indirects) {
    if (total) items.push({ nombre, descripcion: '', unidad: 'gl', cantidad: 1, precioUnit: total, total });
  }
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

  return {
    folio,
    filename: (quote.nombre_archivo?.trim() ? quote.nombre_archivo.replace(/\.pdf$/i, '') : `ObraTrack_Cotizacion_${folio}_${quote.titulo_proyecto}${quote.nombre_alternativa ? '_' + quote.nombre_alternativa : ''}`).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 120) + '.pdf',
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
    subtotal: f.precio_sugerido_neto,
    iva: f.iva_19,
    total: f.precio_total_con_iva,
    observaciones: [
      quote.modo_presupuesto === 'precio_acordado' ? (quote.tratamiento_iva === 'incluido' ? 'Precios acordados en CLP, IVA incluido en las partidas.' : 'Precios acordados netos en CLP. IVA del 19% desglosado al final.') : 'Valores netos en CLP. IVA del 19% desglosado al final.',
      ...(quote.modo_presupuesto === 'precio_acordado' ? [] : ['Precios estimados sujetos a confirmación de cantidades, disponibilidad y despacho.']),
      quote.duracion_dias_estimada ? `Plazo estimado: ${quote.duracion_dias_estimada} día(s). Cronograma a acordar.` : 'Plazo de ejecución por acordar.',
      ...(quote.observaciones ? [quote.observaciones] : []),
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
