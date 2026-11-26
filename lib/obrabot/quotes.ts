import { createHash, randomUUID } from 'node:crypto';
import { AIError } from '@/lib/ai/errors';
import { isAIConfigured, type generateAI } from '@/lib/ai/provider';
import { saleLines, type QuoteLine } from '@/lib/quotes/document';
import { normalizeQuote } from '@/lib/ai/protocol';
import type { CotizacionEstimacion } from '@/types/database';
import { isNaturalQuoteRequest, isPastedQuote, readPastedQuote } from './quote-message';
import { parseNaturalQuoteWithAI } from './quote-ai-parser';
import { applyNaturalQuoteEdit, applyStructuredQuoteEdit, looksLikeNaturalQuoteEdit, matchesQuoteTitleHint } from './quote-edit-natural';
import { applyUnifiedQuoteEdit, resolveUnifiedQuote, type UnifiedQuoteRef } from '@/lib/quotes/unified';
import type { SemanticIntentResult } from '@/lib/ai/intent-router';
import { readQuoteSource, readTextQuote, transcribeQuoteImage, type QuoteSource } from './quote-input';
import { excelMime, type QuoteFormat } from './quote-files';
import { importBudgetFile } from '@/lib/quotes/import-file';
import { handleDestinationTurn, rememberQuoteDestination, type QuoteDestination } from './quote-destination';

export type Actor = { id: string; empresa_id: string; rol: string };
export type Channel = 'plataforma' | 'whatsapp';
export type QuoteReview = {
  id: string;
  estado: 'pendiente' | 'aprobada' | 'devuelta';
  revision: number;
  borrador: CotizacionEstimacion;
  presupuesto_id: string | null;
  destino?: QuoteDestination;
  presupuesto_estado?: 'borrador' | 'enviada' | 'aprobada' | 'rechazada' | 'anulada' | 'no_elegida';
  presupuesto_updated_at?: string;
};
export type QuoteReply = {
  pasoPendiente?: { id: string; datos: Record<string, unknown> };
  respuesta: string;
  archivo?: { id: string; formato: QuoteFormat; origen?: 'presupuesto' };
  solicitud?: string;
  revision?: number;
  obra?: string;
  cotizacionAprobadaId?: string;
  presupuestoPdfId?: string;
  cotizacion?: CotizacionEstimacion;
};
const uuid = '[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}';
const starter = /^(?:nueva cotizaci[oó]n|cotizaci[oó]n con precios|(?:prepara|genera|hazme) (?:una |la )?cotizaci[oó]n con (?:estos )?precios)\b[ \t]*:?[ \t]*([^\n]*)/i;
const startHelp = /^(?:(?:quiero|necesito)\s+)?(?:(?:hacer|pasar|convertir)\s+(?:(?:una?|mi|el)\s+)?cotizaci[oó]n pactada|cotizaci[oó]n pactada|(?:(?:pasar|convertir|llevar)\s+)?(?:(?:una?|mi|el)\s+)?(?:presupuesto|cotizaci[oó]n) a (?:pdf|excel)|formatear (?:(?:una?|mi|el)\s+)?presupuesto|ya tengo (?:un |mi )?presupuesto)[.!]?$/i;
const starterHelp = 'Perfecto, pasemos tu presupuesto ya listo al formato oficial de cotización (PDF y Excel) respetando tus montos exactos.\n• Pega tu lista de partidas y materiales con precios en $ (IVA incluido o más IVA)\n• O adjunta una foto, PDF o planilla Excel\n• O escribe «Nueva cotización: Nombre» seguido de líneas Partida | Unidad | Cantidad | Precio\n\nSi en cambio necesitas ayuda para calcular precios desde cero, dime el trabajo y las medidas.';

export function isQuoteWorkflow(text: string, hasImage = false) {
  if (hasImage && isNaturalQuoteRequest(text) && !starter.test(text)) return true;
  return isPastedQuote(text) || starter.test(text) || startHelp.test(text) || /^(?:cotizaciones pendientes|(?:revisa|aprueba|corrige|devuelve) cotizaci[oó]n\b|(?:pdf|excel) (?:de (?:la )?)?cotizaci[oó]n\b)/i.test(text.trim());
}

function requireAdmin(actor: Actor) {
  if (actor.rol !== 'admin') throw new AIError('OBRABOT_ADMIN', 'Esta acción está reservada al administrador.', 403);
}

function dbError(error?: { message?: string } | null): never {
  const message = error?.message ?? '';
  if (message.includes('OBRABOT_FORBIDDEN')) throw new AIError('OBRABOT_ADMIN', 'Revisa tu rol y el plan de la empresa para realizar esta acción.', 403);
  if (message.includes('OBRABOT_NOT_FOUND')) throw new AIError('OBRABOT_QUOTE_MISSING', 'La cotización no está disponible.', 404);
  if (message.includes('OBRABOT_STALE')) throw new AIError('OBRABOT_STALE', 'La solicitud cambió. Revísala de nuevo antes de confirmar.', 409);
  throw new AIError('OBRABOT_QUOTE_DB', 'No pude guardar o consultar la cotización. Intenta nuevamente.', 503);
}

function formatCLP(amount: number) {
  return `$${amount.toLocaleString('es-CL')}`;
}

function isDefinedText(value?: string | null) {
  const clean = value?.trim();
  return Boolean(clean) && !/^por definir$/i.test(clean!);
}

function formatLineForPreview(row: QuoteLine, isWhatsApp: boolean) {
  const plain = (value: string) => value.replace(/[\r\n*]+/g, ' ').trim();
  const bold = (value: string) => (isWhatsApp ? `*${value}*` : value);
  const quantity = row.cantidad.toLocaleString('es-CL', { maximumFractionDigits: 6 });
  if (row.precioUnit === null) {
    const unitQty = row.unidad === 'gl' ? '' : ` (${quantity} ${plain(row.unidad)})`;
    return `• ${plain(row.nombre)}${unitQty} — ${bold(formatCLP(row.total))}`;
  }
  return `• ${plain(row.nombre)} (${quantity} ${plain(row.unidad)} × ${formatCLP(row.precioUnit)}) — ${bold(formatCLP(row.total))}`;
}

function preview(row: QuoteReview, channel: Channel = 'plataforma') {
  const quote = row.borrador;
  const totals = quote.estructura_financiera;
  const isWA = channel === 'whatsapp';
  const bold = (value: string) => (isWA ? `*${value}*` : value);
  const em = (value: string) => (isWA ? `_${value}_` : value);

  const rawLines = saleLines(quote);
  const workLines = rawLines.filter((l) => l.tipo !== 'material').map((l) => formatLineForPreview(l, isWA));
  const matLines = rawLines.filter((l) => l.tipo === 'material').map((l) => formatLineForPreview(l, isWA));
  const mats = quote.materiales_considerados || [];

  let detailBlock: string[];
  if (workLines.length && matLines.length && mats.length > 0 && rawLines.length <= 3) {
    detailBlock = [bold('Resumen económico'), ...rawLines.map((l) => formatLineForPreview(l, isWA))];
  } else if (workLines.length && matLines.length) {
    const wSlice = workLines.slice(0, 5);
    const mSlice = matLines.slice(0, Math.max(1, 8 - wSlice.length));
    detailBlock = [
      bold('Partidas / Trabajos'),
      ...wSlice,
      bold('Materiales'),
      ...mSlice,
      ...(rawLines.length > wSlice.length + mSlice.length
        ? [em(`Vista resumida de ${rawLines.length} ítems. Revisa el detalle completo en la bandeja web antes de aprobar.`)]
        : []),
    ];
  } else {
    const lines = rawLines.map((l) => formatLineForPreview(l, isWA));
    detailBlock = [
      bold('Detalle'),
      ...lines.slice(0, 8),
      ...(lines.length > 8
        ? [em(`Vista resumida de ${lines.length} partidas. Revisa el detalle completo en la bandeja web antes de aprobar.`)]
        : []),
    ];
  }

  if (mats.length) {
    detailBlock.push(
      em(`Materiales considerados (${mats.length}): ${mats.slice(0, 4).map((m) => m.nombre).join(', ')}${mats.length > 4 ? '…' : ''}`),
    );
  } else if (rawLines.length === 1 && quote.resumen_ejecutivo?.trim()) {
    const scopeLines = quote.resumen_ejecutivo
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !/:$/.test(s));
    if (scopeLines.length >= 2) {
      detailBlock.push(em(`Incluye ${scopeLines.length} trabajos detallados en el alcance del PDF.`));
    }
  }

  const metaParts = [
    `Rev. ${row.revision}`,
    quote.tratamiento_iva === 'neto' ? 'Valores netos (+19% IVA)' : 'IVA incluido',
    ...(quote.mostrar_fecha === false ? ['Sin fecha en PDF'] : []),
  ];
  const contactParts = [
    ...(isDefinedText(quote.cliente_nombre) ? [`Cliente: ${quote.cliente_nombre!.trim()}`] : []),
    ...(isDefinedText(quote.comuna_region) ? [`Ubicación: ${quote.comuna_region!.trim()}`] : []),
  ];

  const intro = row.estado === 'pendiente'
    ? '¡Listo! Ya armé el borrador de tu cotización para que lo revises antes de emitir el PDF 👇'
    : row.estado === 'aprobada'
      ? '✅ Cotización confirmada y lista:'
      : `Estado ${row.estado}:`;

  const headerBlock = [
    bold(`📋 ${quote.titulo_proyecto}`),
    em(metaParts.join(' · ')),
    ...(contactParts.length ? [contactParts.join(' · ')] : []),
  ];

  const milestones = (quote.hitos_pago || []).map(
    (h) => `• ${h.nombre} (${h.porcentaje}%): ${bold(formatCLP(h.monto))}`,
  );
  const paymentBlock = milestones.length ? [bold('💳 Forma de pago:'), ...milestones] : [];

  const totalsBlock = [
    bold('💰 Resumen'),
    `Neto: ${formatCLP(totals.precio_sugerido_neto)} · IVA (19%): ${formatCLP(totals.iva_19)}`,
    bold(`Total: ${formatCLP(totals.precio_total_con_iva)}`),
  ];

  const nextStep = row.estado === 'pendiente'
    ? isWA
      ? 'Si está todo OK, toca *«Aprobar y PDF»* o respóndeme *«Aprobar»* y te envío el documento listo para compartir. Si quieres ajustar algún monto o dato, dime qué cambiamos.'
      : `Si está todo OK, apruébala en la bandeja o escribe «aprueba cotización ${row.id} ${row.revision}».`
    : row.estado === 'aprobada'
      ? isWA
        ? 'Responde *«Crear obra»*, *«Vincular a obra»* o *«Excel»* si quieres continuar con esta cotización.'
        : `Para usarla en una obra, escribe «Usa cotización ${row.id}».`
      : `Estado ${row.estado}.`;

  return [
    intro,
    headerBlock.join('\n'),
    detailBlock.join('\n'),
    ...(paymentBlock.length ? [paymentBlock.join('\n')] : []),
    totalsBlock.join('\n'),
    nextStep,
  ].join('\n\n');
}

export async function getQuoteReview(db: any, actor: Actor, id: string) {
  requireAdmin(actor);
  const { data, error } = await db.from('obrabot_cotizaciones').select('id,estado,revision,borrador,presupuesto_id').eq('empresa_id', actor.empresa_id).eq('id', id).maybeSingle();
  if (error) dbError(error);
  if (!data) throw new AIError('OBRABOT_QUOTE_MISSING', 'La cotización no está disponible.', 404);
  return data as QuoteReview;
}

export async function getApprovedQuote(db: any, actor: Actor, id: string) {
  const review = await getQuoteReview(db, actor, id);
  if (review.estado !== 'aprobada' || !review.presupuesto_id) throw new AIError('OBRABOT_NOT_APPROVED', 'Aprueba la cotización antes de generar el archivo.', 409);
  // Preserve the approved revision even if the platform later edits the associated budget.
  return review.borrador;
}

export async function listQuotes(db: any, actor: Actor, state: 'pendiente' | 'aprobada' = 'pendiente') {
  requireAdmin(actor);
  const { data, error } = await db.from('obrabot_cotizaciones').select('id,estado,revision,borrador,presupuesto_id').eq('empresa_id', actor.empresa_id).eq('estado', state).order('actualizado_at', { ascending: false }).limit(30);
  if (error) dbError(error);
  const rows = (data || []) as QuoteReview[];
  if (state !== 'aprobada' || !rows.length) return rows;
  const destinations = await db.from('obrabot_destinos_cotizacion').select('cotizacion_id,resultado')
    .eq('empresa_id', actor.empresa_id).in('cotizacion_id', rows.map(row => row.id));
  if (destinations.error) dbError(destinations.error);
  const byId = new Map<string, QuoteDestination>((destinations.data || []).map((row: { cotizacion_id: string; resultado: QuoteDestination }) => [row.cotizacion_id, row.resultado]));

  const budgetIds = rows.map(row => row.presupuesto_id).filter((v): v is string => typeof v === 'string' && v.length > 0);
  const budgetById = new Map<string, { estado?: QuoteReview['presupuesto_estado']; updated_at?: string }>();
  if (budgetIds.length && typeof db?.from === 'function') {
    try {
      const budgetsRes = await db.from('presupuestos').select('id,estado,updated_at').eq('empresa_id', actor.empresa_id).in('id', budgetIds);
      if (!budgetsRes?.error && Array.isArray(budgetsRes?.data)) {
        for (const b of budgetsRes.data) {
          if (b?.id) budgetById.set(b.id, { estado: b.estado, updated_at: b.updated_at });
        }
      }
    } catch {
      // Tablas parciales en mocks de prueba no bloquean el listado.
    }
  }

  return rows.map(row => {
    const budget = row.presupuesto_id ? budgetById.get(row.presupuesto_id) : undefined;
    return {
      ...row,
      destino: byId.get(row.id),
      ...(budget?.estado ? { presupuesto_estado: budget.estado } : {}),
      ...(budget?.updated_at ? { presupuesto_updated_at: budget.updated_at } : {}),
    };
  });
}

function draftId(actor: Actor, requestId?: string) {
  if (!requestId) return randomUUID();
  const hash = createHash('sha256').update(JSON.stringify([actor.empresa_id, actor.id, requestId])).digest('hex');
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`;
}

type DraftInput = Omit<Partial<CotizacionEstimacion>, 'hitos_pago'> & {
  titulo_proyecto: string;
  partidas_venta: NonNullable<CotizacionEstimacion['partidas_venta']>;
  hitos_pago?: Pick<NonNullable<CotizacionEstimacion['hitos_pago']>[number], 'nombre' | 'porcentaje'>[];
  aviso_validacion?: string;
};

export async function parseQuoteMessage(
  text: string,
  providedTitle?: string,
  defaultIva?: 'incluido' | 'neto',
  generate?: typeof generateAI,
) {
  try {
    return readPastedQuote(text, providedTitle, defaultIva);
  } catch (err) {
    if (!(err instanceof AIError) || err.code !== 'OBRABOT_QUOTE_INPUT') throw err;
    if (/IVA incluido o netos/i.test(err.message)) throw err;
    if (!generate && !isAIConfigured()) throw err;
    try {
      return await parseNaturalQuoteWithAI(text, { providedTitle, defaultIva }, generate);
    } catch (aiErr) {
      if (aiErr instanceof AIError && aiErr.code === 'OBRABOT_QUOTE_INPUT') throw aiErr;
      throw err;
    }
  }
}

function makeDraft(input: DraftInput, id: string) {
  const quoteInput: DraftInput = { ...input };
  delete quoteInput.aviso_validacion;
  const title = quoteInput.titulo_proyecto.trim();
  if (!title || title.length > 150) throw new AIError('OBRABOT_QUOTE_INPUT', 'Indica un nombre de hasta 150 caracteres para la cotización.', 422);
  const tratamiento_iva = quoteInput.tratamiento_iva === 'neto' ? 'neto' : 'incluido';
  const draft = normalizeQuote({
    ...quoteInput,
    titulo_proyecto: title,
    modo_presupuesto: 'precio_acordado',
    tratamiento_iva,
    materiales: quoteInput.materiales ?? [],
    mano_de_obra: quoteInput.mano_de_obra ?? [],
    ...(quoteInput.materiales_considerados?.length ? { materiales_considerados: quoteInput.materiales_considerados } : {}),
    actividades_gantt: quoteInput.actividades_gantt ?? [],
  });
  return { ...draft, id: `cot-${id}`, consejos_experto_pyme: [] };
}
export function makeQuoteDraft(input: DraftInput, id: string) {
  return makeDraft(input, id);
}
export function formatQuotePreview(row: QuoteReview, channel: Channel = 'plataforma') {
  return preview(row, channel);
}

export async function reviewQuote(db: any, actor: Actor, id: string, revision: number, decision: 'aprobar' | 'corregir' | 'devolver', input?: string) {
  requireAdmin(actor);
  if (!Number.isSafeInteger(revision) || revision < 1 || revision > 2147483647) throw new AIError('OBRABOT_QUOTE_INPUT', 'Indica la revisión mostrada en la solicitud.', 422);
  let draft;
  if (decision === 'corregir') {
    const previous = await getQuoteReview(db, actor, id);
    const rawEdit = (input || '').trim();
    const prevIva = previous.borrador.tratamiento_iva === 'neto' ? 'neto' : 'incluido';
    if (rawEdit.includes('$') && !rawEdit.split('\n')[0].includes('|')) {
      const parsed = await parseQuoteMessage(rawEdit, previous.borrador.titulo_proyecto, prevIva);
      draft = makeDraft({ ...previous.borrador, ...parsed, titulo_proyecto: previous.borrador.titulo_proyecto }, id);
    } else {
      draft = makeDraft({ ...previous.borrador, partidas_venta: readTextQuote(rawEdit), tratamiento_iva: prevIva }, id);
    }
  }
  if (decision === 'devolver' && (!input?.trim() || input.length > 1000)) throw new AIError('OBRABOT_QUOTE_INPUT', 'Indica el motivo de la devolución.', 422);
  const { data, error } = await db.rpc('obrabot_revisar_cotizacion', { p_empresa: actor.empresa_id, p_actor: actor.id, p_id: id, p_revision: revision, p_decision: decision, p_cambios: draft, p_observacion: decision === 'devolver' ? input : undefined });
  if (error || !data) dbError(error);
  return data as QuoteReview;
}

async function loadCompanyQuoteReviews(
  db: any,
  actor: Actor,
  states: Array<'pendiente' | 'aprobada'>,
): Promise<QuoteReview[]> {
  try {
    let query = db
      ?.from?.('obrabot_cotizaciones')
      ?.select?.('id,estado,revision,borrador,presupuesto_id')
      ?.eq?.('empresa_id', actor.empresa_id);
    if (!query || typeof query.order !== 'function') return [];
    if (states.length === 1 && typeof query.eq === 'function') {
      query = query.eq('estado', states[0]);
    } else if (typeof query.in === 'function') {
      query = query.in('estado', states);
    }
    const ordered = query.order('actualizado_at', { ascending: false });
    const limited = typeof ordered?.limit === 'function' ? ordered.limit(20) : ordered;
    const res = await limited;
    if (res?.error || !Array.isArray(res?.data)) return [];
    return res.data as QuoteReview[];
  } catch {
    return [];
  }
}

async function findReusableTechnicalScope(db: any, actor: Actor, title: string): Promise<string | undefined> {
  if (!title.trim()) return undefined;
  const approved = await loadCompanyQuoteReviews(db, actor, ['aprobada']);
  if (!approved.length) return undefined;
  const foldedTitle = title.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  let bestScope: string | undefined;
  let bestScore = 0;
  for (const row of approved) {
    const scope = row?.borrador?.resumen_ejecutivo?.trim();
    if (!scope || scope.length < 15) continue;
    const rowTitle = row?.borrador?.titulo_proyecto || '';
    const foldedRow = rowTitle.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
    const exactBoost = foldedRow && (foldedRow.includes(foldedTitle) || foldedTitle.includes(foldedRow)) ? 10 : 0;
    const score = exactBoost + matchesQuoteTitleHint(rowTitle, title);
    if (score > bestScore) {
      bestScore = score;
      bestScope = scope;
    }
  }
  return bestScore >= 1 ? bestScope : undefined;
}

export async function tryNaturalQuoteEdit(
  db: any,
  actor: Actor,
  channel: Channel,
  text: string,
  candidateIds: string[],
  immediateQuoteContext: boolean,
  requestId?: string,
  semanticIntent?: SemanticIntentResult | null,
  candidateRefs?: UnifiedQuoteRef[],
): Promise<QuoteReply | null> {
  const hasSemanticEdit = Boolean(
    semanticIntent?.intent === 'editar_cotizacion' &&
    semanticIntent.confidence !== 'baja' &&
    semanticIntent.edicion_cotizacion,
  );
  if (actor.rol !== 'admin' || (!looksLikeNaturalQuoteEdit(text) && !hasSemanticEdit)) return null;
  if (/\b(?:carta\s+gantt|asistencia|bit[aá]cora|trabajador|cuadrilla|incidente|de\s+la\s+obra|del\s+proyecto)\b/i.test(text)) return null;

  const uniqueIds = Array.from(new Set(candidateIds.filter(Boolean))).slice(0, 5);
  const refs: UnifiedQuoteRef[] = candidateRefs?.length
    ? candidateRefs
    : uniqueIds.map((id) => ({ kind: 'review' as const, id }));

  const hintSource = semanticIntent?.cotizacion_hint ? `${text} ${semanticIntent.cotizacion_hint}` : text;
  const allowCompanyFallback = hasSemanticEdit || /\b(?:cotizaci[oó]n|presupuesto)\b/i.test(text);
  const target = await resolveUnifiedQuote(db, actor, refs, {
    titleHint: hintSource,
    allowCompanyFallback,
  });

  if (!target) return null;
  const matchedByTitle = matchesQuoteTitleHint(target.cotizacion?.titulo_proyecto || '', hintSource) > 0;
  if (!matchedByTitle && !immediateQuoteContext && !hasSemanticEdit && !/\b(?:cotizaci[oó]n|presupuesto)\b/i.test(text)) {
    return null;
  }

  const patch =
    applyNaturalQuoteEdit(target.cotizacion, text) ||
    (hasSemanticEdit && semanticIntent?.edicion_cotizacion
      ? applyStructuredQuoteEdit(target.cotizacion, semanticIntent.edicion_cotizacion)
      : null);
  if (!patch) return null;

  return applyUnifiedQuoteEdit(
    db,
    actor,
    channel,
    target,
    patch,
    {
      makeDraft: makeDraft as (input: typeof patch, id: string) => CotizacionEstimacion,
      formatPreview: preview,
      draftId,
      dbError,
      getQuoteReview,
    },
    requestId,
  );
}

export async function handleQuoteTurn(
  db: any,
  actor: Actor,
  channel: Channel,
  text: string,
  requestId?: string,
  source?: QuoteSource,
  context?: {
    quotedId?: string | null;
    permiteVincular?: boolean;
    tratamientoIva?: 'incluido' | 'neto';
    clienteNombre?: string;
    comunaRegion?: string;
    mostrarFecha?: boolean;
    fechaValidez?: string;
    autoAprobar?: boolean;
  },
): Promise<QuoteReply | null> {
  const message = text.trim();
  const hasImage = source?.mime.startsWith('image/') ?? false;
  if (!isQuoteWorkflow(message, hasImage)) return handleDestinationTurn(db, actor, channel, message, context?.quotedId);
  if (channel === 'plataforma') requireAdmin(actor);
  const start = message.match(starter);
  const pasted = isPastedQuote(message);
  const photoQuote = hasImage && isNaturalQuoteRequest(message) && !start;
  if (start || pasted || photoQuote || startHelp.test(message)) {
    if (!['admin', 'supervisor'].includes(actor.rol)) throw new AIError('OBRABOT_ADMIN', 'La preparación de cotizaciones corresponde al supervisor o administrador.', 403);
    const rows = start ? message.slice(start[0].length).trim() : message;
    if ((!start && !pasted && !photoQuote) || (!rows && !source)) return { respuesta: starterHelp };
    const id = draftId(actor, requestId);
    const defaultIva = context?.tratamientoIva;
    const explicitTitle = start?.[1]?.trim() || undefined;
    let input: DraftInput;
    if (pasted || (start && rows.includes('$') && !rows.split('\n')[0].includes('|'))) input = await parseQuoteMessage(rows, explicitTitle, defaultIva);
    else if (source && photoQuote) input = await parseQuoteMessage(await transcribeQuoteImage(source), undefined, defaultIva);
    else if (source) {
      try {
        input = { titulo_proyecto: explicitTitle || 'Cotización de obra', partidas_venta: await readQuoteSource(source), tratamiento_iva: defaultIva };
      } catch (err) {
        if (!(err instanceof AIError) || err.code !== 'OBRABOT_QUOTE_INPUT') throw err;
        const ext = source.mime === excelMime ? 'xlsx' : source.mime === 'application/pdf' ? 'pdf' : source.mime === 'text/csv' ? 'csv' : 'png';
        const imported = await importBudgetFile({
          bytes: source.bytes,
          filename: `${explicitTitle || 'presupuesto'}.${ext}`,
          mime: source.mime,
          ivaPreference: defaultIva ?? 'auto',
          fallbackTitle: explicitTitle || 'Cotización de obra',
        });
        const q = imported.cotizacion;
        input = {
          ...q,
          partidas_venta: q.partidas_venta || [],
          hitos_pago: q.hitos_pago?.map(({ nombre, porcentaje }) => ({ nombre, porcentaje })),
        };
      }
    } else {
      const pipeRows = readTextQuote(rows);
      input = {
        titulo_proyecto: explicitTitle || pipeRows.slice(0, 3).map((r) => r.nombre).join(', ') || 'Cotización de obra',
        partidas_venta: pipeRows,
        tratamiento_iva: defaultIva,
      };
    }
    if (context?.clienteNombre?.trim()) input = { ...input, cliente_nombre: context.clienteNombre.trim().slice(0, 300) };
    if (context?.comunaRegion?.trim()) input = { ...input, comuna_region: context.comunaRegion.trim().slice(0, 300) };
    if (context?.mostrarFecha === false) input = { ...input, mostrar_fecha: false };
    if (context?.fechaValidez && /^\d{4}-\d{2}-\d{2}$/.test(context.fechaValidez)) input = { ...input, fecha_validez: context.fechaValidez };
    if (!input.resumen_ejecutivo?.trim()) {
      const reusable = await findReusableTechnicalScope(db, actor, input.titulo_proyecto);
      if (reusable) input = { ...input, resumen_ejecutivo: reusable };
    }
    if ((input.resumen_ejecutivo?.length || 0) > 6000 || (input.condiciones_pago?.length || 0) > 6000) {
      throw new AIError('OBRABOT_QUOTE_INPUT', 'El detalle o las condiciones superan los 6.000 caracteres. Acorta el texto para conservarlo completo en el PDF.', 422);
    }
    const draft = makeDraft(input, id);
    const { error } = await db.rpc('obrabot_registrar_cotizacion', { p_empresa: actor.empresa_id, p_actor: actor.id, p_id: id, p_origen: channel, p_borrador: draft });
    if (error) dbError(error);
    if (actor.rol === 'supervisor') return { respuesta: 'Guardé la solicitud pendiente de revisión por el administrador.' };
    const created = await getQuoteReview(db, actor, id);
    const notice = input.aviso_validacion?.trim();
    if (context?.autoAprobar && actor.rol === 'admin') {
      const approved = created.estado === 'pendiente'
        ? await reviewQuote(db, actor, id, created.revision, 'aprobar')
        : created;
      if (approved.estado === 'aprobada') {
        const canLink = context?.permiteVincular !== false;
        if (canLink) await rememberQuoteDestination(db, actor, channel, id);
        const bodyText = preview(approved, channel);
        return {
          respuesta: notice ? `${notice}\n\n${bodyText}` : bodyText,
          solicitud: id,
          revision: approved.revision,
          cotizacionAprobadaId: approved.presupuesto_id || undefined,
          archivo: { id, formato: 'pdf' },
        };
      }
    }
    const bodyText = preview(created, channel);
    return {
      respuesta: notice ? `${notice}\n\n${bodyText}` : bodyText,
      solicitud: id,
      revision: created.estado === 'pendiente' ? created.revision : undefined,
    };
  }
  requireAdmin(actor);
  if (/^cotizaciones pendientes$/i.test(message)) {
    const pending = await listQuotes(db, actor);
    return { respuesta: pending.length ? pending.map(row => `• ${row.borrador.titulo_proyecto} · ${row.id}`).join('\n') + '\nPara ver el detalle, escribe «revisa cotización» seguido de su código.' : 'No hay cotizaciones pendientes.' };
  }
  const read = new RegExp(`^(revisa|pdf|excel) (?:de (?:la )?)?cotizaci[oó]n (${uuid})$`, 'i').exec(message);
  if (read) {
    const verb = read[1].toLowerCase();
    const id = read[2].toLowerCase();
    if (verb === 'revisa') {
      const reviewed = await getQuoteReview(db, actor, id);
      return { respuesta: preview(reviewed, channel), solicitud: id, revision: reviewed.estado === 'pendiente' ? reviewed.revision : undefined };
    }
    await getApprovedQuote(db, actor, id);
    return { respuesta: 'Aquí está el archivo de la cotización aprobada.', archivo: { id, formato: verb as QuoteFormat } };
  }
  const decision = new RegExp(`^(aprueba|corrige|devuelve) cotizaci[oó]n (${uuid}) (\\d+)(?:\\s+([\\s\\S]+))?$`, 'i').exec(message);
  if (!decision) return { respuesta: 'Indica el código de la cotización. Para aprobar, corregir o devolver, incluye también el número de revisión.' };
  const verb = decision[1].toLowerCase();
  const id = decision[2].toLowerCase();
  const alreadyApproved = verb === 'aprueba' && (await getQuoteReview(db, actor, id)).estado === 'aprobada';
  const approved = await reviewQuote(db, actor, id, Number(decision[3]), verb === 'aprueba' ? 'aprobar' : verb === 'corrige' ? 'corregir' : 'devolver', decision[4]);
  if (verb === 'devuelve') return { respuesta: 'La solicitud quedó devuelta con la observación.' };
  if (verb === 'corrige') return { respuesta: preview(approved, channel), solicitud: id, revision: approved.estado === 'pendiente' ? approved.revision : undefined };
  if (alreadyApproved) return { respuesta: `Esta cotización ya está aprobada. Escribe «PDF cotización ${id}» si quieres descargarla de nuevo.` };
  const canLink = context?.permiteVincular !== false;
  if (canLink) await rememberQuoteDestination(db, actor, channel, id);
  return {
    respuesta: 'Cotización aprobada. Puedes compartir el PDF o pedir el Excel.' + (canLink
      ? '\n\n¿Quieres crear una obra con esta cotización o vincularla a una obra existente? Responde «Crear obra» o «Vincular a obra».'
      : ''),
    cotizacionAprobadaId: channel === 'whatsapp' && canLink ? id : undefined,
    archivo: { id, formato: 'pdf' },
  };
}
