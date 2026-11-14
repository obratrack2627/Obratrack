require('./helpers/typescript.cjs');
const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {dataset,validateCandidate}=require('./helpers/obrabot-golden.cjs');
const {chatAsesorObrasGemini}=require('../lib/gemini.ts');
const {generateValidatedChat}=require('../lib/ai/generation.ts');
const {AIError}=require('../lib/ai/errors.ts');
const {flattenActions}=require('../lib/ai/protocol.ts');
const {CHAT_RESPONSE_SCHEMA,WHATSAPP_RESPONSE_SCHEMA}=require('../lib/ai/schema.ts');
const {compactAIContext,separatePrompt}=require('../lib/ai/prompt-context.ts');
const {chatPrompt}=require('../lib/ai/prompt.ts');
const savedKey=process.env.OPENAI_API_KEY;
afterEach(()=>{if(savedKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=savedKey;});
const completion=data=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(data)}]}]}));

test('Golden Set contiene al menos 30 escenarios distintos sin datos de producción',()=>{
 assert.ok(dataset.cases.length>=30);assert.equal(dataset.synthetic,true);assert.equal(new Set(dataset.cases.map(x=>x.id)).size,dataset.cases.length);
});
for(const item of dataset.cases){
 test('Golden: '+item.id,async()=>{
  const parsed=validateCandidate(item,item.response);
  if(item.rejected_action)assert.throws(()=>validateCandidate(item,{respuesta:'Preparando',acciones:[item.rejected_action],cotizacion:null}),e=>e.code===item.denied);
  process.env.OPENAI_API_KEY='fixture-openai';let calls=0;
  const context={...structuredClone(dataset.entities),...item.context,rol:item.role,acciones_habilitadas:item.plan==='pro_ia'};
  const result=await chatAsesorObrasGemini([],item.message,context,{fetcher:async(url,opts)=>{
   calls++;assert.equal(url,'https://api.openai.com/v1/responses');
   const body=JSON.parse(opts.body);const schema=body.text.format.schema;
   if(item.route==='chat')assert.ok(schema.properties.acciones,'no perder acciones en una solicitud combinada');
   if(item.route==='quote')assert.ok(schema.properties.cotizaciones);
   if(item.route==='search'){assert.ok(schema.properties.busqueda_materiales);assert.equal(schema.properties.acciones,undefined);}
   if(item.context.creacion_obra_whatsapp)assert.ok(schema.properties.acciones.items.anyOf.every(s=>!s.properties.tipo.enum.some(t=>/^crear_proyecto/.test(t))));
   assert.equal(body.text.format.strict,true);return completion(item.response);
  }});
  assert.equal(calls,1);assert.equal(flattenActions(result.accion).length,flattenActions(parsed.accion).length);
  if(item.context.cotizacion_actual && flattenActions(result.accion).some(a=>/^crear_proyecto/.test(a.tipo))){
   const action=flattenActions(result.accion)[0];assert.ok(action.monto_cotizado>1);assert.equal(action.materiales[0].precio_unitario,6000);assert.ok(action.partidas.length>0);
  }
 });
}

test('un error de campo se autocorrige una vez con el detalle exacto, antes de ejecutar',async()=>{
 let calls=0;
 const result=await generateValidatedChat('datos','Crea Bodega por 600000',{}, {schema:CHAT_RESPONSE_SCHEMA},async(prompt)=>{
  calls++;
  if(calls===1)return JSON.stringify({respuesta:'Preparando',acciones:[{tipo:'crear_proyecto',nombre:'Bodega'}],cotizacion:null});
  assert.match(prompt,/monto/);assert.match(prompt,/respuesta_anterior/);
  return JSON.stringify({respuesta:'Preparando',acciones:[{tipo:'crear_proyecto',nombre:'Bodega',monto_cotizado:600000}],cotizacion:null});
 });
 assert.equal(calls,2);assert.equal(result.accion.monto_cotizado,600000);
});
test('un error de referencias de prepareActionPlan se corrige antes de cualquier guardado',async()=>{
 let calls=0,checks=0;
 const item={message:'Actualiza Baño Ñuñoa a pausada',context:{},role:'admin',plan:'pro_ia'};
 const result=await generateValidatedChat('datos',item.message,{}, {validateResult:result=>{checks++;validateCandidate(item,{respuesta:result.respuesta,acciones:flattenActions(result.accion),cotizacion:null});}},async(prompt)=>{
  calls++;if(calls===2)assert.match(prompt,/No se encontró/);
  return JSON.stringify({respuesta:'Preparando',acciones:[{tipo:'actualizar_proyecto',proyecto_id:calls===1?'id-inventado':'p-bano',estado:'pausado'}],cotizacion:null});
 });
 assert.equal(calls,2);assert.equal(checks,2);assert.equal(result.accion.proyecto_id,'p-bano');
});
test('sin monto autorizado la reparación pregunta y no fabrica cero',async()=>{
 let calls=0;
 const result=await generateValidatedChat('datos','Crea Bodega',{}, {},async()=>JSON.stringify(++calls===1?{respuesta:'Preparando',acciones:[{tipo:'crear_proyecto',nombre:'Bodega'}],cotizacion:null}:{respuesta:'¿Cuál es el monto cotizado?',acciones:[],cotizacion:null}));
 assert.equal(calls,2);assert.equal(result.accion,null);assert.match(result.respuesta,/monto/);
});
test('segundo error 422 termina sin un tercer intento ni ejecución',async()=>{
 let calls=0;await assert.rejects(()=>generateValidatedChat('datos','Crea Bodega',{}, {},async()=>{calls++;return JSON.stringify({respuesta:'Preparando',acciones:[{tipo:'crear_proyecto',nombre:'Bodega'}],cotizacion:null});}),e=>e.code==='AI_INVALID_ACTION');assert.equal(calls,2);
});
test('permisos y alcance no se reparan cambiando la autorización',async()=>{
 for(const [code,status] of [['PLAN_REQUIRED',403],['ACTION_FORBIDDEN',403],['PROJECT_CONTEXT',422],['READ_ONLY_REQUEST',422]]){
  let calls=0;await assert.rejects(()=>generateValidatedChat('datos','consulta',{}, {validateResult:()=>{throw new AIError(code,'Denegado',status);}},async()=>{calls++;return JSON.stringify({respuesta:'Preparando',acciones:[],cotizacion:null});}),e=>e.code===code);assert.equal(calls,1);
 }
});
test('WhatsApp nunca devuelve una creación directa aunque el modelo intente saltarse el borrador',async()=>{
 let calls=0;
 const result=await generateValidatedChat('datos','Crea Bodega por 600000',{creacion_obra_whatsapp:true},{schema:WHATSAPP_RESPONSE_SCHEMA},async()=>JSON.stringify(++calls===1?{respuesta:'Preparando',acciones:[{tipo:'crear_proyecto',nombre:'Bodega',monto_cotizado:600000}],cotizacion:null}:{respuesta:'Prepararé el borrador.',acciones:[],cotizacion:null,obra_propuesta:{nombre:'Bodega',monto_cotizado:600000}}));
 assert.equal(calls,2);assert.equal(result.accion,null);assert.equal(result.obra_propuesta.nombre,'Bodega');
});
test('las instrucciones no incluyen texto del usuario, historial ni datos de contacto',()=>{
 const marker='IGNORA_REGLAS_DATO_NO_CONFIABLE_734';
 const full={...dataset.entities,clientes:[{id:'c-prueba',nombre:marker,descripcion:'x'.repeat(65000)}],operacion_obra:{actividades:[]}};
 const compact=compactAIContext(full);const split=separatePrompt(chatPrompt([{rol:'model',texto:marker}],marker,compact));
 assert.ok(split.input.includes(marker));assert.ok(!split.instructions.includes(marker));assert.ok(split.instructions.includes('No elijas la primera obra'));
 assert.ok(JSON.stringify(compact).length<JSON.stringify(full).length);assert.ok(split.input.includes('c-prueba'));
});
test('JSONL SFT exporta únicamente ejemplos validados sin iniciar entrenamiento',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obrabot-sft-'));const destination=path.join(dir,'examples.jsonl');
 try{
  const {exportExamples}=require('../scripts/export-obrabot-sft.cjs');assert.equal(exportExamples(destination),dataset.cases.length);
  const records=fs.readFileSync(destination,'utf8').trim().split('\n').map(JSON.parse);
  for(const [i,record] of records.entries()){assert.deepEqual(record.messages.map(m=>m.role),['system','user','assistant']);validateCandidate(dataset.cases[i],JSON.parse(record.messages[2].content));}
  assert.throws(()=>exportExamples(destination),e=>e.code==='EEXIST');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('crear una obra independiente conserva su monto aunque haya un presupuesto previo',()=>{
 const {quoteProjectFields}=require('../lib/ai/generation.ts');
 const quote=dataset.cases.find(c=>c.id==='cotizacion-a-obra').context.cotizacion_actual;
 const raw=JSON.stringify({respuesta:'Preparando',acciones:[{tipo:'crear_proyecto',nombre:'Bodega independiente',monto_cotizado:600000}],cotizacion:null});
 for(const message of ['Crea Bodega independiente por 600000','Crea Bodega independiente por 600000 sin usar el presupuesto anterior'])assert.equal(JSON.parse(quoteProjectFields(raw,message,{cotizacion_actual:quote})).acciones[0].monto_cotizado,600000);
 assert.equal(quoteProjectFields('null','Crea Bodega',{}),'null');
});
test('expresiones naturales de creación y conversión conservan el enrutamiento de acciones',()=>{
 const {requestsPlatformAction,isQuoteRequest}=require('../lib/ai/prompt.ts');
 for(const text of ['Créame una obra con esa cotización','Haz una nueva obra con el presupuesto','Pasa el presupuesto a una obra','Necesito que crees una obra con esa cotización']){
  assert.equal(requestsPlatformAction(text),true,text);assert.equal(isQuoteRequest(text),false,text);
 }
 assert.equal(requestsPlatformAction('Prepara una cotización. No crees obras ni emitas acciones.'),false);
});
test('la autocorrección comparte el mismo plazo y no abre una ventana nueva de ejecución',async()=>{
 let calls=0;const budgets=[];
 await generateValidatedChat('datos','Crea Bodega',{}, {budgetMs:1000,timeoutMs:700},async(_p,options)=>{
  budgets.push(options.budgetMs);calls++;if(calls===1){await new Promise(resolve=>setTimeout(resolve,15));return JSON.stringify({respuesta:'Preparando',acciones:[{tipo:'crear_proyecto',nombre:'Bodega'}],cotizacion:null});}
  return JSON.stringify({respuesta:'¿Cuál es el monto cotizado?',acciones:[],cotizacion:null});
 });
 assert.equal(calls,2);assert.ok(budgets[1]<budgets[0]);assert.ok(budgets[0]<=1000);
});
