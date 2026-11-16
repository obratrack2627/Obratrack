import { AsyncLocalStorage } from 'node:async_hooks';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { AIError } from './errors';

type Actor = {id:string;empresa_id:string};
type Scope = {actor?:Actor;channel:'web'|'whatsapp'};
const scope=new AsyncLocalStorage<Scope>();
export function withAIRequest<H extends (...args:any[])=>any>(handler:H,channel:'web'|'whatsapp'='web'):H {
 return ((...args:Parameters<H>)=>scope.run({channel},()=>handler(...args))) as H;
}
export function setAIUsageActor(actor:Actor){const current=scope.getStore();if(current)current.actor={id:actor.id,empresa_id:actor.empresa_id};}

/** The server, never the browser, reserves and settles provider calls. */
export async function reserveAIUsage(units:number,kind:'generation'|'audio'|'embedding') {
 const current=scope.getStore();
 // Explicit CLI evaluation has its own request budget; serving routes always create a scope.
 if(!current)return async(_actual?:number)=>{};
 if(!current.actor)throw new AIError('AUTH_REQUIRED','Inicia sesión para continuar.',401);
 const admin=getSupabaseAdmin();
 if(!admin)throw new AIError('AI_USAGE_UNAVAILABLE','El asistente no está disponible temporalmente. Intenta más tarde.',503);
 let reservation;
 try {
  const request=admin.rpc('reservar_uso_obrabot',{p_actor:current.actor.id,p_empresa:current.actor.empresa_id,p_canal:current.channel,p_tipo:kind,p_unidades:Math.ceil(units)});
  reservation=await (typeof request.abortSignal==='function'?request.abortSignal(AbortSignal.timeout(2000)):request);
 } catch {
  throw new AIError('AI_USAGE_UNAVAILABLE','No se pudo comprobar la disponibilidad del asistente. Intenta más tarde.',503);
 }
 const {data,error}=reservation;
 if(error||!data?.id){
  if(/AI_QUOTA_DAILY/.test(error?.message||''))throw new AIError('AI_QUOTA_DAILY','Tu empresa alcanzó el límite diario de uso del asistente. Podrás continuar mañana.',429);
  if(/AI_QUOTA_BUSY/.test(error?.message||''))throw new AIError('AI_QUOTA_BUSY','Hay varias consultas en curso. Espera unos segundos y vuelve a intentar.',429);
  throw new AIError('AI_USAGE_UNAVAILABLE','No se pudo comprobar la disponibilidad del asistente. Intenta más tarde.',503);
 }
 const id=data.id;
 return async(actual?:number)=>{
  try{
   const request=admin.rpc('finalizar_uso_obrabot',{p_id:id,p_unidades:actual!=null&&Number.isFinite(actual)&&actual>=0?Math.ceil(actual):null});
   const result=await (typeof request.abortSignal==='function'?request.abortSignal(AbortSignal.timeout(1500)):request);
   if(result.error)console.warn('obrabot_usage_settlement_failed');
  }catch{console.warn('obrabot_usage_settlement_failed');}
 };
}
