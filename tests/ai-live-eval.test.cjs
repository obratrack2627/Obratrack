require('./helpers/typescript.cjs');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {run}=require('../scripts/eval-obrabot-live.cjs');const {dataset}=require('./helpers/obrabot-golden.cjs');
test('evaluación sin clave omite la red de forma segura',async()=>{
 let calls=0;const report=await run({enabled:false,generate:async()=>{calls++;throw new Error('No red');}});assert.equal(report.skipped,true);assert.equal(calls,0);
});
test('el runner evalúa todos los casos sin ejecutar acciones ni consultar retail',async()=>{
 let i=0;const report=await run({enabled:true,generate:async()=>JSON.stringify(dataset.cases[i++].response)});
 assert.equal(report.completed,dataset.cases.length);assert.equal(report.rates.pass,100);assert.equal(report.passed,true);
});
test('una aclaración vacía no acredita una creación solicitada',async()=>{
 const report=await run({enabled:true,cases:[dataset.cases[0]],generate:async()=>JSON.stringify({respuesta:'¿Qué necesitas?',acciones:[],cotizacion:null})});assert.equal(report.passed,false);assert.equal(report.rates.mode,0);
});

test('la evaluación reconoce partidas inline y nombres resueltos sin aceptar omisiones',()=>{
 const {grade}=require('../scripts/eval-obrabot-live.cjs');const {parseChatResponse}=require('../lib/ai/protocol.ts');
 const item=dataset.cases.find(c=>c.id==='crear-y-partida');
 const good=parseChatResponse(JSON.stringify({respuesta:'Preparando',acciones:[{tipo:'crear_proyecto',nombre:'Bodega',monto_cotizado:600000,partidas:[{nombre:'Excavación',dias:2}]}],cotizacion:null}));
 assert.equal(grade(item,good,'chat').pass,true);
 const incomplete=parseChatResponse(JSON.stringify({respuesta:'Preparando',acciones:[{tipo:'crear_proyecto',nombre:'Bodega',monto_cotizado:600000}],cotizacion:null}));assert.equal(grade(item,incomplete,'chat').pass,false);
 const advance=dataset.cases.find(c=>c.id==='buscar-y-avance');const resolved=parseChatResponse(JSON.stringify({respuesta:'Preparando',acciones:[{tipo:'actualizar_avance',proyecto_nombre:'Baño Ñuñoa',nombre:'Cerámicas',porcentaje_avance:30}],cotizacion:null}));assert.equal(grade(advance,resolved,'chat').pass,true);
});
