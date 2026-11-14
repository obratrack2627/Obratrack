import { waitUntil } from '@vercel/functions';
import { qualityPayload, type QualityEvent } from './quality';

export function scheduleQualityEvent(client: any, actor: {id:string;empresa_id:string}, event: QualityEvent, channel: 'web'|'whatsapp'='web', defer: (task: Promise<unknown>)=>void=waitUntil): void {
  const payload=qualityPayload(event);
  if(!payload)return;
  const task=Promise.resolve().then(async()=>{
    const query=client.from('obrabot_quality_events').insert({...payload,empresa_id:actor.empresa_id,usuario_id:actor.id,channel});
    await (typeof query.abortSignal==='function'?query.abortSignal(AbortSignal.timeout(1500)):query);
  }).catch(()=>undefined);
  // waitUntil mantiene el trabajo vivo en Vercel sin bloquear la respuesta.
  try{defer(task);}catch{/* Fuera de Vercel el trabajo ya está programado y captura sus fallos. */}
}
