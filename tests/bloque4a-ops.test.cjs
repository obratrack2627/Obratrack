require('./helpers/typescript.cjs');
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const fixture = require('./helpers/supabase.cjs');

require.cache[require.resolve('../lib/supabase/client.ts')] = {
  id: require.resolve('../lib/supabase/client.ts'),
  filename: require.resolve('../lib/supabase/client.ts'),
  loaded: true,
  exports: fixture,
};
require('./helpers/browser.cjs')();

const { calcularEstadoPago } = require('../lib/edp-calculator.ts');
const { buildQuoteDocument } = require('../lib/quotes/document.ts');
const { normalizeQuote } = require('../lib/ai/protocol.ts');
const { sodimacProducts } = require('../lib/materials/retail.ts');
const { safeOfferURL } = require('../lib/materials/types.ts');
const { convertirPresupuestoEnObra } = require('../lib/presupuestos-to-obra.ts');
const { isolatedState } = require('../lib/whatsapp/state.ts');
const { processOutbox } = require('../lib/whatsapp/outbox.ts');
const { AIError } = require('../lib/ai/errors.ts');
const server = require('../lib/ai/server.ts');

afterEach(() => {
  fixture.reset();
});

test('Bloque 4A: calcularEstadoPago descuenta retenciones previas y soporta órdenes de cambio deductivas', () => {
  const edp2 = calcularEstadoPago({
    proyecto: {
      id: 'p-1',
      nombre: 'Casa Sur',
      monto_cotizado: 1000000,
      porcentaje_avance_ponderado: 100,
    },
    pagos: [
      {
        id: 'pay-1',
        proyecto_id: 'p-1',
        monto: 450000,
        estado: 'completado',
        nota: 'EDP-001 (50% avance) · Retención 10% ($50.000)',
      },
    ],
    cambios: [
      {
        id: 'c-1',
        proyecto_id: 'p-1',
        tipo: 'solicitud_cambio',
        estado: 'aprobado',
        ajuste_presupuesto_aplicado: true,
        impacto_monto: 200000,
      },
      {
        id: 'c-2',
        proyecto_id: 'p-1',
        tipo: 'solicitud_cambio',
        estado: 'aprobado',
        ajuste_presupuesto_aplicado: true,
        impacto_monto: -80000,
      },
    ],
    retencionPorcentaje: 10,
  });

  assert.equal(edp2.totalPagadoAnterior, 450000);
  assert.equal(edp2.totalRetenidoAnterior, 50000);
  assert.equal(edp2.cobroSugeridoSegunAvance, 500000);
  assert.equal(edp2.retencionMonto, 50000);
  assert.equal(edp2.liquidoAPagarConIva, 450000);
  assert.equal(edp2.adicionalesAprobadosCantidad, 2);
  assert.equal(edp2.adicionalesAprobadosMonto, 120000);
});

test('Bloque 4A: buildQuoteDocument marca ivaIncluidoEnPartidas cuando modo precio_acordado usa IVA incluido', () => {
  const qIncluido = normalizeQuote({
    titulo_proyecto: 'Terraza',
    modo_presupuesto: 'precio_acordado',
    tratamiento_iva: 'incluido',
    partidas_venta: [{ nombre: 'Terraza completa', unidad: 'gl', cantidad: 1, precio_unitario: 119000 }],
    materiales: [],
    mano_de_obra: [],
  });
  const docIncluido = buildQuoteDocument(qIncluido);
  assert.equal(docIncluido.ivaIncluidoEnPartidas, true);
  assert.equal(docIncluido.total, 119000);
  assert.equal(docIncluido.subtotal + docIncluido.iva, 119000);

  const qNeto = normalizeQuote({
    titulo_proyecto: 'Terraza Neta',
    modo_presupuesto: 'precio_acordado',
    tratamiento_iva: 'neto',
    partidas_venta: [{ nombre: 'Terraza completa', unidad: 'gl', cantidad: 1, precio_unitario: 100000 }],
    materiales: [],
    mano_de_obra: [],
  });
  assert.equal(buildQuoteDocument(qNeto).ivaIncluidoEnPartidas, false);
});

test('Bloque 4A: sodimacProducts y safeOfferURL soportan URLs de sodimac.falabella.com/sodimac-cl/product/...', () => {
  const html =
    '<script id="__NEXT_DATA__" type="application/json">' +
    JSON.stringify({
      props: {
        pageProps: {
          results: [
            {
              displayName: 'Cemento Polpaico Especial 25 kg',
              brand: 'Polpaico',
              skuId: '110023456',
              url: 'https://sodimac.falabella.com/sodimac-cl/product/110023456/Cemento-Polpaico-Especial-25-kg/110023456',
              sellerId: 'SODIMAC_CHILE',
              prices: [{ type: 'internetPrice', price: ['4.890'], crossed: false }],
            },
          ],
        },
      },
    }) +
    '</script>';

  const items = sodimacProducts(html);
  assert.equal(items.length, 1);
  assert.equal(
    items[0].link,
    'https://www.sodimac.cl/sodimac-cl/articulo/110023456/Cemento-Polpaico-Especial-25-kg',
  );
  assert.ok(safeOfferURL(items[0].link));
  assert.ok(
    safeOfferURL(
      'https://sodimac.falabella.com/sodimac-cl/product/110023456/Cemento-Polpaico-Especial-25-kg',
    ),
  );
});

test('Bloque 4A: convertirPresupuestoEnObra respeta días laborales al cruzar fin de semana', () => {
  const owner = { id: 'u1', empresa_id: 'emp-1', rol: 'admin', nombre: 'Admin' };
  const s = isolatedState(owner, { usuarios: [owner] }, 'pro_ia');
  const q = normalizeQuote({
    titulo_proyecto: 'Radier Viernes',
    duracion_dias_estimada: 2,
    materiales: [{ nombre: 'Cemento', cantidad: 1, precio_unitario_estimado: 5000 }],
    mano_de_obra: [],
  });
  // Viernes 2026-11-06 + 2 días hábiles (Lun-Vie) => Martes 2026-11-10
  const result = s.runLocalAI(() =>
    convertirPresupuestoEnObra(q, { service: s, fechaInicio: '2026-11-06' }),
  );
  assert.equal(result.proyecto.fecha_termino_estimada, '2026-11-10');
});

test('Bloque 4A: /aprobar retorna 400 ante JSON malformado en vez de 500', async () => {
  server.authorizeAI = async () => ({
    client: fixture.supabase,
    user: { id: 'u1', empresa_id: 'emp-1', rol: 'admin', nombre: 'Admin' },
  });
  const route = require('../app/api/proyectos/[id]/cambios/[cambio]/aprobar/route.ts');
  const res = await route.POST(
    new NextRequest('https://example.test/api/proyectos/p1/cambios/c1/aprobar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{invalid-json',
    }),
    { params: Promise.resolve({ id: 'p1', cambio: 'c1' }) },
  );
  assert.equal(res.status, 400);
});

test('Bloque 4A: outbox reintenta ante fallo transitorio 503 al consultar plantilla en vez de marcar fallido permanente', async () => {
  const job = {
    id: '22222222-2222-4222-a222-222222222222',
    aviso_id: 'camp-1',
    empresa_id: 'emp-1',
    destinatario_id: 'u-1',
    nombre: 'Maestro',
    telefono: '56912345679',
    intentos: 1,
    reintentos: 0,
    forzar_plantilla: true,
    estado: 'procesando',
  };
  fixture.tables.set('whatsapp_avisos', [{ id: 'camp-1', empresa_id: 'emp-1', mensaje: 'Hola' }]);
  fixture.tables.set('empresas', [{ id: 'emp-1', nombre: 'Constructora' }]);
  fixture.tables.set('usuarios', [{ id: 'u-1', empresa_id: 'emp-1', telefono_whatsapp: '+56912345679' }]);
  fixture.tables.set('whatsapp_envios', [{ ...job }]);
  fixture.handleRPC('reservar_envios_whatsapp', async () => ({ data: [{ ...job }], error: null }));

  await processOutbox(fixture.supabase, {
    send: async () => 'wamid-never',
    template: async () => {
      throw new AIError('META_TEMPLATE_DOWN', 'Meta no responde', 503);
    },
  });

  const saved = fixture.tables.get('whatsapp_envios')[0];
  assert.equal(saved.estado, 'pendiente');
  assert.equal(saved.reintentos, 1);
});

test('Bloque 4A: DELETE /api/whatsapp/avisos valida rol, empresa y elimina aviso propio', async () => {
  const avisoOwnId = '11111111-1111-4111-a111-111111111111';
  const avisoOtherId = '22222222-2222-4222-a222-222222222222';
  fixture.tables.set('whatsapp_avisos', [
    { id: avisoOwnId, empresa_id: 'emp-1', actor_id: 'u1', mensaje: 'Reunión mañana' },
    { id: avisoOtherId, empresa_id: 'emp-2', actor_id: 'u2', mensaje: 'Ajeno' },
  ]);

  let role = 'terreno';
  server.authorizeAI = async () => ({
    client: fixture.supabase,
    user: { id: 'u1', empresa_id: 'emp-1', rol: role, nombre: 'Usuario' },
  });

  const avisosRoute = require('../app/api/whatsapp/avisos/route.ts');

  const denied = await avisosRoute.DELETE(
    new NextRequest(`https://example.test/api/whatsapp/avisos?id=${avisoOwnId}`, { method: 'DELETE' }),
  );
  assert.equal(denied.status, 403);

  role = 'admin';
  const badId = await avisosRoute.DELETE(
    new NextRequest('https://example.test/api/whatsapp/avisos?id=invalid-id', { method: 'DELETE' }),
  );
  assert.equal(badId.status, 400);

  const foreign = await avisosRoute.DELETE(
    new NextRequest(`https://example.test/api/whatsapp/avisos?id=${avisoOtherId}`, { method: 'DELETE' }),
  );
  assert.equal(foreign.status, 404);

  const ok = await avisosRoute.DELETE(
    new NextRequest(`https://example.test/api/whatsapp/avisos?id=${avisoOwnId}`, { method: 'DELETE' }),
  );
  assert.equal(ok.status, 200);
  const remaining = fixture.tables.get('whatsapp_avisos') || [];
  assert.deepEqual(remaining.map((r) => r.id), [avisoOtherId]);
});
