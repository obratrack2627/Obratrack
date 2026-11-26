import { createHash, randomUUID } from 'node:crypto';
import { AIError } from '@/lib/ai/errors';
import { quoteLinePreview, saleLines } from '@/lib/quotes/document';
import { normalizeQuote } from '@/lib/ai/protocol';
import type { CotizacionEstimacion } from '@/types/database';
import { isNaturalQuoteRequest, isPastedQuote, readPastedQuote } from './quote-message';
import { applyNaturalQuoteEdit, looksLikeNaturalQuoteEdit, matchesQuoteTitleHint } from './quote-edit-natural';
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
};
export type QuoteReply = { pasoPendiente?: { id: string; datos: Record<string, unknown> }; respuesta: string; archivo?: { id: string; formato: QuoteFormat; origen?: 'presupuesto' }; solicitud?: string; revision?: number; obra?: string; cotizacionAprobadaId?: string };
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

function preview(row: QuoteReview, channel: Channel = 'plataforma') {
  const quote = row.borrador;
  const totals = quote.estructura_financiera;
  const rawLines = saleLines(quote);
  const workLines = rawLines.filter((l) => l.tipo !== 'material').map(quoteLinePreview);
  const matLines = rawLines.filter((l) => l.tipo === 'material').map(quoteLinePreview);
  let detail: string[];
  if (workLines.length && matLines.length) {
    const wSlice = workLines.slice(0, 5);
    const mSlice = matLines.slice(0, Math.max(1, 8 - wSlice.length));
    detail = [
      'Partidas / Trabajos:',
      ...wSlice,
      'Materiales:',
      ...mSlice,
      ...(rawLines.length > wSlice.length + mSlice.length
        ? [`Vista resumida de ${rawLines.length} ítems. Revisa el detalle completo en la bandeja web antes de aprobar.`]
        : []),
    ];
  } else {
    const lines = rawLines.map(quoteLinePreview);
    detail = [...lines.slice(0, 8), ...(lines.length > 8 ? [`Vista resumida de ${lines.length} partidas. Revisa el detalle completo en la bandeja web antes de aprobar.`] : [])];
  }
  const ivaLabel = quote.tratamiento_iva === 'neto'
    ? 'Cotización pactada · Valores netos (+19% IVA)'
    : 'Cotización pactada · IVA incluido';
  const nextStep = row.estado === 'pendiente'
    ? channel === 'whatsapp'
      ? 'Toca «Aprobar y PDF» o responde «Aprobar» para confirmar esta versión y recibir el PDF.'
      : `Para confirmar esta versión, apruébala en la bandeja o escribe «aprueba cotización ${row.id} ${row.revision}».`
    : row.estado === 'aprobada'
      ? channel === 'whatsapp'
        ? 'Responde «Crear obra», «Vincular a obra» o «Excel» para continuar.'
        : `Para usarla en una obra, escribe «Usa cotización ${row.id}».`
      : `Estado ${row.estado}.`;
  const milestones = (quote.hitos_pago || []).map(h => `${h.nombre} (${h.porcentaje}%) · ${formatCLP(h.monto)}`);
  return [
    `${quote.titulo_proyecto} · revisión ${row.revision}`,
    ivaLabel,
    ...detail,
    ...(milestones.length ? ['Forma de pago:', ...milestones] : []),
    `Neto ${formatCLP(totals.precio_sugerido_neto)} · IVA ${formatCLP(totals.iva_19)} · Total ${formatCLP(totals.precio_total_con_iva)}`,
    nextStep,
  ].join('\n');
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
  return rows.map(row => ({ ...row, destino: byId.get(row.id) }));
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
};

function makeDraft(input: DraftInput, id: string) {
  const title = input.titulo_proyecto.trim();
  if (!title || title.length > 150) throw new AIError('OBRABOT_QUOTE_INPUT', 'Indica un nombre de hasta 150 caracteres para la cotización.', 422);
  const tratamiento_iva = input.tratamiento_iva === 'neto' ? 'neto' : 'incluido';
  const draft = normalizeQuote({
    ...input,
    titulo_proyecto: title,
    modo_presupuesto: 'precio_acordado',
    tratamiento_iva,
    materiales: input.materiales ?? [],
    mano_de_obra: input.mano_de_obra ?? [],
    ...(input.materiales_considerados?.length ? { materiales_considerados: input.materiales_considerados } : {}),
    actividades_gantt: input.actividades_gantt ?? [],
  });
  return { ...draft, id: `cot-${id}`, consejos_experto_pyme: [] };
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
      const parsed = readPastedQuote(rawEdit, previous.borrador.titulo_proyecto, prevIva);
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
): Promise<QuoteReply | null> {
  if (actor.rol !== 'admin' || !looksLikeNaturalQuoteEdit(text)) return null;
  if (/\b(?:carta\s+gantt|asistencia|bit[aá]cora|trabajador|cuadrilla|incidente|de\s+la\s+obra|del\s+proyecto)\b/i.test(text)) return null;
  const uniqueIds = Array.from(new Set(candidateIds.filter(Boolean))).slice(0, 5);
  const reviews: QuoteReview[] = [];
  for (const id of uniqueIds) {
    try {
      reviews.push(await getQuoteReview(db, actor, id));
    } catch {
      // Ignorar cotizaciones eliminadas o no accesibles.
    }
  }
  let target: QuoteReview | null = null;
  let bestScore = 0;
  for (const rev of reviews) {
    const score = matchesQuoteTitleHint(rev.borrador.titulo_proyecto, text);
    if (score > bestScore) {
      bestScore = score;
      target = rev;
    }
  }
  if (!target && /\b(?:cotizaci[oó]n|presupuesto)\b/i.test(text)) {
    const seen = new Set(reviews.map((r) => r.id));
    const stored = (await loadCompanyQuoteReviews(db, actor, ['pendiente', 'aprobada']))
      .filter((r) => r && !seen.has(r.id) && r.borrador?.titulo_proyecto);
    for (const rev of stored) {
      const score = matchesQuoteTitleHint(rev.borrador.titulo_proyecto, text);
      if (score >= 1 && score > bestScore) {
        bestScore = score;
        target = rev;
      }
    }
  }
  if (!target) {
    if (!reviews.length || (!immediateQuoteContext && !/\b(?:cotizaci[oó]n|presupuesto)\b/i.test(text))) return null;
    target = reviews[0];
  }
  const patch = applyNaturalQuoteEdit(target.borrador, text);
  if (!patch) return null;
  if (target.estado === 'pendiente') {
    const draft = makeDraft(patch, target.id);
    const { data, error } = await db.rpc('obrabot_revisar_cotizacion', {
      p_empresa: actor.empresa_id,
      p_actor: actor.id,
      p_id: target.id,
      p_revision: target.revision,
      p_decision: 'corregir',
      p_cambios: draft,
      p_observacion: undefined,
    });
    if (error || !data) dbError(error);
    const updated = data as QuoteReview;
    return { respuesta: preview(updated, channel), solicitud: updated.id, revision: updated.revision };
  }
  // Si ya estaba aprobada, crear una nueva solicitud derivada sin alterar el histórico aprobado.
  const newId = draftId(actor, requestId ? `${requestId}:edit` : undefined);
  const draft = makeDraft(patch, newId);
  const { error } = await db.rpc('obrabot_registrar_cotizacion', {
    p_empresa: actor.empresa_id,
    p_actor: actor.id,
    p_id: newId,
    p_origen: channel,
    p_borrador: draft,
  });
  if (error) dbError(error);
  const created = await getQuoteReview(db, actor, newId);
  return { respuesta: preview(created, channel), solicitud: newId, revision: created.revision };
}

export async function handleQuoteTurn(db: any, actor: Actor, channel: Channel, text: string, requestId?: string, source?: QuoteSource, context?: { quotedId?: string | null; permiteVincular?: boolean; tratamientoIva?: 'incluido' | 'neto' }): Promise<QuoteReply | null> {
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
    let input: DraftInput;
    if (pasted || (start && rows.includes('$') && !rows.split('\n')[0].includes('|'))) input = readPastedQuote(rows, start?.[1], defaultIva);
    else if (source && photoQuote) input = readPastedQuote(await transcribeQuoteImage(source), undefined, defaultIva);
    else if (source) {
      try {
        input = { titulo_proyecto: start?.[1] || 'Cotización de obra', partidas_venta: await readQuoteSource(source), tratamiento_iva: defaultIva };
      } catch (err) {
        if (!(err instanceof AIError) || err.code !== 'OBRABOT_QUOTE_INPUT') throw err;
        const ext = source.mime === excelMime ? 'xlsx' : source.mime === 'application/pdf' ? 'pdf' : source.mime === 'text/csv' ? 'csv' : 'png';
        const imported = await importBudgetFile({
          bytes: source.bytes,
          filename: `${start?.[1]?.trim() || 'presupuesto'}.${ext}`,
          mime: source.mime,
          ivaPreference: defaultIva ?? 'auto',
          fallbackTitle: start?.[1] || 'Cotización de obra',
        });
        const q = imported.cotizacion;
        input = {
          ...q,
          partidas_venta: q.partidas_venta || [],
          hitos_pago: q.hitos_pago?.map(({ nombre, porcentaje }) => ({ nombre, porcentaje })),
        };
      }
    }
    else input = { titulo_proyecto: start?.[1] || '', partidas_venta: readTextQuote(rows), tratamiento_iva: defaultIva };
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
    return { respuesta: preview(created, channel), solicitud: id, revision: created.estado === 'pendiente' ? created.revision : undefined };
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
