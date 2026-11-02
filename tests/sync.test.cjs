require("./helpers/typescript.cjs");
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { NextRequest } = require("next/server");
const fixture = require("./helpers/supabase.cjs");
require.cache[require.resolve("../lib/supabase/client.ts")] = {
  id: require.resolve("../lib/supabase/client.ts"),
  filename: require.resolve("../lib/supabase/client.ts"),
  loaded: true,
  exports: fixture,
};
require("./helpers/browser.cjs")();
const { dataService } = require("../lib/data-service.ts");
const server = require("../lib/ai/server.ts");
let user;
server.authorizeAI = async () => ({ client: fixture.supabase, user });
const { GET, POST } = require("../app/api/supabase/sync/route.ts");
const originalFetch = global.fetch;
const p1 = {
  id: "p1",
  empresa_id: "a",
  nombre: "Obra A",
  monto_cotizado: 100000,
  fecha_inicio: "2026-10-29",
  fecha_termino_estimada: "2026-11-10",
  estado: "activo",
};
const request = (body) =>
  new NextRequest("https://example.test/api/supabase/sync", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  fixture.reset();
  localStorage.clear();
  user = {
    id: "u",
    empresa_id: "a",
    nombre: "Admin",
    rol: "admin",
    auth_user_id: "u",
  };
  localStorage.setItem("obratrack_active_user_v7", JSON.stringify(user));
  localStorage.setItem("obratrack_usuarios_v7_a", JSON.stringify([user]));
  localStorage.setItem("obratrack_active_plan_v7_a", JSON.stringify("pro_ia"));
  fixture.tables.set("usuarios", [user]);
  fixture.tables.set("empresas", [{ id: "a", plan_id: "pro_ia" }]);
  fixture.tables.set("proyectos", [p1]);
});
afterEach(() => {
  dataService.runLocalAI(() => {});
  global.fetch = originalFetch;
});
test("la sincronización de un pago conserva avances recibidos y el plan contratado", async () => {
  fixture.tables.set("bitacora_entradas", [
    { id: "wa-photo", proyecto_id: "p1", nota: "Avance recibido por WhatsApp" },
  ]);
  fixture.tables.set("empresas", [{ id: "a", plan_id: "gratis" }]);
  const res = await POST(
    request({
      empresaId: "b",
      cambios: {
        pagos: [
          {
            id: "pay1",
            proyecto_id: "p1",
            monto: 10000,
            fecha: "2026-10-29",
            estado: "completado",
          },
        ],
      },
    }),
  );
  assert.equal(res.status, 200);
  assert.equal(fixture.tables.get("pagos").length, 1);
  assert.equal(
    fixture.tables.get("bitacora_entradas")[0].nota,
    "Avance recibido por WhatsApp",
  );
  assert.equal(fixture.tables.get("empresas")[0].plan_id, "gratis");
});
test("la sesión decide la empresa; un snapshot antiguo, obra ajena o escalada de rol se rechazan", async () => {
  fixture.tables.set("proyectos", [p1, { ...p1, id: "pb", empresa_id: "b" }]);
  const read = await (
    await GET(
      new NextRequest("https://example.test/api/supabase/sync?empresaId=b"),
    )
  ).json();
  assert.equal(read.empresaId, "a");
  assert.deepEqual(
    read.proyectos.map((p) => p.id),
    ["p1"],
  );
  assert.equal((await POST(request({ proyectos: [p1] }))).status, 409);
  assert.equal(
    (
      await POST(
        request({
          cambios: { pagos: [{ id: "bad", proyecto_id: "pb", monto: 10 }] },
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await POST(
        request({ cambios: { usuarios: [{ ...user, rol: "supervisor" }] } }),
      )
    ).status,
    403,
  );
  assert.ok(!fixture.calls.some((c) => c.mode === "upsert"));
});
test("un fallo de escritura nunca confirma la sincronización", async () => {
  fixture.fail("pagos", 1, "upsert");
  const res = await POST(
    request({
      cambios: { pagos: [{ id: "pay1", proyecto_id: "p1", monto: 1000 }] },
    }),
  );
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, "SYNC_SAVE");
});
test("el navegador envía solo la obra editada, sin reenviar otra obra antigua", async () => {
  localStorage.setItem(
    "obratrack_proyectos_v7_a",
    JSON.stringify([
      p1,
      { ...p1, id: "p2", nombre: "Obra antigua en otra pestaña" },
    ]),
  );
  dataService.updateProyecto("p1", { nombre: "Obra actualizada" });
  let sent;
  global.fetch = async (url, options) => {
    assert.match(options.headers.Authorization, /^Bearer /);
    sent = JSON.parse(options.body);
    return new Response("{}", { status: 200 });
  };
  assert.equal((await dataService.pushToCloudServer()).success, true);
  assert.deepEqual(
    sent.cambios.proyectos.map((p) => p.id),
    ["p1"],
  );
  assert.equal(sent.cambios.proyectos[0].nombre, "Obra actualizada");
  assert.equal(
    Object.keys(
      JSON.parse(localStorage.getItem("obratrack_dirty_v1_a")).proyectos,
    ).length,
    0,
  );
});
test("leer una base vacía elimina la caché antigua y no resucita obras eliminadas", async () => {
  localStorage.setItem("obratrack_proyectos_v7_a", JSON.stringify([p1]));
  let posts = 0;
  global.fetch = async (url, options) => {
    if (options.method === "POST") posts++;
    return new Response(
      JSON.stringify({
        empresaId: "a",
        proyectos: [],
        usuarios: [user],
        clientes: [],
        actividades: [],
        pagos: [],
        materiales: [],
        bitacora: [],
        imprevistos: [],
        reclamos_cambios: [],
        documentos: [],
        asistencias: [],
        reportes_whatsapp: [],
        plan_id: "pro_ia",
      }),
      { status: 200 },
    );
  };
  assert.equal((await dataService.pullFromCloudServer()).success, true);
  assert.equal(dataService.getProyectos().length, 0);
  assert.equal(posts, 0);
});

test("actualizar la caché incorpora las tres obras y conserva solamente las ediciones locales pendientes", async () => {
  localStorage.setItem(
    "obratrack_proyectos_v7_a",
    JSON.stringify([
      { ...p1, nombre: "Cambio local pendiente" },
      { ...p1, id: "old" },
    ]),
  );
  localStorage.setItem(
    "obratrack_dirty_v1_a",
    JSON.stringify({
      proyectos: { p1: { ...p1, nombre: "Cambio local pendiente" } },
    }),
  );
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        empresaId: "a",
        proyectos: [p1, { ...p1, id: "p2" }, { ...p1, id: "p3" }],
      }),
    );
  assert.equal((await dataService.pullFromCloudServer()).success, true);
  assert.deepEqual(
    dataService
      .getProyectos()
      .map((p) => p.id)
      .sort(),
    ["p1", "p2", "p3"],
  );
  assert.equal(
    dataService.getProyectoById("p1").nombre,
    "Cambio local pendiente",
  );
  assert.ok(
    JSON.parse(localStorage.getItem("obratrack_dirty_v1_a")).proyectos.p1,
  );
});

test("lecturas simultáneas comparten la petición y una respuesta de otra sesión no contamina la caché", async () => {
  let release;
  let requests = 0;
  global.fetch = async () => {
    requests++;
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const first = dataService.pullFromCloudServer();
  const second = dataService.pullFromCloudServer();
  await new Promise(setImmediate);
  assert.equal(requests, 1);
  localStorage.setItem(
    "obratrack_active_user_v7",
    JSON.stringify({ ...user, id: "another", empresa_id: "b" }),
  );
  release(new Response(JSON.stringify({ empresaId: "a", proyectos: [p1] })));
  assert.equal((await first).success, false);
  assert.equal((await second).success, false);
  assert.equal(localStorage.getItem("obratrack_proyectos_v7_b"), null);
  assert.equal(localStorage.getItem("obratrack_proyectos_v7_a"), null);
});

test("un fallo de red conserva las obras locales y permite recuperar las tres en el siguiente intento", async () => {
  localStorage.setItem("obratrack_proyectos_v7_a", JSON.stringify([p1]));
  global.fetch = async () => {
    throw Error("offline");
  };
  assert.equal((await dataService.pullFromCloudServer()).success, false);
  assert.equal(dataService.getProyectos().length, 1);
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        empresaId: "a",
        proyectos: [p1, { ...p1, id: "p2" }, { ...p1, id: "p3" }],
      }),
    );
  assert.equal((await dataService.pullFromCloudServer()).success, true);
  assert.equal(dataService.getProyectos().length, 3);
});

test("una lectura que responde con otra empresa no reemplaza los datos de la cuenta activa", async () => {
  localStorage.setItem("obratrack_proyectos_v7_a", JSON.stringify([p1]));
  global.fetch = async () =>
    new Response(JSON.stringify({ empresaId: "b", proyectos: [] }));
  assert.equal((await dataService.pullFromCloudServer()).success, false);
  assert.equal(dataService.getProyectos().length, 1);
});

test("subidas simultáneas no reenvían dos veces los mismos cambios pendientes", async () => {
  localStorage.setItem(
    "obratrack_dirty_v1_a",
    JSON.stringify({ proyectos: { p1 } }),
  );
  let release;
  let requests = 0;
  global.fetch = async () => {
    requests++;
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const first = dataService.pushToCloudServer();
  const second = dataService.pushToCloudServer();
  await new Promise(setImmediate);
  assert.equal(requests, 1);
  release(new Response("{}"));
  assert.equal((await first).success, true);
  assert.equal((await second).success, true);
  assert.equal(
    Object.keys(
      JSON.parse(localStorage.getItem("obratrack_dirty_v1_a")).proyectos,
    ).length,
    0,
  );
});

test('un imprevisto se sincroniza con su evidencia y monto contra el esquema de producción', async () => {
  const { POST } = require('../app/api/supabase/sync/route.ts');
  const response = await POST(request({ cambios: { imprevistos: [{ id: 'incident-sync', proyecto_id: p1.id, descripcion: 'Ajuste de obra', monto: 12000, origen: 'manual', estado: 'pendiente', fecha: '2026-11-02', foto_url: 'https://example.test/evidencia.png' }] } }));
  assert.equal(response.status, 200);
  const saved = fixture.tables.get('imprevistos').find((r) => r.id === 'incident-sync');
  assert.equal(saved.monto_adicional,12000);
  assert.equal(saved.foto_url,'https://example.test/evidencia.png');
});
