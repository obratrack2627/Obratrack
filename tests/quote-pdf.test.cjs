require('./helpers/typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeQuote } = require('../lib/ai/protocol.ts');
const { buildQuoteDocument } = require('../lib/quotes/document.ts');
const { createQuotePdf } = require('../lib/quotes/pdf.ts');
const quote = (count = 2) => ({
  ...normalizeQuote({
    id: 'quote-654321', titulo_proyecto: 'Ampliación de vivienda', comuna_region: 'Maipú',
    cliente_nombre: 'Constructora Álvarez', condiciones_pago: 'Anticipo del 30% y saldo contra entrega.',
    materiales: Array.from({ length: count }, (_, i) => ({ nombre: `Material ${i + 1}: Cemento y áridos para ampliación`, cantidad: 2.5, precio_unitario_estimado: 25000, unidad: 'm²' })),
    mano_de_obra: [{ rol: 'Maestro', cantidad_personas: 2, dias_estimados: 3, valor_jornal_diario: 50000 }],
  }),
  fecha_creacion: '2026-11-02T01:00:00.000Z',
});
test('vista y exportación conservan el detalle, los totales guardados y la fecha original de Chile', () => {
  const q = quote();
  const document = buildQuoteDocument(q, { clienteEmail: 'cliente@example.test' });
  assert.equal(document.items.reduce((total, item) => total + item.total, 0), document.subtotal);
  assert.equal(document.total, q.estructura_financiera.precio_total_con_iva);
  assert.equal(document.iva, q.estructura_financiera.iva_19);
  assert.match(document.fecha, /01.*11.*2026/);
  assert.equal(document.cliente.email, 'cliente@example.test');
  assert.equal(buildQuoteDocument({ ...q, cliente_email: 'anterior@example.test' }, { clienteEmail: '' }).cliente.email, 'Por definir');
  assert.equal(document.validez, 'Por acordar');
  assert.match(document.filename, /^ObraTrack_Cotizacion_.*Ampliacion_de_vivienda\.pdf$/);
});
test('genera un archivo PDF real, A4 y seleccionable sin requerir DOM ni impresión', () => {
  const pdf = createQuotePdf(buildQuoteDocument(quote()));
  assert.equal(pdf.getNumberOfPages(), 1);
  assert.ok(Math.abs(pdf.internal.pageSize.getWidth() - 210) < .1);
  assert.ok(Math.abs(pdf.internal.pageSize.getHeight() - 297) < .1);
  const bytes = Buffer.from(pdf.output('arraybuffer'));
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(bytes.length > 3000);
  assert.match(bytes.toString('latin1'), /\/Font/);
});
test('los presupuestos extensos generan más páginas y conservan todas las partidas', () => {
  const document = buildQuoteDocument(quote(100));
  const pdf = createQuotePdf(document);
  assert.equal(document.items.filter((item) => item.nombre.startsWith('Material ')).length, 100);
  assert.ok(pdf.getNumberOfPages() >= 3);
  const final = document.items.at(-1);
  assert.ok(final && final.total > 0);
});
