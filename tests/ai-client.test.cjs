require('./helpers/typescript.cjs');
const {test,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
let syncOk=true, calls=0, outcome;
const service={pullFromCloudServer:async()=>({success:syncOk}),runLocalAI:fn=>fn(),saveCotizacion:()=>{}};
for(const [path,exports] of [
 ['../lib/data-service.ts',{dataService:service}],
 ['../lib/supabase/client.ts',{supabase:{}}],
 ['../lib/ai/execute.ts',{executeAI:async()=>{calls++;return outcome}}],
])require.cache[require.resolve(path)]={id:require.resolve(path),filename:require.resolve(path),loaded:true,exports};
const {applyAIResponse}=require('../lib/ai/client.ts');
const input={respuesta:'Voy a marcar Radier como cancelada.',accion:{tipo:'actualizar_proyecto',proyecto_id:'radier',estado:'cancelada'}};
beforeEach(()=>{syncOk=true;calls=0;outcome={result:{tipo:'actualizar_proyecto',resultado_texto:'Radier quedó como cancelada.'},warning:'',pendingId:undefined}});
test('la web confirma el resultado real después de guardar, en vez de conservar la promesa de la IA',async()=>{
 const result=await applyAIResponse(input);
 assert.equal(calls,1);assert.equal(result.texto,'Radier quedó como cancelada.');assert.equal(result.pendiente_sincronizacion,undefined);
});
test('un guardado pendiente muestra la advertencia y nunca afirma que el cambio quedó guardado',async()=>{
 outcome={result:undefined,pendingId:'pending-1',warning:'El guardado en la nube está pendiente.'};
 const result=await applyAIResponse(input);
 assert.equal(result.texto,outcome.warning);assert.equal(result.pendiente_sincronizacion,'pending-1');assert.equal(result.accion_ejecutada,undefined);
});
test('no aplica una acción con una caché que no pudo actualizarse',async()=>{
 syncOk=false;await assert.rejects(applyAIResponse(input),/No se pudieron actualizar/);assert.equal(calls,0);
});
test('las consultas conservan su respuesta y no ejecutan escrituras',async()=>{
 const result=await applyAIResponse({respuesta:'Radier tiene tres días de atraso.',accion:null});
 assert.equal(result.texto,'Radier tiene tres días de atraso.');assert.equal(calls,0);
});
