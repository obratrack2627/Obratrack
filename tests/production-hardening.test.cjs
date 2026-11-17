require('./helpers/typescript.cjs');
const {test,afterEach}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const {completeRows,completeProjectRows}=require('../lib/supabase/pagination.ts');
const {validateFileContent}=require('../lib/supabase/file-validation.ts');
const admin=require('../lib/supabase/admin.ts');const original=admin.getSupabaseAdmin;
const {withAIRequest,setAIUsageActor,reserveAIUsage}=require('../lib/ai/usage.ts');
const {generateOpenAI}=require('../lib/ai/openai-provider.ts');
afterEach(()=>{admin.getSupabaseAdmin=original;});
async function providerFixture(fetcher,run){
 const previousFetch=global.fetch,previousKey=process.env.OPENAI_API_KEY,previousProxy=process.env.NO_PROXY;
 const calls=[];admin.getSupabaseAdmin=()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:{id:'fixture-reservation'},error:null};}});
 global.fetch=fetcher;process.env.OPENAI_API_KEY='fixture-key';process.env.NO_PROXY='*';
 try{return await withAIRequest(async()=>{setAIUsageActor({id:'actor',empresa_id:'company'});return run(calls);})()}
 finally{global.fetch=previousFetch;if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey;if(previousProxy===undefined)delete process.env.NO_PROXY;else process.env.NO_PROXY=previousProxy;}
}
test('el audio Opus reserva por duración medida y no decenas de miles de unidades por una nota breve',async()=>{
 await providerFixture(async()=>new Response(JSON.stringify({text:'Avance registrado',usage:{type:'duration',seconds:1}})),async(calls)=>{
  const text=await generateOpenAI('Transcribe',{image:{mimeType:'audio/ogg',data:fs.readFileSync('tests/fixtures/voice-tone.ogg').toString('base64')}});
  assert.equal(text,'Avance registrado');assert.equal(calls[0].args.p_tipo,'audio');assert.ok(calls[0].args.p_unidades>0&&calls[0].args.p_unidades<1000);assert.equal(calls[1].args.p_unidades,calls[0].args.p_unidades);
 });
});
test('un rechazo HTTP explícito libera las unidades reservadas sin eliminar el intento',async()=>{
 await providerFixture(async()=>new Response('',{status:429}),async(calls)=>{
  await assert.rejects(generateOpenAI('Consulta'),e=>e.code==='AI_RATE_LIMIT');assert.equal(calls.length,2);assert.ok(calls[0].args.p_unidades>0);assert.equal(calls[1].args.p_unidades,0);
 });
});
test('un timeout ambiguo conserva la reserva y un audio inválido no consume una llamada de IA',async()=>{
 await providerFixture(async()=>{throw new DOMException('timeout','TimeoutError')},async(calls)=>{
  await assert.rejects(generateOpenAI('Consulta'),e=>e.code==='AI_TIMEOUT');assert.equal(calls[1].args.p_unidades,null);
  calls.length=0;await assert.rejects(generateOpenAI('Transcribe',{image:{mimeType:'audio/ogg',data:'aW52YWxpZA=='}}),e=>e.code==='AI_AUDIO_INVALID');assert.equal(calls.length,0);
 });
});
test('paginar recupera más de 1000 filas y usa un orden estable en cada página',async()=>{
 const rows=Array.from({length:1501},(_,id)=>({id}));const ranges=[],order=[];
 const result=await completeRows(()=>({order(c){order.push(c);return this;},range(start,end){ranges.push([start,end]);return Promise.resolve({data:rows.slice(start,end+1),error:null});}}));
 assert.equal(result.data.length,1501);assert.deepEqual(ranges,[[0,499],[500,999],[1000,1499],[1500,1999]]);assert.deepEqual(order,['id','id','id','id']);assert.equal(new Set(result.data.map(r=>r.id)).size,1501);
});
test('paginar no devuelve un conjunto parcial como exitoso cuando falla una página',async()=>{
 const result=await completeRows(()=>({order(){return this;},range(start){return {data:start?null:Array.from({length:500},(_,id)=>({id})),error:start?{code:'OUTAGE'}:null};}}));assert.equal(result.error.code,'OUTAGE');assert.equal(result.data,null);
});
test('las consultas de obra dividen listas de IDs grandes sin omitir proyectos',async()=>{
 const requested=[];const client={from(){let ids;return {select(){return this;},in(_column,values){ids=values;requested.push(values);return this;},order(){return this;},range(){return {data:ids.map(id=>({id})),error:null};}};}};
 const result=await completeProjectRows(client,'actividades',Array.from({length:200},(_,i)=>String(i)));assert.equal(result.data.length,200);assert.deepEqual(requested.map(r=>r.length),[75,75,50]);
});
test('una foto declarada PNG debe decodificarse; el MIME por sí solo no autoriza subirla',async()=>{
 await assert.rejects(validateFileContent(Buffer.from('not a PNG'),'image/png'),e=>e.status===422);
 const png=fs.readFileSync('tests/fixtures/wall-crack.png');await validateFileContent(png,'image/png');await assert.rejects(validateFileContent(png,'image/jpeg'),e=>e.status===422);
});
test('documentos rechazan HTML, PDF incompleto y contenedores Office falsificados',async()=>{
 await assert.rejects(validateFileContent(Buffer.from('<script>alert(1)</script>'),'text/html'),e=>e.status===422);
 await assert.rejects(validateFileContent(Buffer.from('%PDF-fake'),'application/pdf'),e=>e.status===422);
 await assert.rejects(validateFileContent(Buffer.from('PK-fake'),'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),e=>e.status===422);
});
test('la cuota se reserva antes de cobrar al proveedor y no puede resetearse desde el cliente',async()=>{
 const calls=[];admin.getSupabaseAdmin=()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:{id:'reservation'},error:null};}});
 await withAIRequest(async()=>{setAIUsageActor({id:'actor',empresa_id:'company'});const settle=await reserveAIUsage(125,'generation');assert.equal(calls[0].name,'reservar_uso_obrabot');await settle(40);})();
 assert.equal(calls[0].args.p_actor,'actor');assert.equal(calls[1].name,'finalizar_uso_obrabot');assert.equal(calls[1].args.p_unidades,40);
});
test('peticiones concurrentes mantienen aisladas la empresa y la identidad de la cuota',async()=>{
 const actors=[];admin.getSupabaseAdmin=()=>({rpc:async(name,args)=>{if(name==='reservar_uso_obrabot')actors.push(args.p_actor);return {data:{id:'r'},error:null};}});
 await Promise.all(['a','b'].map(id=>withAIRequest(async()=>{setAIUsageActor({id,empresa_id:'company-'+id});await new Promise(r=>setImmediate(r));await reserveAIUsage(100,'generation');})()));assert.deepEqual(actors.sort(),['a','b']);
});
test('cuota agotada corta antes de cualquier llamada pagada y muestra un error de ObraBot',async()=>{
 let calls=0;admin.getSupabaseAdmin=()=>({rpc:async()=>({data:null,error:{message:'AI_QUOTA_DAILY'}})});
 await assert.rejects(withAIRequest(async()=>{setAIUsageActor({id:'a',empresa_id:'c'});await reserveAIUsage(100,'generation');calls++;})(),e=>e.code==='AI_QUOTA_DAILY'&&e.status===429);assert.equal(calls,0);
});

test('las revisiones de WhatsApp provienen del snapshot del servidor, no de lo propuesto por IA',()=>{
 const {withSnapshotVersions}=require('../lib/sync/snapshot-versions.ts');
 const plan={changed:{proyectos:[{id:'p',nombre:'Actualizada',sync_version:999},{id:'new'}]},deleted:{actividades:[{id:'a',sync_version:999}]}};
 const result=withSnapshotVersions(plan,{proyectos:[{id:'p',sync_version:7}],actividades:[{id:'a',sync_version:2}]});
 assert.equal(result.changed.proyectos[0].sync_version,7);assert.equal(result.changed.proyectos[1].sync_version,null);assert.equal(result.deleted.actividades[0].sync_version,2);assert.equal(plan.changed.proyectos[0].sync_version,999);
});
test('si la comprobación de cuota falla por red se detiene antes de generar',async()=>{
 admin.getSupabaseAdmin=()=>({rpc:()=>Promise.reject(new Error('private connection details'))});
 await assert.rejects(withAIRequest(async()=>{setAIUsageActor({id:'a',empresa_id:'c'});await reserveAIUsage(10,'generation');})(),e=>e.status===503&&!e.message.includes('private'));
});

test('indexación auxiliar espera el término de la respuesta y no compite con la generación',async()=>{
 const {afterAIResponse}=require('../lib/ai/usage.ts');const order=[];
 await withAIRequest(async()=>{afterAIResponse(()=>order.push('index'));order.push('answer');assert.deepEqual(order,['answer']);})();
 assert.deepEqual(order,['answer','index']);
});
