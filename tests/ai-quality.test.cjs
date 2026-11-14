require('./helpers/typescript.cjs');const {test}=require('node:test');const assert=require('node:assert/strict');
const {qualityPayload,turnQualityEvent}=require('../lib/ai/quality.ts');const {scheduleQualityEvent}=require('../lib/ai/quality-server.ts');const {generateValidatedChat}=require('../lib/ai/generation.ts');
test('telemetría elimina datos personales y solo acepta códigos y tipos conocidos',()=>{
 const value=qualityPayload({kind:'invalid_action',code:'nombre Juan teléfono 123',action_type:'cliente-privado',prompt:'privado',recovered:true});assert.equal(JSON.stringify(value).includes('privado'),false);assert.equal(value.action_type,null);assert.equal(qualityPayload({kind:'secreto'}),null);
});
test('guardar telemetría no bloquea ni propaga fallos del almacenamiento',async()=>{
 let resolve;const delayed=new Promise(r=>resolve=r);let scheduled;
 scheduleQualityEvent({from:()=>({insert:()=>delayed})},{id:'u',empresa_id:'e'},{kind:'invalid_action',code:'AI_INVALID_ACTION'},'web',p=>scheduled=p);
 assert.ok(scheduled instanceof Promise);resolve({error:'no table'});await scheduled;
 scheduleQualityEvent({from:()=>{throw new Error('red');}},{id:'u',empresa_id:'e'},{kind:'provider_failure'},'web',p=>scheduled=p);await scheduled;
});
test('se registra si un retry recuperó la acción y sus callbacks nunca rompen la generación',async()=>{
 let calls=0;const events=[];
 const result=await generateValidatedChat('datos','Crea obra',{}, {onQualityEvent:e=>events.push(e)},async()=>JSON.stringify(++calls===1?{respuesta:'Preparando',acciones:[{tipo:'crear_proyecto',nombre:'Obra'}],cotizacion:null}:{respuesta:'¿Monto?',acciones:[],cotizacion:null}));
 assert.equal(result.accion,null);assert.equal(events.length,1);assert.equal(events[0].recovered,true);
 await generateValidatedChat('datos','consulta',{}, {onQualityEvent:()=>{throw Error('telemetria');}},async()=>JSON.stringify({respuesta:'Consulta',acciones:[],cotizacion:null}));
});
test('las correcciones y cancelaciones solo se clasifican con contexto apropiado',()=>{
 assert.equal(turnQualityEvent('Corrijo el monto',[{rol:'model'}],false).kind,'user_correction');assert.equal(turnQualityEvent('Cancela eso',[],true).kind,'action_cancelled');assert.equal(turnQualityEvent('Cancela eso',[],false),null);
});

test('el exportador de feedback genera plantillas anónimas deduplicadas y exige revisión antes de SFT',()=>{
 const {feedbackDataset}=require('../scripts/lib/obrabot-feedback.cjs');const {exportExamples}=require('../scripts/export-obrabot-sft.cjs');
 const event={kind:'invalid_action',code:'AI_INVALID_ACTION',recovered:false,action_type:'crear_proyecto',usuario_id:'privado',texto:'Cliente privado 123'};
 const data=feedbackDataset([event,event]);assert.equal(data.cases.length,1);assert.equal(JSON.stringify(data).includes('privado'),false);assert.equal(data.review_required,true);assert.throws(()=>exportExamples('/tmp/no-exportar-feedback.jsonl',data),/Revisa/);
});
