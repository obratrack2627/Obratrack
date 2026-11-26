import { AIError } from '@/lib/ai/errors';
import { generateAI } from '@/lib/ai/provider';
import { commercialLines } from '@/lib/quotes/commercial';
import { classifyQuoteLineKind, type QuoteLineKind } from '@/lib/quotes/classify';
import { formatCLP } from '@/lib/utils';
import type { MaterialConsiderado } from '@/types/database';

const netIvaPattern = /(?:(?:\b(?:sin\s+iva|no\s+incluye\s+iva|m[aá]s\s+iva|(?:precios?|valores?)\s+netos?)\b)|\+\s*iva\b)/i;
const includedIvaPattern = /\b(?:iva\s+incluido|con\s+iva(?:\s+incluido)?|incluye\s+iva)\b/i;

export interface ParsedQuoteMessageResult {
  titulo_proyecto: string;
  partidas_venta: ReturnType<typeof commercialLines>;
  materiales_considerados?: MaterialConsiderado[];
  mostrar_fecha?: boolean;
  cliente_nombre?: string;
  comuna_region?: string;
  tratamiento_iva: 'incluido' | 'neto';
  resumen_ejecutivo: string;
  condiciones_pago?: string;
  hitos_pago?: { nombre: string; porcentaje: number }[];
  aviso_validacion?: string;
  duracion_dias_estimada?: number;
  plazo_texto: string;
}

interface RawAIQuoteItem {
  nombre?: string;
  unidad?: string;
  cantidad?: number;
  precio_unitario?: number;
  precio_partida?: number | null;
  tipo?: QuoteLineKind;
}

interface RawAIHito {
  nombre?: string;
  porcentaje?: number;
  monto_informado?: number | null;
}

interface RawAIMaterial {
  nombre?: string;
  cantidad?: number | null;
  unidad?: string | null;
}

interface RawAIQuoteParse {
  legible?: boolean;
  titulo_proyecto?: string;
  cliente_nombre?: string | null;
  comuna_region?: string | null;
  mostrar_fecha?: boolean | null;
  tratamiento_iva?: 'incluido' | 'neto';
  total_declarado?: number | null;
  partidas_venta?: RawAIQuoteItem[];
  materiales_considerados?: RawAIMaterial[] | null;
  hitos_pago?: RawAIHito[] | null;
  condiciones_pago?: string | null;
  resumen_ejecutivo?: string | null;
  plazo_texto?: string | null;
  duracion_dias_estimada?: number | null;
}

const quoteParseSchema = {
  type: 'object',
  properties: {
    legible: { type: 'boolean' },
    titulo_proyecto: { type: 'string' },
    cliente_nombre: { type: 'string' },
    comuna_region: { type: 'string' },
    mostrar_fecha: { type: 'boolean' },
    tratamiento_iva: { type: 'string', enum: ['incluido', 'neto'] },
    total_declarado: { type: 'number' },
    partidas_venta: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          unidad: { type: 'string' },
          cantidad: { type: 'number' },
          precio_unitario: { type: 'number' },
          precio_partida: { type: 'number' },
          tipo: { type: 'string', enum: ['partida', 'material'] },
        },
        required: ['nombre', 'unidad', 'cantidad', 'precio_unitario', 'tipo'],
      },
    },
    materiales_considerados: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          cantidad: { type: 'number' },
          unidad: { type: 'string' },
        },
        required: ['nombre'],
      },
    },
    hitos_pago: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          porcentaje: { type: 'number' },
          monto_informado: { type: 'number' },
        },
        required: ['nombre', 'porcentaje'],
      },
    },
    condiciones_pago: { type: 'string' },
    resumen_ejecutivo: { type: 'string' },
    plazo_texto: { type: 'string' },
    duracion_dias_estimada: { type: 'number' },
  },
  required: ['legible', 'tratamiento_iva', 'partidas_venta'],
};

const PARSE_INSTRUCTIONS = [
  'Extrae una cotización o presupuesto de construcción en Chile (CLP) a partir del mensaje del usuario.',
  'Debes adaptarte a los 3 formatos habituales:',
  '1) Suma alzada (nombre general + un total del proyecto, con o sin lista de trabajos): crea 1 partida con cantidad=1, unidad="gl", precio_unitario=0, precio_partida=total y tipo="partida", y pon las tareas en resumen_ejecutivo.',
  '2) Detalle partida por partida y/o material por material con precio individual: crea cada fila en partidas_venta con tipo="partida" para trabajos/mano de obra y tipo="material" para insumos/materiales.',
  '3) Lista de materiales sin precio unitario + totales agrupados (ej. Materiales $ X, Mano de obra $ Y): pon los totales cobrables en partidas_venta y la lista sin precio en materiales_considerados (nunca en resumen_ejecutivo ni observaciones).',
  'Reglas críticas:',
  '- Nunca inventes precios ni alteres cifras en CLP.',
  '- Nunca conviertas cuotas de pago (ej. "60% al inicio $ 1.342.800", "40% al finalizar $ 898.800") en partidas_venta ni en total_declarado: van en hitos_pago.',
  '- Si el usuario pide "sin fecha", pon mostrar_fecha=false.',
  '- Marca legible=false si no hay ningún monto ni total cobrable en el mensaje.',
].join('\n');

export async function parseNaturalQuoteWithAI(
  text: string,
  options: { providedTitle?: string; defaultIva?: 'incluido' | 'neto' } = {},
  generate = generateAI,
): Promise<ParsedQuoteMessageResult> {
  if (text.length > 16000) {
    throw new AIError('OBRABOT_QUOTE_INPUT', 'Divide el presupuesto en un listado más breve para conservar el detalle en esta cotización.', 422);
  }
  const hasNetIva = netIvaPattern.test(text);
  const hasIncludedIva = includedIvaPattern.test(text);
  if (hasNetIva && hasIncludedIva) {
    throw new AIError('OBRABOT_QUOTE_INPUT', 'Confirma si los valores de esta cotización son con IVA incluido o netos más IVA.', 422);
  }

  const contextHint = options.providedTitle ? `Título indicado: ${options.providedTitle}\n\n` : '';
  const raw = await generate(`${contextHint}Mensaje del usuario:\n${text}`, {
    instructions: PARSE_INSTRUCTIONS,
    schema: quoteParseSchema,
    maxOutputTokens: 6000,
    reasoningEffort: 'low',
    timeoutMs: 25000,
    budgetMs: 30000,
  });

  let parsed: RawAIQuoteParse;
  try {
    parsed = JSON.parse(raw) as RawAIQuoteParse;
  } catch {
    throw new AIError('OBRABOT_QUOTE_INPUT', 'No pude interpretar los montos de la cotización. Escribe las partidas o el total general en CLP.', 422);
  }

  if (parsed?.legible === false || !Array.isArray(parsed?.partidas_venta) || !parsed.partidas_venta.length) {
    throw new AIError('OBRABOT_QUOTE_INPUT', 'Incluye al menos una partida o un total del proyecto con su valor en CLP.', 422);
  }

  const mappedLines = parsed.partidas_venta
    .filter((item) => item && typeof item.nombre === 'string' && item.nombre.trim())
    .slice(0, 300)
    .map((item) => {
      const nombre = item.nombre!.trim().slice(0, 500);
      const unidad = (typeof item.unidad === 'string' && item.unidad.trim() ? item.unidad.trim() : 'gl').slice(0, 30);
      const cantidad = typeof item.cantidad === 'number' && Number.isFinite(item.cantidad) && item.cantidad > 0 ? item.cantidad : 1;
      const unitRaw = typeof item.precio_unitario === 'number' && Number.isFinite(item.precio_unitario) && item.precio_unitario >= 0 ? Math.round(item.precio_unitario) : 0;
      const fixedRaw = typeof item.precio_partida === 'number' && Number.isFinite(item.precio_partida) && item.precio_partida >= 0 ? Math.round(item.precio_partida) : undefined;
      const useFixed = fixedRaw != null && (unitRaw === 0 || cantidad !== 1 || Math.round(unitRaw * cantidad) !== fixedRaw);
      const tipo: QuoteLineKind = item.tipo === 'material' || item.tipo === 'partida'
        ? item.tipo
        : classifyQuoteLineKind(nombre, unidad);
      return {
        nombre,
        unidad,
        cantidad,
        precio_unitario: useFixed ? 0 : unitRaw,
        ...(useFixed ? { precio_partida: fixedRaw } : {}),
        tipo,
      };
    });

  if (!mappedLines.length) {
    throw new AIError('OBRABOT_QUOTE_INPUT', 'Incluye al menos una partida o un total del proyecto con su valor en CLP.', 422);
  }

  const partidas = commercialLines(mappedLines);
  const actualTotal = partidas.reduce((sum, line) => sum + line.subtotal, 0);
  if (typeof parsed.total_declarado === 'number' && Number.isFinite(parsed.total_declarado) && parsed.total_declarado > 0) {
    const declared = Math.round(parsed.total_declarado);
    if (declared !== actualTotal) {
      throw new AIError(
        'OBRABOT_QUOTE_INPUT',
        `El total del proyecto informado es ${formatCLP(declared)} y el detalle suma ${formatCLP(actualTotal)}. Confirma qué importe debo corregir.`,
        422,
      );
    }
  }

  let hitos_pago: { nombre: string; porcentaje: number }[] | undefined;
  let aviso_validacion: string | undefined;
  const rawHitos = (parsed.hitos_pago || [])
    .filter((h) => h && typeof h.nombre === 'string' && h.nombre.trim() && typeof h.porcentaje === 'number' && h.porcentaje > 0 && h.porcentaje <= 100);
  const pctSum = rawHitos.reduce((sum, h) => sum + (h.porcentaje ?? 0), 0);
  if (rawHitos.length >= 2 && rawHitos.length <= 12 && Math.abs(pctSum - 100) <= 0.000001) {
    hitos_pago = rawHitos.map((h) => ({ nombre: h.nombre!.trim().slice(0, 150), porcentaje: h.porcentaje! }));
    const notes: string[] = [];
    for (const h of rawHitos) {
      if (typeof h.monto_informado === 'number' && Number.isFinite(h.monto_informado) && h.monto_informado > 0) {
        const expected = Math.round((actualTotal * h.porcentaje!) / 100);
        const stated = Math.round(h.monto_informado);
        if (Math.abs(stated - expected) > 1) {
          notes.push(
            `El ${h.porcentaje}% de ${formatCLP(actualTotal)} corresponde a ${formatCLP(expected)} (indicaste ${formatCLP(stated)}); ajusté «${h.nombre!.trim()}» al cálculo exacto.`,
          );
        }
      }
    }
    if (notes.length) aviso_validacion = notes.join(' ');
  }

  const materiales_considerados: MaterialConsiderado[] | undefined = Array.isArray(parsed.materiales_considerados)
    ? parsed.materiales_considerados
        .filter((m) => m && typeof m.nombre === 'string' && m.nombre.trim())
        .map((m) => ({
          nombre: m.nombre!.trim().slice(0, 300),
          cantidad: typeof m.cantidad === 'number' && Number.isFinite(m.cantidad) && m.cantidad > 0 ? m.cantidad : null,
          ...(typeof m.unidad === 'string' && m.unidad.trim() ? { unidad: m.unidad.trim().slice(0, 30) } : {}),
        }))
    : undefined;

  const tratamiento_iva: 'incluido' | 'neto' = hasNetIva
    ? 'neto'
    : hasIncludedIva
      ? 'incluido'
      : parsed.tratamiento_iva === 'neto'
        ? 'neto'
        : parsed.tratamiento_iva === 'incluido'
          ? 'incluido'
          : (options.defaultIva ?? 'incluido');

  const sinFecha = /\bsin\s+fecha\b/i.test(text) || parsed.mostrar_fecha === false;
  const duracion = typeof parsed.duracion_dias_estimada === 'number' && Number.isFinite(parsed.duracion_dias_estimada) && parsed.duracion_dias_estimada > 0
    ? parsed.duracion_dias_estimada
    : undefined;
  const titulo = options.providedTitle?.trim()
    || parsed.titulo_proyecto?.trim()
    || partidas.slice(0, 3).map((line) => line.nombre).join(', ');

  return {
    titulo_proyecto: titulo.slice(0, 150),
    partidas_venta: partidas,
    ...(materiales_considerados?.length ? { materiales_considerados } : {}),
    ...(sinFecha ? { mostrar_fecha: false } : {}),
    ...(parsed.cliente_nombre?.trim() ? { cliente_nombre: parsed.cliente_nombre.trim().slice(0, 300) } : {}),
    ...(parsed.comuna_region?.trim() ? { comuna_region: parsed.comuna_region.trim().slice(0, 300) } : {}),
    tratamiento_iva,
    resumen_ejecutivo: (parsed.resumen_ejecutivo || '').trim().slice(0, 6000),
    condiciones_pago: hitos_pago ? (parsed.condiciones_pago?.trim() || undefined) : (parsed.condiciones_pago?.trim() || undefined),
    hitos_pago,
    ...(aviso_validacion ? { aviso_validacion } : {}),
    duracion_dias_estimada: duracion,
    plazo_texto: parsed.plazo_texto?.trim() || 'Por acordar',
  };
}
