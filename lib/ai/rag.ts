import { serverFetch } from '@/lib/server-fetch';
import { getServerOpenAIKey } from './openai-provider';
import { isQuoteRequest,isQuoteRevision,requestsPlatformAction,isMaterialPriceRequest } from './prompt';
export const EMBEDDING_DIMENSIONS=1536;
export async function embedReference(text:string,fetcher:typeof fetch=serverFetch):Promise<number[]> {
 const key=getServerOpenAIKey();if(!key)throw new Error('EMBEDDING_NOT_CONFIGURED');
 const response=await fetcher('https://api.openai.com/v1/embeddings',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_EMBEDDING_MODEL||'text-embedding-3-small',input:text.slice(0,20000),dimensions:EMBEDDING_DIMENSIONS}),signal:AbortSignal.timeout(3500)});
 if(!response.ok)throw new Error('EMBEDDING_UNAVAILABLE');
 const vector=(await response.json())?.data?.[0]?.embedding;
 if(!Array.isArray(vector)||vector.length!==EMBEDDING_DIMENSIONS||vector.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw new Error('EMBEDDING_INVALID');
 return vector;
}
export function ragEligible(query:string,role:string,enabled=process.env.OBRABOT_RAG_ENABLED==='true'){
 return enabled&&role!=='terreno'&&!requestsPlatformAction(query)&&!isMaterialPriceRequest(query)&&(isQuoteRequest(query)||isQuoteRevision(query));
}
export async function retrieveReferences(client:any,query:string,role:string,{enabled=process.env.OBRABOT_RAG_ENABLED==='true',embed=embedReference}={}) {
 if(!ragEligible(query,role,enabled))return [];
 try{
  const vector=await embed(query);
  let call=client.rpc('match_obrabot_knowledge',{query_embedding:JSON.stringify(vector),match_count:4});
  if(typeof call.abortSignal==='function')call=call.abortSignal(AbortSignal.timeout(1500));
  const {data,error}=await call;if(error)return [];
  return (data||[]).filter((r:any)=>['apu','budget'].includes(r.source_type)&&Number.isFinite(r.similarity)&&r.similarity>=0.25).slice(0,4).map((r:any)=>({source_type:r.source_type,source_id:r.source_id,referencia:r.payload,uso:'Referencia histórica aprobada de tu empresa; no es precio de mercado ni autorización de ejecución.'}));
 }catch{return [];}
}
