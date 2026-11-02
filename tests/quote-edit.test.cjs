require('./helpers/typescript.cjs');
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { NextRequest, NextResponse } = require('next/server');
const fixture = require('./helpers/supabase.cjs');
const { normalizeQuote } = require('../lib/ai/protocol.ts');
const { reviseQuote } = require('../lib/quotes/revise.ts');
const { aiErrorResponse } = require('../lib/ai/errors.ts');
let role = 'admin';
require.cache[require.resolve('../lib/ai/server.ts')] = {
  id: require.resolve('../lib/ai/server.ts'), loaded: true,
  exports: {
    authorizeAI: async () => ({ client: fixture.supabase, user: { id: 'owner', empresa_id: 'company-a', rol: role } }),
    errorJSON: (e) => { const err = aiErrorResponse(e); return NextResponse.json({ error: err.error, code: err.code }, { status: err.status }); },
  },
};
const { PATCH, GET } = require('../app/api/presupuestos/route.ts');
let original;
beforeEach(() => {
  role = 'admin';
  original = normalizeQuote({ titulo_proyecto: 'Radier', materiales: [{ nombre: 'Cemento', cantidad: 2, unidad: 'saco', precio_unitario_estimado: 5000 }], mano_de_obra: [] });
  original.fecha_creacion = '2026-10-29T12:00:00Z';
  fixture.tables.set('presupuestos', [{ id: original.id, empresa_id: 'company-a', estado: 'aprobada', origen: 'whatsapp', proyecto_id: 'obra', creado_por: 'owner', cotizacion: original, updated_at: '2026-11-02T12:00:00Z' }]);
});
afterEach(() => fixture.reset());
const req = (changes) => new NextRequest('http://localhost/api/presupuestos', { method: 'PATCH', body: JSON.stringify({ id: original.id, updated_at: '2026-11-02T12:00:00Z', cotizacion: original, ...changes }) });
test('la consulta individual devuelve solo el presupuesto de la empresa autenticada', async () => {
  fixture.tables.get('presupuestos').push({ id: 'other-budget', empresa_id: 'company-b', cotizacion: original });
  const response = await GET(new NextRequest('http://localhost/api/presupuestos?id=' + encodeURIComponent(original.id)));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.presupuestos.length, 1);
  assert.equal(body.presupuestos[0].empresa_id, 'company-a');
});
test('un presupuesto de WhatsApp conserva sus IDs de registro y documento al consultarlo y editarlo', async () => {
  const row = fixture.tables.get('presupuestos')[0];
  row.id = 'wa:wamid-test';
  const get = await GET(new NextRequest('http://localhost/api/presupuestos?id=' + encodeURIComponent(original.id)));
  assert.equal((await get.json()).presupuestos[0].id, row.id);
  const patch = await PATCH(req({ id: row.id, cotizacion: { ...original, cliente_nombre: 'Nombre actualizado' } }));
  assert.equal(patch.status, 200);
  const saved = (await patch.json()).presupuesto;
  assert.equal(saved.id, 'wa:wamid-test');
  assert.equal(saved.cotizacion.id, original.id);
});
test('la edición conserva ID, fecha, estado, origen y obra; ignora totales enviados y recalcula IVA', async () => {
  const draft = structuredClone(original);
  draft.materiales[0].cantidad = 3; draft.materiales[0].precio_unitario_estimado = 6000;
  draft.estructura_financiera.precio_total_con_iva = 1;
  draft.cliente_email = 'cliente@example.test'; draft.fecha_validez = '2026-11-30';
  const response = await PATCH(req({ cotizacion: draft, empresa_id: 'forged-company', origen: 'plataforma' }));
  assert.equal(response.status, 200);
  const { presupuesto: row } = await response.json();
  assert.equal(row.id, original.id); assert.equal(row.cotizacion.id, original.id);
  assert.equal(row.cotizacion.fecha_creacion, original.fecha_creacion);
  assert.equal(row.estado, 'aprobada'); assert.equal(row.origen, 'whatsapp'); assert.equal(row.proyecto_id, 'obra');
  assert.equal(row.empresa_id, 'company-a'); assert.equal(row.cotizacion.estructura_financiera.costo_materiales_total, 18000);
  assert.notEqual(row.cotizacion.estructura_financiera.precio_total_con_iva, 1);
  assert.equal(row.cotizacion.cliente_email, 'cliente@example.test');
  assert.equal(fixture.tables.get('presupuestos').length, 1);
});
test('un conflicto de versión impide sobrescribir los cambios del otro dispositivo', async () => {
  const response = await PATCH(req({ updated_at: '2026-10-29T12:00:00Z' }));
  assert.equal(response.status, 409);
  assert.deepEqual(fixture.tables.get('presupuestos')[0].cotizacion, original);
});
test('se puede quitar una fecha de validez ya guardada y el cambio sobrevive al envío JSON', async () => {
  original.fecha_validez = '2026-11-30';
  const draft = reviseQuote(original, { ...original, fecha_validez: '' });
  const response = await PATCH(req({ cotizacion: JSON.parse(JSON.stringify(draft)) }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).presupuesto.cotizacion.fecha_validez, '');
});
test('la edición no permite modificar presupuestos de otra empresa ni acceder con perfil de terreno', async () => {
  fixture.tables.get('presupuestos')[0].empresa_id = 'company-b';
  assert.equal((await PATCH(req({}))).status, 403);
  role = 'terreno'; assert.equal((await PATCH(req({}))).status, 403);
});
test('rechaza cantidades inválidas, correo incorrecto y margen sobre venta imposible sin guardar', async () => {
  const draft = structuredClone(original); draft.materiales[0].cantidad = -1;
  assert.equal((await PATCH(req({ cotizacion: draft }))).status, 422);
  assert.throws(() => reviseQuote(original, { ...original, cliente_email: 'correo inválido' }));
  assert.throws(() => reviseQuote(original, { ...original, estructura_financiera: { ...original.estructura_financiera, tipo_utilidad: 'margen_venta', margen_utilidad_porcentaje: 100 } }));
  assert.deepEqual(fixture.tables.get('presupuestos')[0].cotizacion, original);
});
