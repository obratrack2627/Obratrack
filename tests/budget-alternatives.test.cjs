require('./helpers/typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeQuote, parseChatResponse } = require('../lib/ai/protocol.ts');
const { reviseQuote } = require('../lib/quotes/revise.ts');
const { buildQuoteDocument } = require('../lib/quotes/document.ts');
const { budgetApplication } = require('../lib/quotes/application.ts');
const { chooseBudgetOption } = require('../lib/whatsapp/budget-options.ts');
const { quoteWhatsApp } = require('../lib/whatsapp/format.ts');
const { QUOTE_RESPONSE_SCHEMA } = require('../lib/ai/schema.ts');
const raw = (name, value) => ({ titulo_proyecto: 'Remodelación', nombre_alternativa: name, modo_presupuesto: 'precio_acordado', tratamiento_iva: 'incluido', partidas_venta: [{ nombre: 'Base común', unidad: 'gl', cantidad: 1, precio_unitario: 6871000 }, { nombre: name, unidad: 'gl', cantidad: 1, precio_unitario: value }], materiales: [], mano_de_obra: [], duracion_dias_estimada: 30 });
const pair = () => [normalizeQuote(raw('Wall panel',1940000)),normalizeQuote(raw('Deck WPC',2016000))];
test('las alternativas conservan los precios de venta acordados, sin agregar margen ni sumar opciones', () => {
  const [a,b] = pair();
  assert.equal(a.estructura_financiera.precio_total_con_iva,8811000);
  assert.equal(b.estructura_financiera.precio_total_con_iva,8887000);
  assert.equal(b.estructura_financiera.precio_total_con_iva-a.estructura_financiera.precio_total_con_iva,76000);
  for (const q of [a,b]) {
    assert.equal(q.estructura_financiera.margen_utilidad_monto,0);
    const doc=buildQuoteDocument(q);
    assert.equal(doc.items.reduce((s,r)=>s+r.total,0),doc.total);
    assert.equal(doc.subtotal+doc.iva,doc.total);
    assert.equal(doc.items.length,2);
  }
});
test('el IVA requiere confirmación y se calcula una vez; se rechazan importes inseguros', () => {
  assert.throws(()=>normalizeQuote({...raw('A',1940000),tratamiento_iva:undefined}),/Confirma/);
  const q=normalizeQuote({...raw('A',1940000),tratamiento_iva:'neto'});
  assert.equal(q.estructura_financiera.precio_total_con_iva,10485090);
  assert.throws(()=>normalizeQuote({...raw('A',1940000),partidas_venta:[{nombre:'X',unidad:'gl',cantidad:2,precio_unitario:Number.MAX_SAFE_INTEGER}]}));
  assert.throws(()=>normalizeQuote({...raw('A',1940000),partidas_venta:[{nombre:'X',unidad:'gl',cantidad:1,precio_unitario:1.5}]}));
});
test('editar el precio acordado conserva identidad y recalcula hitos, documento y total enviados adulterados', () => {
  const q=normalizeQuote({...raw('A',1940000),partidas_venta:[{nombre:'Obra',unidad:'gl',cantidad:1,precio_unitario:2247000}],hitos_pago:[{nombre:'Anticipo',porcentaje:60,monto:1342800},{nombre:'Entrega',porcentaje:40}]});
  assert.deepEqual(q.hitos_pago.map(r=>r.monto),[1348200,898800]);
  const updated=reviseQuote(q,{...q,mostrar_fecha:false,nombre_archivo:'Obra Padre Hurtado.pdf',partidas_venta:[{...q.partidas_venta[0],precio_unitario:3002000,subtotal:1}]});
  assert.equal(updated.id,q.id);assert.equal(updated.fecha_creacion,q.fecha_creacion);
  assert.equal(updated.estructura_financiera.precio_total_con_iva,3002000);
  assert.equal(updated.hitos_pago.reduce((s,r)=>s+r.monto,0),3002000);
  const doc=buildQuoteDocument(updated);assert.equal(doc.fecha,'');assert.equal(doc.filename,'Obra_Padre_Hurtado.pdf');
  assert.throws(()=>reviseQuote(q,{...q,hitos_pago:[{nombre:'Anticipo',porcentaje:60}]}),/100%/);
});
test('el protocolo devuelve propuestas completas sin ejecutar acciones ni elegir una por defecto', () => {
  const result=parseChatResponse(JSON.stringify({respuesta:'Opciones',acciones:[],cotizacion:null,cotizaciones_alternativas:[raw('Wall panel',1940000),raw('Deck WPC',2016000)]}));
  assert.equal(result.accion,null);assert.equal(result.cotizacion.alternativas.length,1);
  assert.notEqual(result.cotizacion.id,result.cotizacion.alternativas[0].id);
  const text=quoteWhatsApp(result.cotizacion);
  assert.match(text,/8.811.000/);assert.match(text,/8.887.000/);assert.match(text,/no se suman/);
  assert.doesNotMatch(text,/\*2\* · Modificar/);
  assert.throws(()=>parseChatResponse(JSON.stringify({respuesta:'Opciones',acciones:[{tipo:'crear_proyecto',nombre:'X',monto:1,dias:1}],cotizaciones_alternativas:[raw('A',1),raw('B',2)]})));
  assert.ok(QUOTE_RESPONSE_SCHEMA.properties.cotizaciones.items.properties.partidas_venta);
  assert.equal(QUOTE_RESPONSE_SCHEMA.properties.cotizaciones.maxItems,undefined);
  assert.equal(parseChatResponse(JSON.stringify({respuesta:"Faltan datos",cotizaciones:[]})).cotizacion,null);
  assert.equal(parseChatResponse(JSON.stringify({respuesta:"Lista",cotizaciones:[raw("A",1940000)]})).cotizacion.estructura_financiera.precio_total_con_iva,8811000);
});
test('WhatsApp elige por número solo tras mostrar alternativas y exige coincidencia única del nombre', () => {
  const rows=pair().map((q)=>({id:q.id,nombre_alternativa:q.nombre_alternativa,cotizacion:q}));
  assert.equal(chooseBudgetOption('2',rows,true),rows[1]);
  assert.equal(chooseBudgetOption('2',rows,false),null);
  assert.equal(chooseBudgetOption('sí',rows,true),null);
  assert.equal(chooseBudgetOption('Aprueba la alternativa Deck WPC',rows,false),rows[1]);
  assert.equal(chooseBudgetOption('deck',rows,true),null);
  assert.equal(chooseBudgetOption('Deck WPC',[rows[1],{...rows[1],id:'duplicate'}],true),null);
});
test('la aplicación usa solo materiales canónicos y permite conservar la ejecución existente', () => {
  const q=normalizeQuote({...raw('A',1940000),materiales:[{nombre:'WPC',unidad:'un',cantidad:2.5,precio_unitario_estimado:5000}],actividades_gantt:[{nombre:'Montaje',dias:2}]});
  const project={id:'p1',fecha_inicio:'2026-11-03'};
  const activities=[{id:'previous',proyecto_id:'p1',orden:50},{id:'manual',proyecto_id:'p1',orden:4}];
  const group={ejecucion:{actividades:[activities[0]]}};
  const payload=budgetApplication(q,project,activities,group,{});
  assert.equal(payload.materiales_proyecto[0].subtotal,12500);assert.equal(payload.materiales_proyecto[0].comprado,false);
  assert.equal(payload.actividades[0].orden,5);assert.equal(payload.actividades[0].fecha_termino,'2026-11-04');
  const keep=budgetApplication(q,project,activities,group,{incluir_materiales:false,incluir_gantt:false});
  assert.deepEqual(keep.actividades,[]);assert.deepEqual(keep.materiales_proyecto,[]);
});
