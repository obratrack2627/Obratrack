require('./helpers/typescript.cjs');const {test,afterEach}=require('node:test');const assert=require('node:assert/strict');
const {embedReference,retrieveReferences,EMBEDDING_DIMENSIONS}=require('../lib/ai/rag.ts');const saved=process.env.OPENAI_API_KEY;afterEach(()=>{if(saved===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=saved;});
test('RAG no llama a red para terreno, mutaciones, retail ni cuando está deshabilitado',async()=>{
 for(const [q,role,enabled]of [['Cotiza radier','terreno',true],['Crea la obra con esa cotización','admin',true],['Busca precio de cemento','admin',true],['Cotiza radier','admin',false]]){
  let calls=0;const rows=await retrieveReferences({},q,role,{enabled,embed:async()=>{calls++;return [];}});assert.deepEqual(rows,[]);assert.equal(calls,0);
 }
});
test('recuperación top-K solo devuelve referencias atribuidas y falla de forma segura',async()=>{
 let params;const client={rpc:async(_name,p)=>{params=p;return{data:Array.from({length:8},(_,i)=>({source_type:'apu',source_id:String(i),similarity:0.8,payload:{rendimiento:4}}))};}};
 const rows=await retrieveReferences(client,'Cotiza un radier de 20 m2','admin',{enabled:true,embed:async()=>Array(1536).fill(.1)});assert.equal(params.match_count,4);assert.equal(rows.length,4);assert.match(rows[0].uso,/no es precio de mercado/);
 assert.deepEqual(await retrieveReferences({rpc:async()=>{throw Error('SQL');}},'Cotiza radier','admin',{enabled:true,embed:async()=>[]}),[]);
});
test('embeddings usa OpenAI con dimensión fija y rechaza vectores incompletos',async()=>{
 process.env.OPENAI_API_KEY='fixture';const v=await embedReference('Partida aprobada',async(url,o)=>{assert.equal(url,'https://api.openai.com/v1/embeddings');assert.equal(JSON.parse(o.body).dimensions,1536);return new Response(JSON.stringify({data:[{embedding:Array(EMBEDDING_DIMENSIONS).fill(.1)}]}));});assert.equal(v.length,1536);
 await assert.rejects(()=>embedReference('x',async()=>new Response(JSON.stringify({data:[{embedding:[1]}]}))),/EMBEDDING_INVALID/);
});

test('el índice usa versión de contenido para no guardar embeddings obsoletos',async()=>{
 const {indexKnowledge}=require('../lib/ai/rag-index.ts');const calls=[];
 const chain={select:()=>chain,eq:(k,v)=>{calls.push([k,v]);return chain;},is:()=>chain,limit:async()=>({data:[{id:'k',content:'Partida',content_hash:'hash-v1'}]}),update:v=>{calls.push(['update',v]);return {...chain,select:async()=>({data:[]})};}};
 assert.equal(await indexKnowledge({from:()=>chain},'empresa',async()=>Array(1536).fill(.1)),0);assert.ok(calls.some(([k,v])=>k==='content_hash'&&v==='hash-v1'));
});
