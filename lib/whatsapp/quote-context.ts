import { AIError } from '@/lib/ai/errors';
import { quoteButtonSource } from './interactive';

export const quoteSessionMs = 12 * 60 * 60 * 1000;

// Meta responde con el ID saliente. Los borradores y recibos usan el ID entrante.
export async function restoreQuoteContext(db: any, actor: any, items: any[], history: any[]) {
  const resolved = [];
  const sources = [...history];
  for (const item of items) {
    const button = quoteButtonSource(item, 'create') || quoteButtonSource(item, 'pdf');
    let id = button || item.context?.id;
    if (id && !sources.some(row => row.message_id === id)) {
      if (!button) {
        const link = await db.from('whatsapp_respuestas_envios').select('source_message_id,presupuesto_ref')
          .eq('empresa_id', actor.empresa_id).eq('actor_id', actor.id).eq('meta_message_id', id).maybeSingle();
        if (link.error) {
          const code = String(link.error.code || '');
          const msg = String(link.error.message || '');
          const missingCol = code === '42703' || code === 'PGRST204' || /meta_message_id|source_message_id|presupuesto_ref/i.test(msg);
          if (!missingCol) throw new AIError('QUOTE_CONTEXT_READ', 'No pude consultar la referencia del mensaje.', 503);
        } else {
          id = link.data?.source_message_id || id;
          if (!link.data?.source_message_id && link.data?.presupuesto_ref && actor.rol === 'admin') {
            sources.push({ message_id: id, acciones: { rol_actor: actor.rol, presupuesto_pdf_id: link.data.presupuesto_ref } });
          }
        }
      }
      if (!sources.some(row => row.message_id === id)) {
        const receipt = await db.from('whatsapp_mensajes').select('*')
          .eq('empresa_id', actor.empresa_id).eq('actor_id', actor.id).eq('message_id', id).maybeSingle();
        if (receipt.error) throw new AIError('QUOTE_CONTEXT_READ', 'No pude consultar la cotización original.', 503);
        if (receipt.data && receipt.data.acciones?.rol_actor === actor.rol) sources.push(receipt.data);
      }
    }
    resolved.push(id ? { ...item, context: { ...item.context, id } } : item);
  }
  return { items: resolved, sources };
}
