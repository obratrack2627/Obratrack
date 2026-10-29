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
