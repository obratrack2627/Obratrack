import {AIError} from './errors';
import {findBudget} from '@/lib/presupuestos';
export function historyMessages(input:unknown){
 if(!Array.isArray(input)||input.length>100)throw new AIError('CHAT_INVALID','La conversación supera el tamaño permitido.',422);
 return input.filter(m=>!m?.obra_contexto_id&&!String(m?.id||'').startsWith('m-init')).map(m=>{
  if(typeof m?.id!=='string'||m.id.length>200||!m.id||!['usuario','agente'].includes(m.remitente)||typeof m.texto!=='string'||!m.texto.trim()||m.texto.length>12000)throw new AIError('CHAT_INVALID','Revisa los mensajes de la conversación.',422);
  const action=m.accion_ejecutada&&typeof m.accion_ejecutada==='object'?{...m.accion_ejecutada}:undefined;
  if(action?.link_destino&&(typeof action.link_destino!=='string'||!action.link_destino.startsWith('/')||action.link_destino.startsWith('//')))delete action.link_destino;
  const payload={id:m.id,remitente:m.remitente,texto:m.texto,timestamp:typeof m.timestamp==='string'?m.timestamp.slice(0,30):'',...(Number.isFinite(Date.parse(m.created_at))?{created_at:new Date(m.created_at).toISOString()}:{}),...(Array.isArray(m.sugerencias)?{sugerencias:m.sugerencias.filter((s:any)=>typeof s==='string').slice(0,6)}:{}),...(action?{accion_ejecutada:action}:{}),...(typeof m.cotizacion_generada?.id==='string'||typeof m.cotizacion_id==='string'?{cotizacion_id:m.cotizacion_generada?.id||m.cotizacion_id}:{})};
  if(JSON.stringify(payload).length>60000)throw new AIError('CHAT_INVALID','Un mensaje es demasiado extenso para sincronizar.',422);
  return payload;
 });
}
export async function syncChat(client:any,user:{empresa_id:string},input?:{version:number;messages?:unknown;reset?:boolean}){
 if(input&&(!Number.isInteger(input.version)||input.version<0))throw new AIError('CHAT_VERSION','Actualiza la conversación antes de sincronizar.',409);
 const {data,error}=await client.rpc('sync_obrabot_chat',{p_version:input?.version??null,p_messages:input?.reset?[]:historyMessages(input?.messages||[]),p_reset:input?.reset===true});
 if(error)throw new AIError('CHAT_SYNC','No se pudo sincronizar la conversación. La copia del dispositivo se conserva.',503);
 if(!data||!Array.isArray(data.messages)||!Number.isInteger(data.version))throw new AIError('CHAT_SYNC','La conversación no se pudo recuperar.',503);
 return {...data,...await hydrateHistory(client,user,data.messages),has_more:data.messages.length===100};
}
export async function readOlderChat(client:any,user:{empresa_id:string},before:string,id:string){
 if(!Number.isFinite(Date.parse(before))||!id||id.length>200)throw new AIError('CHAT_INVALID','La página de historial no es válida.',422);
 const {data,error}=await client.rpc('read_obrabot_chat_page',{p_before:new Date(before).toISOString(),p_before_id:id});
 if(error||!data||!Array.isArray(data.messages))throw new AIError('CHAT_SYNC','No se pudieron recuperar mensajes anteriores.',503);
 return {...data,...await hydrateHistory(client,user,data.messages)};
}
async function hydrateHistory(client:any,user:{empresa_id:string},messages:any[]){
 const quotes=new Map<string,any>();
 for(const m of messages)if(m.cotizacion_id&&!quotes.has(m.cotizacion_id))quotes.set(m.cotizacion_id,null);
 // Solo IDs del historial privado; nunca usar la copia de presupuesto del navegador.
 await Promise.all(Array.from(quotes.keys()).map(async id=>{const budget=await findBudget(client,user.empresa_id,id);quotes.set(id,budget?.cotizacion||null);}));
 return {messages:messages.map((m:any)=>({...m,...(quotes.get(m.cotizacion_id)?{cotizacion_generada:quotes.get(m.cotizacion_id)}:{})}))};
}
