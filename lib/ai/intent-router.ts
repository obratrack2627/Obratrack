import { generateAI, isAIConfigured } from './provider';

export type SemanticIntentKind =
  | 'editar_cotizacion'
  | 'aplicar_cotizacion_a_obra'
  | 'crear_obra_desde_cotizacion'
  | 'descargar_archivo_cotizacion'
  | 'aprobar_cotizacion'
  | 'asignar_equipo'
  | 'conversacion_general';

export interface SemanticQuoteEdit {
  operacion:
    | 'cambiar_total'
    | 'cambiar_partida'
    | 'agregar_partida'
    | 'eliminar_partida'
    | 'cambiar_iva'
    | 'cambiar_plazo'
    | 'cambiar_fecha'
    | 'otro';
  partida_objetivo?: string;
  nuevo_monto_clp?: number;
  nueva_cantidad?: number;
  unidad?: string;
  es_precio_unitario?: boolean;
  tratamiento_iva?: 'incluido' | 'neto';
  mostrar_fecha?: boolean;
  plazo_dias?: number;
  plazo_texto?: string;
  solicita_pdf?: boolean;
}

export interface SemanticProjectDestination {
  obra_nombre?: string;
  cliente_nombre?: string;
  comuna?: string;
  incluir_gantt?: boolean;
  incluir_materiales?: boolean;
}

export interface SemanticIntentResult {
  intent: SemanticIntentKind;
  confidence: 'alta' | 'media' | 'baja';
  cotizacion_hint?: string;
  edicion_cotizacion?: SemanticQuoteEdit;
  destino_obra?: SemanticProjectDestination;
  formato_archivo?: 'pdf' | 'excel';
}

export interface SemanticRouterContext {
  channel: 'web' | 'whatsapp';
  rol?: string;
  hasPendingQuoteReview?: boolean;
  hasActiveQuote?: boolean;
  activeProjectName?: string | null;
  recentQuoteTitles?: string[];
}

const VALID_INTENTS = new Set<SemanticIntentKind>([
  'editar_cotizacion',
  'aplicar_cotizacion_a_obra',
  'crear_obra_desde_cotizacion',
  'descargar_archivo_cotizacion',
  'aprobar_cotizacion',
  'asignar_equipo',
  'conversacion_general',
]);

const EXPLICIT_COMMAND_RE =
  /^(?:ot:|nueva cotizaci[oó]n|aprueba cotizaci[oó]n|revisa cotizaci[oó]n|corrige cotizaci[oó]n|devuelve cotizaci[oó]n)/i;
const UUID_RE = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;
const TRIVIAL_REPLY_RE =
  /^(?:hola|buenas|gracias|ok|okay|si|s[ií]|no|dale|listo|cancelar|deshacer|[1-4])[.!?]*$/i;
const DOMAIN_SIGNAL_RE =
  /\b(?:cotiz\w*|presupuest\w*|pdf|excel|gantt|obra|proyecto|fecha|iva|total|precio|monto|lucas?|palos?|mill[oó]n)\b/i;

export function shouldUseSemanticIntentRouter(
  text: string,
  ctx: SemanticRouterContext,
  hasCustomGenerator = false,
): boolean {
  if (!hasCustomGenerator && !isAIConfigured()) return false;
  if (ctx.rol === 'terreno') return false;
  const clean = (text || '').trim();
  if (!clean || clean.length < 4 || clean.length > 1200) return false;
  if (EXPLICIT_COMMAND_RE.test(clean) || UUID_RE.test(clean)) return false;
  if (TRIVIAL_REPLY_RE.test(clean)) return false;
  return Boolean(ctx.hasPendingQuoteReview || ctx.hasActiveQuote || DOMAIN_SIGNAL_RE.test(clean));
}

const intentRouterSchema = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: [
        'editar_cotizacion',
        'aplicar_cotizacion_a_obra',
        'crear_obra_desde_cotizacion',
        'descargar_archivo_cotizacion',
        'aprobar_cotizacion',
        'asignar_equipo',
        'conversacion_general',
      ],
    },
    confidence: { type: 'string', enum: ['alta', 'media', 'baja'] },
    cotizacion_hint: { type: 'string' },
    edicion_cotizacion: {
      type: 'object',
      properties: {
        operacion: {
          type: 'string',
          enum: [
            'cambiar_total',
            'cambiar_partida',
            'agregar_partida',
            'eliminar_partida',
            'cambiar_iva',
            'cambiar_plazo',
            'cambiar_fecha',
            'otro',
          ],
        },
        partida_objetivo: { type: 'string' },
        nuevo_monto_clp: { type: 'number' },
        nueva_cantidad: { type: 'number' },
        unidad: { type: 'string' },
        es_precio_unitario: { type: 'boolean' },
        tratamiento_iva: { type: 'string', enum: ['incluido', 'neto'] },
        mostrar_fecha: { type: 'boolean' },
        plazo_dias: { type: 'number' },
        plazo_texto: { type: 'string' },
        solicita_pdf: { type: 'boolean' },
      },
      required: ['operacion'],
    },
    destino_obra: {
      type: 'object',
      properties: {
        obra_nombre: { type: 'string' },
        cliente_nombre: { type: 'string' },
        comuna: { type: 'string' },
        incluir_gantt: { type: 'boolean' },
        incluir_materiales: { type: 'boolean' },
      },
    },
    formato_archivo: { type: 'string', enum: ['pdf', 'excel'] },
  },
  required: ['intent', 'confidence'],
};

const ROUTER_INSTRUCTIONS = [
  'Clasifica la intención de un mensaje enviado por un constructor/contratista chileno a ObraBot y extrae los campos estructurados.',
  'Expresiones chilenas habituales:',
  '- "1 palo", "un palo ochocientos" => 1000000, 1800000; "50 lucas" => 50000.',
  '- "sácale/quita/sin la fecha" => intent="editar_cotizacion", operacion="cambiar_fecha", mostrar_fecha=false.',
  '- "bájalo / déjalo / ajusta el total a X" => intent="editar_cotizacion", operacion="cambiar_total", nuevo_monto_clp=X.',
  '- "ponle/agrega/carga ese presupuesto/cotización a la obra" => intent="aplicar_cotizacion_a_obra" (NUNCA asignar_equipo).',
  '- "crea/ármame la obra con esa cotización (para cliente X)" => intent="crear_obra_desde_cotizacion".',
  '- "mándame/descarga el pdf/excel" => intent="descargar_archivo_cotizacion".',
  '- Si hay duda o es una pregunta abierta / saludo / reporte diario / registro de persona real => "conversacion_general" o "asignar_equipo" con personas reales.',
  '- Nunca inventes montos que el usuario no mencionó.',
].join('\n');

export async function classifyTurnIntent(
  text: string,
  ctx: SemanticRouterContext,
  generate = generateAI,
): Promise<SemanticIntentResult | null> {
  const hasCustom = generate !== generateAI;
  if (!shouldUseSemanticIntentRouter(text, ctx, hasCustom)) return null;

  const contextLines = [
    `Canal: ${ctx.channel}`,
    ctx.rol ? `Rol: ${ctx.rol}` : '',
    `Cotización pendiente de aprobación: ${ctx.hasPendingQuoteReview ? 'sí' : 'no'}`,
    `Cotización reciente disponible en conversación: ${ctx.hasActiveQuote ? 'sí' : 'no'}`,
    ctx.activeProjectName ? `Obra activa en contexto: ${ctx.activeProjectName}` : '',
    ctx.recentQuoteTitles?.length ? `Cotizaciones recientes: ${ctx.recentQuoteTitles.slice(0, 3).join(' | ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const raw = await generate(`${contextLines}\n\nMensaje del usuario:\n${text.trim()}`, {
      instructions: ROUTER_INSTRUCTIONS,
      schema: intentRouterSchema,
      reasoningEffort: 'minimal',
      maxOutputTokens: 1000,
      timeoutMs: 12000,
      budgetMs: 15000,
    });
    const parsed = JSON.parse(raw) as Partial<SemanticIntentResult>;
    if (!parsed || !VALID_INTENTS.has(parsed.intent as SemanticIntentKind)) return null;
    const confidence =
      parsed.confidence === 'alta' || parsed.confidence === 'media' || parsed.confidence === 'baja'
        ? parsed.confidence
        : 'media';
    return {
      intent: parsed.intent as SemanticIntentKind,
      confidence,
      ...(typeof parsed.cotizacion_hint === 'string' && parsed.cotizacion_hint.trim()
        ? { cotizacion_hint: parsed.cotizacion_hint.trim() }
        : {}),
      ...(parsed.edicion_cotizacion && typeof parsed.edicion_cotizacion === 'object'
        ? { edicion_cotizacion: parsed.edicion_cotizacion }
        : {}),
      ...(parsed.destino_obra && typeof parsed.destino_obra === 'object'
        ? { destino_obra: parsed.destino_obra }
        : {}),
      ...(parsed.formato_archivo === 'pdf' || parsed.formato_archivo === 'excel'
        ? { formato_archivo: parsed.formato_archivo }
        : {}),
    };
  } catch {
    return null;
  }
}
