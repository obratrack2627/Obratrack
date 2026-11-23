import {createHash} from 'node:crypto';
import {AIError} from '@/lib/ai/errors';

/** Reserve before external I/O: uncertain acceptance is never retried automatically. */
export async function deliverReplyOnce(sb:any,receipt:any,source:string,part:string,send:()=>Promise<unknown>,inbound=true){
 if(!receipt.persistido){await send();return true;}
 const key=createHash('sha256').update(JSON.stringify([receipt.empresa_id,receipt.actor_id,source,part])).digest('hex');
 const {data,error}=await sb.rpc('whatsapp_reservar_respuesta',{p_key:key,p_empresa:receipt.empresa_id,p_actor:receipt.actor_id,p_inbound:inbound?source:null});
 if(error || typeof data?.claimed!=='boolean')throw new AIError('WHATSAPP_DELIVERY_RESERVE','No se pudo comprobar el envío de la respuesta.',503);
 if(!data.claimed)return data.accepted===true;
 let metaId: unknown;
 try{
  metaId = await send();
 }catch(error){
  // Only explicit provider rejection is safe to retry; network timeouts can already have delivered.
  if(error instanceof AIError && /^(WHATSAPP_SEND_|WHATSAPP_DOCUMENT_UPLOAD$|WHATSAPP_DOCUMENT_SEND$)/.test(error.code))
    await sb.rpc('whatsapp_finalizar_respuesta',{p_key:key,p_estado:'failed'});
  throw error;
 }
 const quote = receipt.cotizacion || receipt.acciones?.tipo === 'obrabot_cotizacion' || receipt.acciones?.presupuesto_cotizacion_id || receipt.acciones?.presupuesto_seleccion_id;
 if (typeof metaId === 'string' && quote) {
  const {error} = await sb.from('whatsapp_respuestas_envios').update({estado:'accepted',meta_message_id:metaId,source_message_id:inbound ? source : null,presupuesto_ref:inbound ? null : receipt.cotizacion?.id})
    .eq('delivery_key',key).eq('empresa_id',receipt.empresa_id).eq('actor_id',receipt.actor_id);
  if (error) throw new AIError('WHATSAPP_DELIVERY_CONFIRM','El envío quedó pendiente de comprobación.',503);
  return true;
 }
 const confirmed=await sb.rpc('whatsapp_finalizar_respuesta',{p_key:key,p_estado:'accepted'});
 if(confirmed.error)throw new AIError('WHATSAPP_DELIVERY_CONFIRM','El envío quedó pendiente de comprobación.',503);
 return true;
}
