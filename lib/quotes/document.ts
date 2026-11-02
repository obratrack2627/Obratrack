import type { CotizacionEstimacion } from '@/types/database';

export interface QuoteDocumentOptions {
  clienteNombre?: string;
  clienteContacto?: string;
  clienteEmail?: string;
  clienteTelefono?: string;
  emisor?: { nombre?: string; empresa_nombre?: string; email?: string; telefono_whatsapp?: string } | null;
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
  const items: QuoteLine[] = [
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
  for (const [nombre, total] of indirects) {
    if (total) items.push({ nombre, descripcion: '', unidad: 'gl', cantidad: 1, precioUnit: total, total });
  }
  const folio = quote.id.replace(/\D/g, '').slice(-6).padStart(6, '0');
  return {
    folio,
    filename: `ObraTrack_Cotizacion_${folio}_${quote.titulo_proyecto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 65)}.pdf`,
    fecha: dateLabel(quote.fecha_creacion),
    validez: quote.fecha_validez ? dateLabel(quote.fecha_validez) : 'Por acordar',
    cliente: {
      nombre: (options.clienteNombre ?? quote.cliente_nombre) || 'Por definir',
      contacto: (options.clienteContacto ?? quote.cliente_contacto) || 'Por definir',
      email: (options.clienteEmail ?? quote.cliente_email) || 'Por definir',
      telefono: (options.clienteTelefono ?? quote.cliente_telefono) || 'Por definir',
    },
    proyecto: { nombre: quote.titulo_proyecto, ubicacion: quote.comuna_region || 'Por definir', descripcion: quote.resumen_ejecutivo || 'Según detalle de partidas.' },
    items,
    subtotal: f.precio_sugerido_neto,
    iva: f.iva_19,
    total: f.precio_total_con_iva,
    observaciones: [
      'Valores netos en CLP. IVA del 19% desglosado al final.',
      'Precios estimados sujetos a confirmación de cantidades, disponibilidad y despacho.',
      quote.duracion_dias_estimada ? `Plazo estimado: ${quote.duracion_dias_estimada} día(s). Cronograma a acordar.` : 'Plazo de ejecución por acordar.',
      ...(quote.observaciones ? [quote.observaciones] : []),
    ],
    condiciones: quote.condiciones_pago || 'Por acordar con el cliente.',
    emisor: { nombre: options.emisor?.nombre || '', empresa: options.emisor?.empresa_nombre || 'Emitido con ObraTrack', email: options.emisor?.email || '', telefono: options.emisor?.telefono_whatsapp || '' },
  };
}
export type QuoteDocument = ReturnType<typeof buildQuoteDocument>;
