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
const { createChatHandler, authorizeAI } = require('../lib/ai/server.ts');
const { AIError } = require('../lib/ai/errors.ts');
const response = {
  respuesta: 'Puedo preparar el presupuesto.',
  accion: null,
  sugerencias: [],
  cotizacion: null,
};
const makeRequest = (body) =>
  new NextRequest('http://localhost/api/cotizador/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const authorized = async () => ({
  client: fixture.supabase,
  user: { id: 'u', empresa_id: 'company-a', rol: 'admin' },
});
afterEach(() => fixture.reset());
test('una cookie inventada no autoriza solicitudes a Gemini', async () => {
  const req = new NextRequest('http://localhost/api/cotizador/chat', {
    method: 'POST',
    headers: { cookie: 'obratrack_auth_token=inventado' },
    body: '{}',
  });
  await assert.rejects(
    authorizeAI(req),
    (e) => e.code === 'AUTH_REQUIRED' && e.status === 401,
  );
});
test('la ruta devuelve la cotización real y no duplica el mensaje actual en el historial', async () => {
  let called = 0;
  const handler = createChatHandler({
    authorize: authorized,
    global: async (history, message, context) => {
      called++;
      assert.equal(message, 'Cotiza una terraza');
      assert.equal(history.length, 1);
      assert.equal(history[0].rol, 'model');
      assert.equal(context.cotizacion_actual, null);
      return response;
    },
    project: async () => response,
  });
  const res = await handler(
    makeRequest({
      mensaje: 'Cotiza una terraza',
      historial: [{ remitente: 'agente', texto: '¿Qué necesitas?' }],
    }),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), response);
  assert.equal(called, 1);
});
test('errores de configuración y cuota mantienen su código y no aparentan éxito', async () => {
  for (const [code, status] of [
    ['AI_NOT_CONFIGURED', 503],
    ['AI_RATE_LIMIT', 429],
  ]) {
    const handler = createChatHandler({
      authorize: authorized,
      global: async () => {
        throw new AIError(code, 'Configuración necesaria', status);
      },
      project: async () => response,
    });
    const res = await handler(makeRequest({ mensaje: 'Hola' }));
    assert.equal(res.status, status);
    const body = await res.json();
    assert.equal(body.code, code);
    assert.equal(body.respuesta, undefined);
  }
});
test('JSON malformado y mensaje vacío se rechazan sin llamar al modelo', async () => {
  let calls = 0;
  const handler = createChatHandler({
    authorize: authorized,
    global: async () => {
      calls++;
      return response;
    },
    project: async () => response,
  });
  assert.equal((await handler(makeRequest('{'))).status, 400);
  assert.equal((await handler(makeRequest({ mensaje: ' ' }))).status, 400);
  assert.equal(calls, 0);
});
test('el chat por obra comprueba pertenencia en la base y descarta el contexto de otra empresa', async () => {
  fixture.tables.set('proyectos', [
    { id: 'p-a', nombre: 'Obra A', empresa_id: 'company-a' },
    { id: 'p-b', nombre: 'Obra B', empresa_id: 'company-b' },
  ]);
  let calls = 0;
  const handler = createChatHandler({
    authorize: authorized,
    global: async () => response,
    project: async ({ contextoProyecto }) => {
      calls++;
      assert.equal(contextoProyecto.empresa_id, 'company-a');
      assert.equal(contextoProyecto.nombre, 'Obra A');
      return response;
    },
  });
  const denied = await handler(
    makeRequest({
      mensaje: 'Saldo',
      contexto_proyecto: { empresa_id: 'company-a' },
    }),
    'p-b',
  );
  assert.equal(denied.status, 403);
  assert.equal(calls, 0);
  const allowed = await handler(
    makeRequest({
      mensaje: 'Saldo',
      contexto_proyecto: {
        empresa_id: 'company-b',
        nombre: 'Datos inventados',
      },
    }),
    'p-a',
  );
  assert.equal(allowed.status, 200);
  assert.equal(calls, 1);
});
