import { AIError } from '@/lib/ai/errors';
import { canonicalPhone } from '@/lib/phone';
import { getApprovedQuote, handleQuoteTurn, isQuoteWorkflow, type Actor, type QuoteReply } from './quotes';
import { excelMime, quoteFile } from './quote-files';
import type { QuoteSource } from './quote-input';
import type { downloadMetaMedia } from '@/lib/whatsapp/meta';
import { isDestinationCommand, isDestinationContinuation, validQuoteId } from './quote-destination';
import { parseWhatsAppInteractiveReply } from '@/lib/whatsapp/interactive';

export async function quoteWhatsAppTurn(db: any, actor: Actor, inbound: any, items: any[], media: typeof downloadMetaMedia, transcription?: string, conversationRows: any[] = []) {
  const text = transcription ?? items.map(item => {
    if (item.type === 'text') return item.text?.body;
    if (item.type === 'interactive' || item.type === 'button') return parseWhatsAppInteractiveReply(item);
    return item[item.type]?.caption;
  }).filter(Boolean).join('\n');
  const quoteInput = isQuoteWorkflow(text);
  if (!quoteInput && !isDestinationCommand(text) && (actor.rol !== 'admin' || !isDestinationContinuation(text))) return null;
  let reply: QuoteReply | null;
  try {
    const files = items.filter(item => ['image', 'document', 'audio'].includes(item.type));
    let source: QuoteSource | undefined;
    if (quoteInput && !transcription && files.length) {
      if (!['admin', 'supervisor'].includes(actor.rol)) throw new AIError('OBRABOT_ADMIN', 'La preparación de cotizaciones corresponde al supervisor o administrador.', 403);
      const file = files[0];
      if (files.length !== 1 || !['document', 'image'].includes(file.type)) throw new AIError('OBRABOT_QUOTE_INPUT', 'Envía una planilla Excel, un PDF o una foto por cotización.', 422);
      const downloaded = await media(file[file.type].id);
      const mime = downloaded.mimeType === 'application/octet-stream' && /\.xlsx$/i.test(file.document?.filename || '') ? excelMime : downloaded.mimeType;
      source = { bytes: Buffer.from(downloaded.data, 'base64'), mime };
    }
    const sourceId = items.find(item => item.context?.id)?.context?.id;
    const receipt = sourceId && conversationRows.find(row => row.message_id === sourceId && row.acciones?.tipo === 'obrabot_cotizacion');
    const candidate = receipt?.acciones?.archivo_cotizacion?.id;
    const quotedId = sourceId ? (typeof candidate === 'string' && validQuoteId(candidate) ? candidate : null) : undefined;
    reply = await handleQuoteTurn(db, actor, 'whatsapp', text, inbound.id, source, { quotedId });
  } catch (error) {
    if (!(error instanceof AIError) || error.status >= 500) throw error;
    reply = { respuesta: error.message };
  }
  if (!reply) return null;
  const { data, error } = await db.rpc('aplicar_lote_copiloto', {
    p_id: inbound.id, p_empresa: actor.empresa_id, p_actor: actor.id, p_phone: canonicalPhone(inbound.from),
    p_texto: 'Solicitud de cotización a ObraBot', p_respuesta: reply.respuesta,
    p_cotizacion: null, p_acciones: { tipo: 'obrabot_cotizacion', rol_actor: actor.rol, archivo_cotizacion: reply.archivo, proyecto_contexto_id: reply.obra },
    p_changed: {}, p_deleted: {}, p_adjunto: null, p_borrador: null, p_aviso: null,
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
  const quote = await getApprovedQuote(db, actor, file.id);
  return quoteFile(db, actor.empresa_id, quote, file.formato);
}
