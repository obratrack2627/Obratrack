require("./helpers/typescript.cjs");
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("./helpers/supabase.cjs");
const server = require("../lib/ai/server.ts");
let actor = { id: "boss", empresa_id: "company", rol: "admin" };
server.authorizeAI = async () => ({ client: fixture.supabase, user: actor });
const {
  POST,
  DELETE,
} = require("../app/api/proyectos/[id]/cuadrilla/route.ts");
const request = (body) =>
  new Request("https://obratrack.test/api/proyectos/p/cuadrilla", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const params = { params: { id: "p" } };
beforeEach(() => {
  fixture.reset();
  fixture.tables.set("proyectos", [
    { id: "p", empresa_id: "company", monto_cotizado: 15000000 },
  ]);
  fixture.tables.set("usuarios", [
    { id: "worker", empresa_id: "company", rol: "terreno" },
    { id: "supervisor", empresa_id: "company", rol: "supervisor" },
    { id: "boss", empresa_id: "company", rol: "admin" },
    { id: "foreign", empresa_id: "other", rol: "terreno" },
  ]);
  fixture.tables.set("proyecto_trabajadores", [
    { proyecto_id: "p", usuario_id: "existing" },
    { proyecto_id: "p2", usuario_id: "worker" },
  ]);
  fixture.tables.set("asistencia_obreros", [
    { id: "past", proyecto_id: "p", usuario_id: "worker", estado: "presente" },
  ]);
});

test("asignar/retirar solo modifica el par solicitado y conserva presupuesto, otras obras e historial", async () => {
  for (let count = 0; count < 2; count++) {
    const response = await POST(request({ usuario_id: "worker" }), params);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).trabajadores_ids, [
      "existing",
      "worker",
    ]);
  }
  assert.equal(fixture.tables.get("proyecto_trabajadores").length, 3);
  assert.equal(
    (await DELETE(request({ usuario_id: "worker" }), params)).status,
    200,
  );
  assert.deepEqual(fixture.tables.get("proyecto_trabajadores"), [
    { proyecto_id: "p", usuario_id: "existing" },
    { proyecto_id: "p2", usuario_id: "worker" },
  ]);
  assert.equal(fixture.tables.get("asistencia_obreros").length, 1);
  assert.equal(fixture.tables.get("proyectos")[0].monto_cotizado, 15000000);
});

test("no asigna identidades de otra empresa, administradores ni datos inválidos", async () => {
  for (const [body, status] of [
    [{ usuario_id: "foreign" }, 403],
    [{ usuario_id: "boss" }, 422],
    [{}, 422],
    [null, 422],
  ])
    assert.equal((await POST(request(body), params)).status, status);
  assert.equal(
    (
      await POST(request({ usuario_id: "worker" }), {
        params: { id: "foreign-project" },
      })
    ).status,
    403,
  );
  assert.equal(
    fixture.calls.some((call) => ["upsert", "delete"].includes(call.mode)),
    false,
  );
  assert.equal(
    (await POST(request({ usuario_id: "supervisor" }), params)).status,
    200,
  );
});

test("error de guardado se informa sin fingir asignación; autenticación se exige en POST y DELETE", async () => {
  fixture.fail("proyecto_trabajadores", 1, "upsert");
  assert.equal(
    (await POST(request({ usuario_id: "worker" }), params)).status,
    503,
  );
  assert.equal(fixture.tables.get("proyecto_trabajadores").length, 2);
  const original = server.authorizeAI;
  server.authorizeAI = async () => {
    throw new (require("../lib/ai/errors.ts").AIError)(
      "AUTH",
      "Inicia sesión",
      401,
    );
  };
  try {
    for (const action of [POST, DELETE])
      assert.equal(
        (await action(request({ usuario_id: "worker" }), params)).status,
        401,
      );
  } finally {
    server.authorizeAI = original;
  }
});
