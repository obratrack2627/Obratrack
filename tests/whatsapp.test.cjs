require("./helpers/typescript.cjs");
const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const { NextRequest } = require("next/server");
const {
  canonicalPhone,
  validMetaSignature,
} = require("../lib/whatsapp/meta.ts");
const {
  isolatedState,
  planWhatsAppActions,
} = require("../lib/whatsapp/state.ts");
const {
  identifySender,
  processPersonalMessage,
} = require("../lib/whatsapp/assistant.ts");
const {
  createWhatsAppWebhook,
  getWhatsAppStatus,
} = require("../lib/whatsapp/webhook.ts");
const env = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env))
    if (!(key in env)) delete process.env[key];
  Object.assign(process.env, env);
});
const user = {
  id: "jefe",
  empresa_id: "empresa1",
  nombre: "Jefa",
  rol: "admin",
  telefono_whatsapp: "+56 9 1234 5678",
  email: "jefa@example.test",
};
const setup = () => {
  for (const key of [
    "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
    "WHATSAPP_APP_SECRET",
    "WHATSAPP_CLOUD_API_ACCESS_TOKEN",
    "WHATSAPP_CLOUD_API_PHONE_NUMBER_ID",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GEMINI_API_KEY",
  ])
    process.env[key] = "fixture";
};
function request(body, signature = true) {
  const raw = JSON.stringify(body);
  return new NextRequest("https://example.test/api/webhook/whatsapp", {
    method: "POST",
    body: raw,
    headers: signature
      ? {
          "x-hub-signature-256":
            "sha256=" +
            createHmac("sha256", process.env.WHATSAPP_APP_SECRET)
              .update(raw)
              .digest("hex"),
        }
      : {},
  });
}
const event = (messages) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        { value: { metadata: { phone_number_id: "fixture" }, messages } },
      ],
    },
  ],
});
function database() {
  const db = {
    usuarios: [user],
    empresas: [{ id: "empresa1", plan_id: "pro_ia" }],
    whatsapp_mensajes: [],
    proyectos: [],
    clientes: [],
  };
  let commits = 0;
  return {
    db,
    get commits() {
      return commits;
    },
    from(table) {
      let predicates = [],
        max = Infinity;
      const q = {
        select() {
          return q;
        },
        eq(k, v) {
          predicates.push((x) => x[k] === v);
          return q;
        },
        in(k, v) {
          predicates.push((x) => v.includes(x[k]));
          return q;
        },
        order() {
          return q;
        },
        limit(n) {
          max = n;
          return q;
        },
        then(resolve, reject) {
          return Promise.resolve({
            data: (db[table] || [])
              .filter((x) => predicates.every((p) => p(x)))
              .slice(0, max),
          }).then(resolve, reject);
        },
      };
      return q;
    },
    async rpc(_, p) {
      let row = db.whatsapp_mensajes.find((m) => m.message_id === p.p_id);
      if (!row) {
        commits++;
        row = {
          message_id: p.p_id,
          empresa_id: p.p_empresa,
          actor_id: p.p_actor,
          texto: p.p_texto,
          respuesta: p.p_respuesta,
          cotizacion: p.p_cotizacion,
          acciones: p.p_acciones,
        };
        db.whatsapp_mensajes.push(row);
      }
      return { data: row };
    },
  };
}
test("teléfono completo: formato chileno y coincidencia única, sin colisiones de últimos dígitos", () => {
  assert.equal(canonicalPhone("9 1234 5678"), "56912345678");
  assert.equal(identifySender([user], "+56912345678").id, "jefe");
  assert.equal(
    identifySender(
      [user, { ...user, id: "otro", empresa_id: "otra" }],
      user.telefono_whatsapp,
    ),
    null,
  );
  assert.equal(identifySender([user], "15912345678"), null);
});
test("firma HMAC valida bytes originales y rechaza mensajes manipulados", () => {
  const raw = '{"hola":"obra"}',
    sig = "sha256=" + createHmac("sha256", "secret").update(raw).digest("hex");
  assert.equal(validMetaSignature(raw, sig, "secret"), true);
  assert.equal(validMetaSignature(raw + " ", sig, "secret"), false);
  assert.equal(validMetaSignature(raw, null, "secret"), false);
});
test("motor de acciones funciona en memoria del servidor, sin navegador, con varias partidas y materiales", () => {
  assert.equal(typeof window, "undefined");
  const service = isolatedState(
    user,
    { usuarios: [user], proyectos: [], clientes: [] },
    "pro_ia",
  );
  const plan = planWhatsAppActions(service, {
    tipo: "crear_proyecto",
    nombre: "Radier",
    comuna: "Maipú",
    monto: 1800000,
    dias: 10,
    partidas: [
      { nombre: "Base", dias: 3 },
      { nombre: "Hormigón", dias: 7 },
    ],
    materiales: [
      { nombre: "Cemento", cantidad: 20, precio_unitario: 5000 },
      { nombre: "Malla", cantidad: 2, precio_unitario: 25000 },
    ],
  });
  assert.equal(plan.changed.proyectos.length, 1);
  assert.equal(plan.changed.actividades.length, 2);
  assert.equal(plan.changed.materiales_proyecto.length, 2);
  const other = isolatedState(
    { ...user, empresa_id: "otra" },
    { usuarios: [] },
    "pro_ia",
  );
  assert.equal(other.getProyectos().length, 0);
});
test("reintento del mismo mensaje usa respuesta guardada y no vuelve a llamar IA ni crear un pago", async () => {
  const sb = database();
  sb.db.proyectos = [
    {
      id: "p1",
      empresa_id: "empresa1",
      nombre: "Radier",
      fecha_inicio: "2026-10-29",
      fecha_termino_estimada: "2026-11-10",
      monto_cotizado: 1000000,
      estado: "activo",
    },
  ];
  let calls = 0;
  const deps = {
    chat: async () => {
      calls++;
      return {
        respuesta: "Pago preparado",
        accion: {
          tipo: "registrar_pago",
          proyecto_id: "p1",
          monto: 100000,
          metodo: "transferencia",
        },
        cotizacion: null,
      };
    },
  };
  const message = {
    id: "wamid.test",
    from: "56912345678",
    type: "text",
    text: { body: "Registra abono de 100000 a Radier" },
  };
  const first = await processPersonalMessage(sb, message, deps),
    second = await processPersonalMessage(sb, message, deps);
  assert.match(first.respuesta, /Guardado/);
  assert.equal(second.message_id, first.message_id);
  assert.equal(calls, 1);
  assert.equal(sb.commits, 1);
});
test("un número no registrado no consulta obras ni llama IA", async () => {
  const sb = database();
  let calls = 0;
  const result = await processPersonalMessage(
    sb,
    { id: "m", from: "56998765432" },
    { chat: async () => calls++ },
  );
  assert.equal(calls, 0);
  assert.equal(result.persistido, false);
  assert.match(result.respuesta, /vinculada/);
});
test("perfil terreno no puede registrar pagos y recibe solamente sus obras asignadas", async () => {
  const sb = database();
  sb.db.usuarios = [{ ...user, rol: "terreno" }];
  sb.db.proyectos = [
    { id: "ajena", empresa_id: "empresa1", nombre: "Otra obra" },
  ];
  const result = await processPersonalMessage(
    sb,
    {
      id: "m",
      from: "56912345678",
      type: "text",
      text: { body: "Registra pago" },
    },
    {
      chat: async (_, __, ctx) => {
        assert.equal(ctx.proyectos.length, 0);
        return {
          respuesta: "Preparado",
          accion: { tipo: "registrar_pago", proyecto_id: "ajena", monto: 100 },
          cotizacion: null,
        };
      },
    },
  );
  assert.match(result.respuesta, /No se guardaron cambios/);
  assert.match(result.respuesta, /perfil de terreno/);
});
test("webhook no configurado o sin firma no ejecuta ni envía mensajes", async () => {
  setup();
  let calls = 0;
  const handler = createWhatsAppWebhook({
    process: async () => calls++,
    send: async () => calls++,
    client: () => ({}),
  });
  assert.equal(
    (await handler(request(event([{ id: "m" }]), false))).status,
    401,
  );
  assert.equal(calls, 0);
  delete process.env.WHATSAPP_APP_SECRET;
  assert.equal((await handler(request(event([]), false))).status, 503);
});
test("webhook procesa todos los mensajes firmados y falla con 503 para permitir reintento", async () => {
  setup();
  let processed = 0,
    sent = 0;
  const handler = createWhatsAppWebhook({
    client: () => ({}),
    process: async () => {
      processed++;
      return { respuesta: "Recibido", persistido: false };
    },
    send: async () => sent++,
  });
  assert.equal(
    (
      await handler(
        request(
          event([
            { id: "1", from: "56912345678" },
            { id: "2", from: "56912345678" },
          ]),
        ),
      )
    ).status,
    200,
  );
  assert.equal(processed, 2);
  assert.equal(sent, 2);
  const failing = createWhatsAppWebhook({
    client: () => ({}),
    process: async () => {
      throw new Error("db");
    },
    send: async () => {},
  });
  assert.equal((await failing(request(event([{ id: "3" }])))).status, 503);
});
test("webhook ignora números receptores de otras instalaciones", async () => {
  setup();
  let calls = 0;
  const body = event([{ id: "m" }]);
  body.entry[0].changes[0].value.metadata.phone_number_id = "otro";
  const handler = createWhatsAppWebhook({
    client: () => ({}),
    process: async () => calls++,
    send: async () => calls++,
  });
  assert.equal((await handler(request(body))).status, 200);
  assert.equal(calls, 0);
});
test("verificación de Meta requiere token privado configurado, no un valor predeterminado", async () => {
  delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  const url =
    "https://example.test/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=obratrack_verify_2026&hub.challenge=test";
  assert.equal((await getWhatsAppStatus(new NextRequest(url))).status, 403);
});

test("el simulador también exige una sesión JWT real", async () => {
  const { POST } = require("../app/api/webhook/whatsapp/simulador/route.ts");
  const req = new NextRequest(
    "https://example.test/api/webhook/whatsapp/simulador",
    {
      method: "POST",
      headers: { cookie: "obratrack_auth_token=inventado" },
      body: "{}",
    },
  );
  assert.equal((await POST(req)).status, 401);
});
