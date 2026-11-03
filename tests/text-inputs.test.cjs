require('./helpers/typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeQuote } = require('../lib/ai/protocol.ts');
const { reviseQuote } = require('../lib/quotes/revise.ts');
const { chooseBudgetOption } = require('../lib/whatsapp/budget-options.ts');
const { acceptsQuotedProject } = require('../lib/whatsapp/quote-intake.ts');
const { whatsappText } = require('../lib/whatsapp/format.ts');

test('el correo editado admite subdominios y etiquetas, y rechaza direcciones incompletas o con espacios', () => {
  const q=normalizeQuote({titulo_proyecto:'Radier',materiales:[{nombre:'Cemento',cantidad:1,precio_unitario_estimado:5000}],mano_de_obra:[]});
  for (const email of ['cliente@example.cl','cliente+obra@sub.example.cl','a@b.co']) assert.equal(reviseQuote(q,{...q,cliente_email:email}).cliente_email,email);
  for (const email of ['cliente','@example.cl','cliente@.cl','cliente@example.','cliente@exa mple.cl','cliente@@example.cl','cliente\n@example.cl','a@'+'.'.repeat(290)]) assert.throws(()=>reviseQuote(q,{...q,cliente_email:email}),/correo/);
});

test('la elección por nombre conserva órdenes, acentos y signos finales sin aceptar confirmaciones ambiguas', () => {
  const row={id:'opcion',nombre_alternativa:'Deck WPC',cotizacion:{nombre_alternativa:'Deck WPC'}};
  for (const text of ['Aprueba la alternativa Deck WPC!!!','Elige   la   opción Deck WPC.','me quedo con Deck WPC?','crea la obra con la alternativa Deck WPC','elegir Deck WPC']) assert.equal(chooseBudgetOption(text,[row],false),row,text);
  for (const text of ['sí','aprueba','Deck','Elige otra alternativa']) assert.equal(chooseBudgetOption(text,[row],true),null,text);
  assert.equal(chooseBudgetOption('elige Deck WPC'+'.'.repeat(50000),[row],false),row);
  assert.equal(chooseBudgetOption('elige '+'.'.repeat(50000)+'x',[row],false),null);
});

test('la aceptación de una obra conserva las frases explícitas y rechaza instrucciones adicionales', () => {
  for (const text of ['Sí!!!','sí, crea la obra con el gantt y los materiales.','crea esta obra','crear obra con un gantt','créala']) assert.equal(acceptsQuotedProject(text),true,text);
  for (const text of ['quizá','sí y registra un pago','crea otra obra','.'.repeat(50000)+'x']) assert.equal(acceptsQuotedProject(text),false,text);
  assert.equal(acceptsQuotedProject('si'+'.!'.repeat(25000)),true);
});

test('WhatsApp convierte encabezados y enlaces completos, incluidos paréntesis, y conserva Markdown incompleto', () => {
  const text=whatsappText('## Obras activas\r\n**Proyecto**\n  - Avance\n[Ficha](https://example.test/obra_(patio))\n[Otro](http://example.test/precio?q=10)');
  assert.equal(text,'*Obras activas*\n*Proyecto*\n• Avance\nFicha\nhttps://example.test/obra_(patio)\nOtro\nhttp://example.test/precio?q=10');
  for (const input of ['['.repeat(50000),'[Obra](https://example.test/'.repeat(3000),'## '+' '.repeat(50000)+'\nfin']) assert.ok(whatsappText(input).includes('fin') || whatsappText(input).includes('['));
});
