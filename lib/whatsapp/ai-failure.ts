import { pausedReply, progressAfter } from './conversation-progress';
import { AIError } from '@/lib/ai/errors';

const recoverable = new Set([
  'AI_QUOTA_BUSY', 'AI_RATE_LIMIT', 'AI_USAGE_UNAVAILABLE',
  'AI_TIMEOUT', 'AI_NETWORK', 'AI_UNAVAILABLE', 'AI_CREDENTIALS',
  'AI_NOT_CONFIGURED', 'AI_MODEL_INVALID',
  'AI_INVALID_RESPONSE',
]);

/** Business changes are empty. A cached receipt prevents retries of an unavailable AI call. */
export async function persistWhatsAppAIFailure(
  sb: any, error: unknown, user: any, message: any, phone: string,
  items: any[], context: { actions: any; draft: any },
) {
  if (!(error instanceof AIError) || !recoverable.has(error.code)) return null;
  console.warn('whatsapp_ai_unavailable', { code: error.code, messageId: message.id });
  const progress = progressAfter(context.actions.seguimiento, 'Procesar solicitud', { motivo: error.code }, error.message, true);
  const response = progress.pausa_humana ? pausedReply : `${error.message}\n\nNo ejecuté esta solicitud. Puedes volver a intentarlo con un mensaje nuevo o enviarlo como texto si era un audio.`;
  const { data, error: saveError } = await sb.rpc('aplicar_lote_copiloto', {
    p_id: message.id, p_empresa: user.empresa_id, p_actor: user.id, p_phone: phone,
    p_texto: items.map(item => item.text?.body || `[${item.type || 'mensaje'} recibido]`).join('\n'),
    p_respuesta: response, p_cotizacion: null,
    p_acciones: { ...context.actions, ...progress, rol_actor: user.rol, error_ia: error.code },
    p_changed: {}, p_deleted: {}, p_adjunto: null, p_borrador: context.draft, p_aviso: null,
  });
  if (saveError || !data?.message_id) throw new AIError('WHATSAPP_DATABASE_SAVE', 'No se confirmó el guardado del mensaje.', 503);
  return { ...data, persistido: true };
}
