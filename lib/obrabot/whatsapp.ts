import { quoteSessionMs } from '@/lib/whatsapp/quote-context';
import { progressAfter, pausedReply } from '@/lib/whatsapp/conversation-progress';
import { AIError } from '@/lib/ai/errors';
import { canonicalPhone } from '@/lib/phone';
import { findBudget } from '@/lib/presupuestos';
import { getApprovedQuote, getQuoteReview, handleQuoteTurn, isQuoteWorkflow, tryNaturalQuoteEdit, type Actor, type QuoteReply } from './quotes';
import { looksLikeNaturalQuoteEdit } from './quote-edit-natural';
import { excelMime, quoteFile } from './quote-files';
import type { QuoteSource } from './quote-input';
import type { downloadMetaMedia } from '@/lib/whatsapp/meta';
import { isDestinationCommand, isDestinationContinuation, validQuoteId } from './quote-destination';
import { parseWhatsAppInteractiveReply, quoteButtonSource } from '@/lib/whatsapp/interactive';

const pdfRequestWords = new Set(
  'pdf por favor el la un una de del en como formato archivo documento copia cotizacion presupuesto esta este esa ese lo eso me mi quiero quisiera necesito que podrias puedes puede das envias mandas enviar mandarme mandar enviarme mandame enviame enviamelo mandamelo damelo dame dalo pasame pasamelo pasa pasalo pasar pasarme entregar entregarme entregame entregamelo entrega adjuntar adjuntarme adjunta adjuntame adjuntalo adjuntamelo descarga descargar descargalo generar generarme genera generame generalo generamelo hazlo hazmelo haz hacer preparar preparame preparalo compartir comparteme compartelo porfa exporta exportar exportalo'.split(' '),
);
const excelRequestWords = new Set([...pdfRequestWords, 'excel', 'xlsx', 'planilla', 'hoja', 'calculo']);

function isQuotePdfRequest(text: string) {
  const words = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[¿?¡!.,]/g, ' ').trim().split(/\s+/);
  if (!words.includes('pdf') || !words.every(word => pdfRequestWords.has(word))) return false;
  return !words.some((word, index) => ['un', 'una'].includes(word) && ['cotizacion', 'presupuesto'].includes(words[index + 1]));
}

function isQuoteExcelRequest(text: string) {
  const words = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[¿?¡!.,]/g, ' ').trim().split(/\s+/);
  if (!words.some(word => word === 'excel' || word === 'xlsx') || !words.every(word => excelRequestWords.has(word))) return false;
  return !words.some((word, index) => ['un', 'una'].includes(word) && ['cotizacion', 'presupuesto'].includes(words[index + 1]));
}

function isShortQuoteApproval(text: string) {
  const clean = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[¿?¡!.,]/g, ' ').replace(/\s+/g, ' ').trim();
  return /^(?:si\s+)?(?:aprueba|aprobar|aprobada|confirmo)(?:\s+(?:la|esta|esa)\s+(?:cotizacion|version|revision))?$/.test(clean);
}

function findPendingQuoteReview(rows: any[], replyContextId?: string, text = ''): { id: string; revision: number } | null {
  const isFresh = (row: any) => !row?.created_at || !(Date.now() - Date.parse(row.created_at) > quoteSessionMs);
  const extract = (row: any) => {
    const id = row?.acciones?.solicitud_cotizacion;
    const revision = row?.acciones?.revision_cotizacion;
    if (typeof id === 'string' && validQuoteId(id) && typeof revision === 'number' && !row?.acciones?.cotizacion_aprobada_id && !row?.borrador_obra) {
      return { id, revision };
    }
    return null;
  };
  if (replyContextId) {
    const replied = rows.find(row => row.message_id === replyContextId);
    return replied ? extract(replied) : null;
  }
  const last = rows[0];
  if (last && isFresh(last)) {
    const immediate = extract(last);
    if (immediate) return immediate;
  }
  if (/\bcotizaci[oó]n\b/i.test(text)) {
    const approvedIds = new Set(rows.map(row => row?.acciones?.cotizacion_aprobada_id).filter(Boolean));
    for (const row of rows) {
      if (!isFresh(row)) break;
      const candidate = extract(row);
      if (candidate && !approvedIds.has(candidate.id)) return candidate;
    }
  }
  return null;
}

type WhatsAppQuoteReply = QuoteReply & { presupuestoPdfId?: string };

function sanitizeQuoteAuditText(raw: string): string {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.includes('|') || line.includes('\t')) {
        const cols = line.replace(/^\||\|$/g, '').split(/\||\t/).map((c) => c.trim());
        if (cols.length >= 4) return `${cols[0]} (${cols[2]} ${cols[1]})`;
      }
      return line
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[correo]')
        .replace(/\$\s*\d[\d.,]*/g, '[monto]')
        .replace(/(?:\+?56\s*)?9[\d .-]{7,13}/g, '[teléfono]');
    });
  const summary = lines.join(' · ').replace(/\s+/g, ' ').trim();
  return summary ? summary.slice(0, 400) : 'Solicitud de cotización a ObraBot';
}

export function quoteReference(row: any) {
  const actions = row?.acciones;
  const archive = actions?.archivo_cotizacion;
  const review = (archive?.origen !== 'presupuesto' ? archive?.id : null) || actions?.solicitud_cotizacion;
  if (typeof review === 'string' && validQuoteId(review)) return { review };
  const budget = (archive?.origen === 'presupuesto' ? archive?.id : null) || actions?.presupuesto_pdf_id || actions?.presupuesto_seleccion_id || actions?.presupuesto_cotizacion_id || row?.cotizacion?.id;
  return typeof budget === 'string' && budget ? { budget } : null;
}

async function requestedQuoteFile(db: any, actor: Actor, rows: any[], format: 'pdf' | 'excel', sourceId?: string): Promise<WhatsAppQuoteReply> {
  const label = format === 'excel' ? 'Excel' : 'PDF';
  if (actor.rol !== 'admin') return { respuesta: `El ${label} de la cotización está disponible para el administrador.` };
  let receipt = sourceId && rows.find(row => row.message_id === sourceId);
  if (sourceId && !receipt) {
    const { data, error } = await db.from('whatsapp_mensajes').select('acciones,cotizacion')
      .eq('empresa_id', actor.empresa_id).eq('actor_id', actor.id).eq('message_id', sourceId).maybeSingle();
    if (error) throw new AIError('OBRABOT_QUOTE_DB', 'No pude consultar la cotización del mensaje.', 503);
    receipt = data;
  }
  const ref = sourceId ? quoteReference(receipt) : rows.map(quoteReference).find(Boolean);
  if (!ref) {
    return { respuesta: sourceId
      ? `No pude identificar esa cotización. Para recibir la última de este chat, escribe «Envíame la cotización en ${label}» en un mensaje nuevo.`
      : 'No encontré una cotización en esta conversación. Pídeme una nueva o indícame el código de la que quieres descargar.' };
  }
  if (ref.review) {
    const quote = await getQuoteReview(db, actor, ref.review);
    if (!quote.presupuesto_id || quote.estado !== 'aprobada') {
      return { respuesta: `Esta cotización necesita aprobación antes de enviarse en ${label}.`, solicitud: ref.review, revision: quote.revision };
    }
    return { respuesta: `Aquí tienes el ${label} de la cotización aprobada.`, archivo: { id: ref.review, formato: format } };
  }
  if (!ref.budget) return { respuesta: 'No encontré la cotización en Presupuestos.' };
  const budget = await findBudget(db, actor.empresa_id, ref.budget);
  if (!budget?.cotizacion || ['rechazada', 'anulada', 'no_elegida'].includes(budget.estado)) {
    return { respuesta: 'La cotización ya no está disponible para descargar. Revísala en ObraTrack → Presupuestos.' };
  }
  if (format === 'excel') {
    return { respuesta: 'Aquí tienes el Excel de la cotización.', archivo: { id: budget.id, formato: 'excel', origen: 'presupuesto' } };
  }
  return { respuesta: 'Aquí tienes el PDF de la cotización.', presupuestoPdfId: budget.id };
}

export async function quoteWhatsAppTurn(db: any, actor: Actor, inbound: any, items: any[], media: typeof downloadMetaMedia, transcription?: string, conversationRows: any[] = []) {
  const text = transcription ?? items.map(item => {
    if (item.type === 'text') return item.text?.body;
    if (item.type === 'interactive' || item.type === 'button') return parseWhatsAppInteractiveReply(item);
    return item[item.type]?.caption;
  }).filter(Boolean).join('\n');
  const quoteInput = isQuoteWorkflow(text, items.some(item => item.type === 'image'));
  const destination = isDestinationCommand(text);
  const files = items.filter(item => ['image', 'document', 'audio'].includes(item.type));
  const noAttachment = transcription !== undefined || files.length === 0;
  const contextualPdf = noAttachment && isQuotePdfRequest(text);
  const contextualExcel = noAttachment && !contextualPdf && isQuoteExcelRequest(text);
  const contextualFileFormat: 'pdf' | 'excel' | null = contextualPdf ? 'pdf' : contextualExcel ? 'excel' : null;
  const replyContextId = items.find(item => item.context?.id)?.context?.id;
  const pendingReview = noAttachment && !quoteInput && !destination && !contextualFileFormat && isShortQuoteApproval(text)
    ? findPendingQuoteReview(conversationRows, replyContextId, text)
    : null;
  const last = conversationRows[0];
  const freshRows = conversationRows.filter(r => !r?.created_at || !(Date.now() - Date.parse(r.created_at) > quoteSessionMs));
  const recentReviewIds = replyContextId
    ? [quoteReference(freshRows.find(r => r.message_id === replyContextId))?.review].filter((v): v is string => Boolean(v))
    : freshRows.map(r => quoteReference(r)?.review).filter((v): v is string => Boolean(v));
  const immediateQuoteContext = Boolean(last?.acciones?.tipo === 'obrabot_cotizacion' && !last?.acciones?.proyecto_contexto_id && !last?.borrador_obra);
  const maybeNaturalEdit = noAttachment && !quoteInput && !destination && !contextualFileFormat && !pendingReview && actor.rol === 'admin' && recentReviewIds.length > 0 && looksLikeNaturalQuoteEdit(text);
  if (!contextualFileFormat && !quoteInput && !destination && !pendingReview && !maybeNaturalEdit && (actor.rol !== 'admin' || !isDestinationContinuation(text))) return null;
  const draft = last?.acciones?.rol_actor === actor.rol && last.borrador_obra &&
    !(Date.now() - Date.parse(last.created_at) > quoteSessionMs) ? last.borrador_obra : null;
  if (draft && !contextualFileFormat && !quoteInput && !destination) return null;
  let keepDraft = Boolean(contextualFileFormat);
  let reply: WhatsAppQuoteReply | null;
  try {
    let source: QuoteSource | undefined;
    if (quoteInput && !transcription && files.length) {
      if (!['admin', 'supervisor'].includes(actor.rol)) throw new AIError('OBRABOT_ADMIN', 'La preparación de cotizaciones corresponde al supervisor o administrador.', 403);
      const file = files[0];
      if (files.length !== 1 || !['document', 'image'].includes(file.type)) throw new AIError('OBRABOT_QUOTE_INPUT', 'Envía una planilla Excel, un PDF o una foto por cotización.', 422);
      const downloaded = await media(file[file.type].id);
      const mime = downloaded.mimeType === 'application/octet-stream' && /\.xlsx$/i.test(file.document?.filename || '') ? excelMime : downloaded.mimeType;
      source = { bytes: Buffer.from(downloaded.data, 'base64'), mime };
    }
    const sourceId = items.map(item => quoteButtonSource(item, 'create')).find(Boolean) || replyContextId;
    const ref = sourceId ? quoteReference(conversationRows.find(row => row.message_id === sourceId)) : undefined;
    const shortCreate = /^(?:crea|crear) (?:la |una )?obra[.!]?$/i.test(text.trim());
    const latest = !sourceId && (destination || shortCreate) ? conversationRows.map(quoteReference).find(Boolean) : undefined;
    const quotedId = sourceId ? ref?.review || null : latest ? latest.review || null : undefined;
    const createText = pendingReview
      ? `aprueba cotización ${pendingReview.id} ${pendingReview.revision}`
      : shortCreate && quotedId ? `Crea la obra con la cotización ${quotedId}` : text;
    if (shortCreate && (ref?.budget || latest?.budget || sourceId && !ref)) return null;
    const explicitQuote = text.match(/cotizaci[oó]n\s+([\w-]+)/i)?.[1];
    if (draft && !contextualFileFormat && !quoteInput) {
      if (!(destination || shortCreate) || (!quotedId && !(explicitQuote && validQuoteId(explicitQuote)))) return null;
      keepDraft = true;
      reply = { respuesta: 'Tienes una obra en preparación. Puedes completarla o escribir «Cancelar» antes de usar otra cotización.' };
    } else if (contextualFileFormat) {
      const pdfSource = contextualFileFormat === 'pdf'
        ? (items.map(item => quoteButtonSource(item, 'pdf')).find(Boolean) || sourceId)
        : sourceId;
      reply = await requestedQuoteFile(db, actor, conversationRows, contextualFileFormat, pdfSource);
    } else if (maybeNaturalEdit) {
      reply = await tryNaturalQuoteEdit(db, actor, 'whatsapp', text, recentReviewIds, immediateQuoteContext, inbound.id);
      if (!reply && !isDestinationContinuation(text)) return null;
      if (!reply) reply = await handleQuoteTurn(db, actor, 'whatsapp', createText, inbound.id, source, { quotedId });
    } else {
      reply = await handleQuoteTurn(db, actor, 'whatsapp', createText, inbound.id, source, { quotedId });
    }
  } catch (error) {
    if (!(error instanceof AIError) || error.status >= 500) throw error;
    reply = { respuesta: error.message };
  }
  if (!reply) return null;
  const progress = reply.pasoPendiente ? progressAfter(conversationRows[0]?.acciones?.seguimiento, 'Crear obra',
    reply.pasoPendiente, reply.respuesta) : null;
  const { data, error } = await db.rpc('aplicar_lote_copiloto', {
    p_id: inbound.id, p_empresa: actor.empresa_id, p_actor: actor.id, p_phone: canonicalPhone(inbound.from),
    p_texto: sanitizeQuoteAuditText(text), p_respuesta: progress?.pausa_humana ? pausedReply : reply.respuesta,
    p_cotizacion: null,
    p_acciones: {
      tipo: 'obrabot_cotizacion', ...progress, rol_actor: actor.rol, archivo_cotizacion: reply.archivo,
      cotizacion_aprobada_id: reply.cotizacionAprobadaId, solicitud_cotizacion: reply.solicitud,
      revision_cotizacion: reply.revision, presupuesto_pdf_id: reply.presupuestoPdfId, proyecto_contexto_id: reply.obra,
    },
    p_changed: {}, p_deleted: {}, p_adjunto: null, p_borrador: keepDraft ? draft : null, p_aviso: null,
  });
  if (error || !data?.message_id) throw new AIError('OBRABOT_QUOTE_DB', 'No pude confirmar la respuesta de la cotización.', 503);
  return { ...data, persistido: true };
}

export async function obrabotWhatsAppFile(db: any, receipt: any, to: string) {
  const file = receipt?.acciones?.archivo_cotizacion;
  if (!receipt?.persistido || receipt.acciones?.tipo !== 'obrabot_cotizacion' || !file || !['pdf', 'excel'].includes(file.formato)) return null;
  const { data: actor, error } = await db.from('usuarios').select('id,rol,empresa_id,telefono_whatsapp').eq('empresa_id', receipt.empresa_id).eq('id', receipt.actor_id).maybeSingle();
  if (error) throw new AIError('OBRABOT_QUOTE_DB', 'No pude comprobar el destinatario.', 503);
  const phone = canonicalPhone(to);
  if (!actor || actor.rol !== 'admin' || !phone || phone !== canonicalPhone(actor.telefono_whatsapp || '')) return null;
  if (file.origen === 'presupuesto') {
    const budget = await findBudget(db, actor.empresa_id, file.id);
    if (!budget?.cotizacion || ['rechazada', 'anulada', 'no_elegida'].includes(budget.estado)) return null;
    return quoteFile(db, actor.empresa_id, budget.cotizacion, file.formato);
  }
  const quote = await getApprovedQuote(db, actor, file.id);
  return quoteFile(db, actor.empresa_id, quote, file.formato);
}
