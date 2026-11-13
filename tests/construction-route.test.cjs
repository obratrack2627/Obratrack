require("./helpers/typescript.cjs");
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("./helpers/supabase.cjs");
const server = require("../lib/ai/server.ts");
server.authorizeAI = async () => ({
  client: fixture.supabase,
  user: { id: "boss", empresa_id: "company", rol: "admin" },
});
const { POST } = require("../app/api/proyectos/[id]/gestion/route.ts");
const request = (body) =>
  new Request("https://obratrack.test/api/proyectos/p/gestion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const params = { params: { id: "p" } };
beforeEach(() => {
  fixture.reset();
  fixture.tables.set("proyectos", [{ id: "p", empresa_id: "company" }]);
  fixture.tables.set("asistencia_obreros", [
    { id: "as", proyecto_id: "p" },
    { id: "foreign", proyecto_id: "other" },
  ]);
});
test("gestión niega obra ajena, asistencia ajena y operaciones desconocidas antes de ejecutar RPC", async () => {
  for (const [body, context, status] of [
    [
      { id: "op", operacion: "recepcion", datos: {} },
      { params: { id: "foreign" } },
      403,
    ],
    [{ id: "op", operacion: "jornal", asistencia_id: "foreign" }, params, 403],
    [{ id: "op", operacion: "borrar_todo" }, params, 422],
    [{}, params, 422],
  ])
    assert.equal((await POST(request(body), context)).status, status);
  assert.equal(fixture.rpcCalls.length, 0);
});
test("recepción retirada no ejecuta RPC ni crea documentos", async () => {
  const response = await POST(request({ id: "op", operacion: "recepcion", datos: { estado: "conforme" } }), params);
  assert.equal(response.status, 410);
  assert.equal((await response.json()).code, "FEATURE_REMOVED");
  assert.equal(fixture.rpcCalls.length, 0);
});
test("propuesta desactualizada no anuncia guardado y conserva un error útil", async () => {
  fixture.handleRPC("reprogramar_faenas", () => ({
    data: null,
    error: { message: "SCHEDULE_STALE" },
  }));
  const response = await POST(
    request({
      id: "op",
      operacion: "reprogramar",
      tareas: [],
      motivo: "Lluvia",
    }),
    params,
  );
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /partidas cambiaron/);
});
