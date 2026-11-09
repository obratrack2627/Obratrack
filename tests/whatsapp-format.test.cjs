require('./helpers/typescript.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeQuote } = require('../lib/ai/protocol.ts');
const { formatCLP } = require('../lib/utils.ts');
const { WHATSAPP_BRAND, whatsappCard, quoteWhatsApp, quoteMenuChoice, materialComparisonWhatsApp, splitWhatsAppMessage } = require('../lib/whatsapp/format.ts');

test('la cotización conserva cálculos, todas las partidas y condiciones en formato nativo de WhatsApp', () => {
  const q = normalizeQuote({ titulo_proyecto: 'Radier patio', comuna_region: 'Maipú', metros_cuadrados: 20, duracion_dias_estimada: 4,
    materiales: [{ nombre: 'Hormigón H20', cantidad: 0.5, unidad: 'm3', precio_unitario_estimado: 90000 }],
    mano_de_obra: [{ rol: 'Maestro', cantidad_personas: 1, dias_estimados: 2, valor_jornal_diario: 45000 }],
    estructura_financiera: { tipo_utilidad: 'margen_venta', margen_utilidad_porcentaje: 20 },
    actividades_gantt: [{ nombre: 'Preparación', dias: 2 }, { nombre: 'Hormigonado', dias: 2 }],
    observaciones: 'Respetar curado antes de usar.', condiciones_pago: 'Pago acordado con el cliente.',
  });
  const text = quoteWhatsApp(q);
  assert.equal(text.includes(WHATSAPP_BRAND), false);
  assert.match(text, /\*Cotización · Radier patio\*/);
  assert.match(text, /0,5 m3/);
  assert.match(text, /Margen sobre venta \(20%\)/);
  assert.ok(text.includes('*TOTAL: ' + formatCLP(q.estructura_financiera.precio_total_con_iva) + '*'));
  assert.match(text, /1\. Preparación — 2 día/);
  assert.match(text, /Respetar curado/);
  assert.match(text, /Pago acordado/);
  assert.doesNotMatch(text, /\*\*|^#/m);
  assert.equal(quoteMenuChoice('1', { cotizacion: q, respuesta: text }), 1);
  assert.equal(quoteMenuChoice('2.', { cotizacion: q, respuesta: text }), 2);
  assert.equal(quoteMenuChoice('3', { cotizacion: q, respuesta: text }), 3);
  assert.equal(quoteMenuChoice('1', { cotizacion: q, respuesta: quoteWhatsApp(q, false) }), null);
  assert.equal(quoteMenuChoice('1', { respuesta: text }), null);
  assert.equal(quoteMenuChoice('1', { cotizacion: q, respuesta: '¿Qué cantidad?' }), null);
  assert.equal(quoteMenuChoice('1 saco', { cotizacion: q, respuesta: text }), null);
});

test('la presentación convierte el Markdown web y conserva enlaces completos y montos', () => {
  const text = whatsappCard('Consulta de obra', '## Obras activas\n\n**Radier**\n- Monto: $1.200.000\n[Ver ficha](https://www.easy.cl/material-test/p)');
  assert.match(text, /\*Obras activas\*/);
  assert.match(text, /\*Radier\*/);
  assert.match(text, /• Monto: \$1.200.000/);
  assert.ok(text.endsWith('Ver ficha\nhttps://www.easy.cl/material-test/p'));
  assert.doesNotMatch(text, /\*\*|##|\]\(/);
});

test('el comparador muestra precio, presentación, enlaces y disponibilidad reales sin prometer un mínimo global', () => {
  const text = materialComparisonWhatsApp({ consulta: { producto: 'Cemento', ubicacion: 'Maipú' }, consultado_en: '2026-11-02T12:00:00Z',
    resumen: 'Opciones publicadas.', ofertas: [{ id: 'easy-1', tienda: 'Easy', nombre: 'Cemento 25 kg', precio: 4990, unidad: 'saco', total_solicitado: 99800, url: 'https://www.easy.cl/cemento-25/p' }],
    mejores_ids: [], proveedores: [{ nombre: 'Easy', estado: 'consultado' }, { nombre: 'Imperial', estado: 'no_disponible' }],
  });
  assert.doesNotMatch(text, /🟧|ObraTrack\*/);
  assert.match(text, /\*\$4.990\*/);
  assert.match(text, /Unidad de venta: saco/);
  assert.match(text, /Imperial: no disponible/);
  assert.match(text, /Precios publicados en CLP; confirma IVA/);
  assert.ok(text.includes('https://www.easy.cl/cemento-25/p'));
  assert.doesNotMatch(text, /Menor precio/);
});

test('una respuesta extensa conserva cada partida y enlace, con continuaciones bajo el límite de Meta', () => {
  const records = Array.from({ length: 90 }, (_, i) => `• Partida ${i}: ${'Hormigón 🏗️ '.repeat(4)}\nTotal: $123.456\nhttps://www.easy.cl/material-${i}/p`);
  const text = whatsappCard('Cotización', records.join('\n\n'));
  const chunks = splitWhatsAppMessage(text);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(c => c.length <= 4000));
  for (const row of records) assert.ok(chunks.some(c => c.includes(row)), 'No se cortó la partida ni su enlace');
  const restored = chunks.map((c, i) => i === 0 ? c : c.replace(/^_Continuación \d+\/\d+_\n\n/, '')).join('\n\n');
  assert.equal(restored, text);
});
