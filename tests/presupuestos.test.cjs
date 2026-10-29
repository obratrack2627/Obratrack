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
const server = require("../lib/ai/server.ts");
let user = { id: "u", empresa_id: "a", rol: "admin" };
server.authorizeAI = async () => ({ client: fixture.supabase, user });
const { GET, PATCH } = require("../app/api/presupuestos/route.ts");
const req = (body) =>
  new NextRequest("http://localhost/api/presupuestos", {
    method: body ? "PATCH" : "GET",
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
afterEach(() => {
  fixture.reset();
  user = { id: "u", empresa_id: "a", rol: "admin" };
});
test("listado de presupuestos respeta la empresa y la obra seleccionada", async () => {
  fixture.tables.set("presupuestos", [
    { id: "a1", empresa_id: "a", proyecto_id: "p1" },
    { id: "a2", empresa_id: "a", proyecto_id: "p2" },
    { id: "b1", empresa_id: "b", proyecto_id: "p1" },
  ]);
  const all = await (await GET(req())).json();
  assert.deepEqual(
    all.presupuestos.map((x) => x.id),
    ["a1", "a2"],
  );
  const scoped = await (
    await GET(
      new NextRequest("http://localhost/api/presupuestos?proyecto_id=p1"),
    )
  ).json();
  assert.deepEqual(
    scoped.presupuestos.map((x) => x.id),
    ["a1"],
  );
});
test("presupuesto permite aprobación y rechazo sin crear obras ni pagos", async () => {
  fixture.tables.set("presupuestos", [
    { id: "a1", empresa_id: "a", estado: "borrador", updated_at: "v1" },
  ]);
  for (const estado of ["aprobada", "rechazada"]) {
    const r = await PATCH(req({ id: "a1", estado, updated_at: "v1" }));
    assert.equal(r.status, 200);
    assert.equal((await r.json()).presupuesto.estado, estado);
  }
  assert.equal(fixture.tables.has("proyectos"), false);
  assert.equal(fixture.tables.has("pagos"), false);
});
test("asociación a una obra ajena, estado inventado y actualización obsoleta se rechazan", async () => {
  fixture.tables.set("presupuestos", [
    { id: "a1", empresa_id: "a", estado: "borrador", updated_at: "v2" },
  ]);
  fixture.tables.set("proyectos", [{ id: "pb", empresa_id: "b" }]);
  assert.equal(
    (
      await PATCH(
        req({
          id: "a1",
          estado: "aprobada",
          updated_at: "v2",
          proyecto_id: "pb",
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (await PATCH(req({ id: "a1", estado: "inventado", updated_at: "v2" })))
      .status,
    400,
  );
  assert.equal(
    (await PATCH(req({ id: "a1", estado: "aprobada", updated_at: "v1" })))
      .status,
    409,
  );
  assert.equal(fixture.tables.get("presupuestos")[0].estado, "borrador");
});
test("un trabajador de terreno no puede leer ni aprobar presupuestos", async () => {
  user.rol = "terreno";
  assert.equal((await GET(req())).status, 403);
  assert.equal(
    (await PATCH(req({ id: "a1", estado: "aprobada", updated_at: "v1" })))
      .status,
    403,
  );
});
