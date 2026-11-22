import { createHash, randomUUID } from 'node:crypto';
import { AIError } from '@/lib/ai/errors';
import { normalizeQuote } from '@/lib/ai/protocol';
import type { CotizacionEstimacion } from '@/types/database';
import { readQuoteSource, readTextQuote, type QuoteSource } from './quote-input';
import type { QuoteFormat } from './quote-files';

export type Actor = { id: string; empresa_id: string; rol: string };
type Channel = 'plataforma' | 'whatsapp';
export type QuoteReview = {
  id: string;
  estado: 'pendiente' | 'aprobada' | 'devuelta';
  revision: number;
  borrador: CotizacionEstimacion;
  presupuesto_id: string | null;
};
export type QuoteReply = { respuesta: string; archivo?: { id: string; formato: QuoteFormat }; solicitud?: string };
const uuid = '[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}';
const starter = /^(?:nueva cotizaci[oó]n|cotizaci[oó]n con precios|(?:prepara|genera|hazme) (?:una |la )?cotizaci[oó]n con (?:estos )?precios)\b[ \t]*:?[ \t]*([^\n]*)/i;
const startHelp = /^(?:quiero hacer una )?cotizaci[oó]n pactada[.!]?$/i;
const starterHelp = 'Envía «Nueva cotización» seguido del nombre. Agrega una partida por línea con el formato Material | Unidad | Cantidad | Precio unitario con IVA, o adjunta un Excel, PDF o foto.';

export function isQuoteWorkflow(text: string) {
  return starter.test(text) || startHelp.test(text) || /^(?:cotizaciones pendientes|(?:revisa|aprueba|corrige|devuelve) cotizaci[oó]n\b|(?:pdf|excel) (?:de (?:la )?)?cotizaci[oó]n\b)/i.test(text.trim());
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

function preview(row: QuoteReview) {
  const quote = row.borrador;
  const totals = quote.estructura_financiera;
  const lines = (quote.partidas_venta ?? []).map(line => `• ${line.nombre} · ${line.cantidad} ${line.unidad} × ${formatCLP(line.precio_unitario)} = ${formatCLP(line.subtotal)}`);
  const detail = [...lines.slice(0, 8), ...(lines.length > 8 ? [`Vista resumida de ${lines.length} partidas. Revisa el detalle completo en la bandeja web antes de aprobar.`] : [])];
  return [`${quote.titulo_proyecto} · revisión ${row.revision}`, ...detail, `Neto ${formatCLP(totals.precio_sugerido_neto)} · IVA ${formatCLP(totals.iva_19)} · Total ${formatCLP(totals.precio_total_con_iva)}`,
    row.estado === 'pendiente' ? `Para confirmar esta versión, escribe «aprueba cotización ${row.id} ${row.revision}».` : `Estado ${row.estado}.`].join('\n');
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
  return (data || []) as QuoteReview[];
}

function draftId(actor: Actor, requestId?: string) {
  if (!requestId) return randomUUID();
  const hash = createHash('sha256').update(JSON.stringify([actor.empresa_id, actor.id, requestId])).digest('hex');
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`;
}

async function makeDraft(title: string, lines: string, id: string, source?: QuoteSource) {
  if (!title.trim() || title.trim().length > 150) throw new AIError('OBRABOT_QUOTE_INPUT', 'Indica un nombre de hasta 150 caracteres para la cotización.', 422);
  const partidas = source ? await readQuoteSource(source) : readTextQuote(lines);
  const draft = normalizeQuote({ titulo_proyecto: title.trim(), modo_presupuesto: 'precio_acordado', tratamiento_iva: 'incluido', partidas_venta: partidas, materiales: [], mano_de_obra: [] });
  return { ...draft, id: `cot-${id}`, consejos_experto_pyme: [] };
}

export async function reviewQuote(db: any, actor: Actor, id: string, revision: number, decision: 'aprobar' | 'corregir' | 'devolver', input?: string) {
  requireAdmin(actor);
  if (!Number.isSafeInteger(revision) || revision < 1 || revision > 2147483647) throw new AIError('OBRABOT_QUOTE_INPUT', 'Indica la revisión mostrada en la solicitud.', 422);
  let draft;
  if (decision === 'corregir') {
    const previous = await getQuoteReview(db, actor, id);
    draft = await makeDraft(previous.borrador.titulo_proyecto, input || '', id);
  }
  if (decision === 'devolver' && (!input?.trim() || input.length > 1000)) throw new AIError('OBRABOT_QUOTE_INPUT', 'Indica el motivo de la devolución.', 422);
  const { data, error } = await db.rpc('obrabot_revisar_cotizacion', { p_empresa: actor.empresa_id, p_actor: actor.id, p_id: id, p_revision: revision, p_decision: decision, p_cambios: draft, p_observacion: decision === 'devolver' ? input : undefined });
  if (error || !data) dbError(error);
  return data as QuoteReview;
}

export async function handleQuoteTurn(db: any, actor: Actor, channel: Channel, text: string, requestId?: string, source?: QuoteSource): Promise<QuoteReply | null> {
  const message = text.trim();
  if (!isQuoteWorkflow(message)) return null;
  if (channel === 'plataforma') requireAdmin(actor);
  const start = message.match(starter);
  if (start || startHelp.test(message)) {
    if (!['admin', 'supervisor'].includes(actor.rol)) throw new AIError('OBRABOT_ADMIN', 'La preparación de cotizaciones corresponde al supervisor o administrador.', 403);
    if (!start) return { respuesta: starterHelp };
    const rows = message.slice(start[0].length).trim();
    if (!rows && !source) return { respuesta: starterHelp };
    const id = draftId(actor, requestId);
    const draft = await makeDraft(start[1], rows, id, source);
    const { error } = await db.rpc('obrabot_registrar_cotizacion', { p_empresa: actor.empresa_id, p_actor: actor.id, p_id: id, p_origen: channel, p_borrador: draft });
    if (error) dbError(error);
    if (actor.rol === 'supervisor') return { respuesta: 'Guardé la solicitud pendiente de revisión por el administrador.' };
    return { respuesta: preview(await getQuoteReview(db, actor, id)), solicitud: id };
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
    if (verb === 'revisa') return { respuesta: preview(await getQuoteReview(db, actor, id)), solicitud: id };
    await getApprovedQuote(db, actor, id);
    return { respuesta: 'Aquí está el archivo de la cotización aprobada.', archivo: { id, formato: verb as QuoteFormat } };
  }
  const decision = new RegExp(`^(aprueba|corrige|devuelve) cotizaci[oó]n (${uuid}) (\\d+)(?:\\s+([\\s\\S]+))?$`, 'i').exec(message);
  if (!decision) return { respuesta: 'Indica el código de la cotización. Para aprobar, corregir o devolver, incluye también el número de revisión.' };
  const verb = decision[1].toLowerCase();
  const id = decision[2].toLowerCase();
  const approved = await reviewQuote(db, actor, id, Number(decision[3]), verb === 'aprueba' ? 'aprobar' : verb === 'corrige' ? 'corregir' : 'devolver', decision[4]);
  if (verb === 'devuelve') return { respuesta: 'La solicitud quedó devuelta con la observación.' };
  if (verb === 'corrige') return { respuesta: preview(approved), solicitud: id };
  return { respuesta: 'Cotización aprobada y guardada en Presupuestos. Puedes compartir el PDF o pedir el Excel editable.', archivo: { id, formato: 'pdf' } };
}
