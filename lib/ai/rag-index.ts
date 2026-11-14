import {waitUntil} from '@vercel/functions';
import {getSupabaseAdmin} from '@/lib/supabase/admin';
import {embedReference} from './rag';
export async function indexKnowledge(client:any,company:string,embed=embedReference,limit=3){
 const {data,error}=await client.from('obrabot_knowledge').select('id,content,content_hash').eq('empresa_id',company).is('embedding',null).limit(Math.min(limit,10));
 if(error)throw new Error('RAG_INDEX_READ');let indexed=0;
 for(const row of data||[]){
  const vector=await embed(row.content);
  const result=await client.from('obrabot_knowledge').update({embedding:JSON.stringify(vector),embedding_model:process.env.OPENAI_EMBEDDING_MODEL||'text-embedding-3-small'}).eq('empresa_id',company).eq('id',row.id).eq('content_hash',row.content_hash).select('id');
  if(result.error)throw new Error('RAG_INDEX_WRITE');indexed+=result.data?.length||0;
 }
 return indexed;
}
export function scheduleKnowledgeIndex(company:string){
 if(process.env.OBRABOT_RAG_ENABLED!=='true')return;
 const client=getSupabaseAdmin();if(!client)return;
 const task=indexKnowledge(client,company).catch(()=>0);
 try{waitUntil(task);}catch{/* El índice no bloquea la conversación. */}
}
