require("./helpers/typescript.cjs");
const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { NextRequest } = require("next/server");
const fixture = require("./helpers/supabase.cjs");
require.cache[require.resolve("../lib/supabase/client.ts")] = {
  id: require.resolve("../lib/supabase/client.ts"),
  filename: require.resolve("../lib/supabase/client.ts"),
  loaded: true,
  exports: fixture,
};
const { createChatHandler, authorizeAI } = require("../lib/ai/server.ts");
const { AIError } = require("../lib/ai/errors.ts");
const response = {
  respuesta: "Puedo preparar el presupuesto.",
  accion: null,
  sugerencias: [],
  cotizacion: null,
};
const makeRequest = (body) =>
  new NextRequest("http://localhost/api/cotizador/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const authorized = async () => ({
  client: fixture.supabase,
  user: { id: "u", empresa_id: "company-a", rol: "admin" },
});
afterEach(() => fixture.reset());
test("una cookie inventada no autoriza solicitudes a Gemini", async () => {
  const req = new NextRequest("http://localhost/api/cotizador/chat", {
    method: "POST",
    headers: { cookie: "obratrack_auth_token=inventado" },
    body: "{}",
  });
  await assert.rejects(
    authorizeAI(req),
    (e) => e.code === "AUTH_REQUIRED" && e.status === 401,
  );
});
test("la ruta devuelve la cotización real y no duplica el mensaje actual en el historial", async () => {
  let called = 0;
  const handler = createChatHandler({
    authorize: authorized,
    global: async (history, message, context) => {
      called++;
      assert.equal(message, "Cotiza una terraza");
      assert.equal(history.length, 1);
      assert.equal(history[0].rol, "model");
      assert.equal(context.cotizacion_actual, null);
      return response;
    },
    project: async () => response,
  });
  const res = await handler(
    makeRequest({
      mensaje: "Cotiza una terraza",
      historial: [{ remitente: "agente", texto: "¿Qué necesitas?" }],
    }),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), response);
  assert.equal(called, 1);
});
test("errores de configuración y cuota mantienen su código y no aparentan éxito", async () => {
  for (const [code, status] of [
    ["AI_NOT_CONFIGURED", 503],
    ["AI_RATE_LIMIT", 429],
  ]) {
    const handler = createChatHandler({
      authorize: authorized,
      global: async () => {
        throw new AIError(code, "Configuración necesaria", status);
      },
      project: async () => response,
    });
    const res = await handler(makeRequest({ mensaje: "Hola" }));
    assert.equal(res.status, status);
    const body = await res.json();
    assert.equal(body.code, code);
    assert.equal(body.respuesta, undefined);
  }
});
test("JSON malformado y mensaje vacío se rechazan sin llamar al modelo", async () => {
  let calls = 0;
  const handler = createChatHandler({
    authorize: authorized,
    global: async () => {
      calls++;
      return response;
    },
    project: async () => response,
  });
  assert.equal((await handler(makeRequest("{"))).status, 400);
  assert.equal((await handler(makeRequest({ mensaje: " " }))).status, 400);
  assert.equal(calls, 0);
});
test("el chat por obra comprueba pertenencia en la base y descarta el contexto de otra empresa", async () => {
  fixture.tables.set("proyectos", [
    { id: "p-a", nombre: "Obra A", empresa_id: "company-a" },
    { id: "p-b", nombre: "Obra B", empresa_id: "company-b" },
  ]);
  let calls = 0;
  const handler = createChatHandler({
    authorize: authorized,
    global: async () => response,
    project: async ({ contextoProyecto }) => {
      calls++;
      assert.equal(contextoProyecto.empresa_id, "company-a");
      assert.equal(contextoProyecto.nombre, "Obra A");
      return response;
    },
  });
  const denied = await handler(
    makeRequest({
      mensaje: "Saldo",
      contexto_proyecto: { empresa_id: "company-a" },
    }),
    "p-b",
  );
  assert.equal(denied.status, 403);
  assert.equal(calls, 0);
  const allowed = await handler(
    makeRequest({
      mensaje: "Saldo",
      contexto_proyecto: {
        empresa_id: "company-b",
        nombre: "Datos inventados",
      },
    }),
    "p-a",
  );
  assert.equal(allowed.status, 200);
  assert.equal(calls, 1);
});

test("Next puede pasar el contexto de ruta al chat general sin convertirlo en un ID de obra", async () => {
  const server = require("../lib/ai/server.ts");
  const original = server.createChatHandler;
  let called = false;
  server.createChatHandler = () =>
    original({
      authorize: authorized,
      global: async () => {
        called = true;
        return response;
      },
      project: async () => {
        throw Error("El chat general no es por obra");
      },
    });
  try {
    const { POST } = require("../app/api/cotizador/chat/route.ts");
    const res = await POST(makeRequest({ mensaje: "Hola" }), { params: {} });
    assert.equal(res.status, 200);
    assert.equal(called, true);
  } finally {
    server.createChatHandler = original;
    delete require.cache[require.resolve("../app/api/cotizador/chat/route.ts")];
  }
});

test("el contexto global usa registros actuales de la empresa, incluso si el navegador envía otros", async () => {
  fixture.tables.set("proyectos", [
    {
      id: "p-a",
      empresa_id: "company-a",
      nombre: "Obra actual",
      monto_cotizado: 500,
    },
    { id: "p-b", empresa_id: "company-b", nombre: "Ajena" },
  ]);
  const handler = createChatHandler({
    authorize: authorized,
    global: async (_, __, context) => {
      assert.equal(context.proyectos.length, 1);
      assert.equal(context.proyectos[0].nombre, "Obra actual");
      return response;
    },
    project: async () => response,
  });
  assert.equal(
    (
      await handler(
        makeRequest({
          mensaje: "Mis obras",
          contexto_db: { proyectos: [{ id: "inventada" }] },
        }),
      )
    ).status,
    200,
  );
});

test("la cotización del copiloto se guarda en la nube y un fallo de guardado no aparenta éxito", async () => {
  const { normalizeQuote } = require("../lib/ai/protocol.ts");
  const cotizacion = normalizeQuote({
    titulo_proyecto: "Radier real",
    materiales: [
      { nombre: "Cemento", cantidad: 2, precio_unitario_estimado: 5000 },
    ],
    mano_de_obra: [],
  });
  const handler = createChatHandler({
    authorize: authorized,
    global: async () => ({ ...response, cotizacion }),
    project: async () => response,
  });
  assert.equal(
    (await handler(makeRequest({ mensaje: "Cotiza un radier" }))).status,
    200,
  );
  const rows = fixture.tables.get("presupuestos");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].empresa_id, "company-a");
  assert.equal(rows[0].cotizacion.id, cotizacion.id);
  fixture.fail("presupuestos");
  const failed = await handler(makeRequest({ mensaje: "Cotiza otro" }));
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).code, "BUDGET_SAVE");
});

test("un fallo de lectura no inventa un inventario vacío", async () => {
  fixture.fail("proyectos");
  let called = false;
  const handler = createChatHandler({
    authorize: authorized,
    global: async () => {
      called = true;
      return response;
    },
    project: async () => response,
  });
  assert.equal(
    (await handler(makeRequest({ mensaje: "Mis obras" }))).status,
    503,
  );
  assert.equal(called, false);
});

test("el copiloto web respeta los mismos permisos de terreno que WhatsApp", async () => {
  const handler = createChatHandler({
    authorize: async () => ({
      client: fixture.supabase,
      user: {
        id: "worker",
        nombre: "Trabajador",
        empresa_id: "company-a",
        rol: "terreno",
      },
    }),
    global: async () => ({
      ...response,
      accion: { tipo: "registrar_pago", proyecto_id: "p1", monto: 1000 },
    }),
    project: async () => response,
  });
  const res = await handler(makeRequest({ mensaje: "Registra pago" }));
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, "ACTION_FORBIDDEN");
});
