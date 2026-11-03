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
        max = Infinity, single = false;
      const q = {
        select() {
          return q;
        },
        eq(k, v) {
          predicates.push((x) => k.includes('->>') ? x[k.split('->>')[0]]?.[k.split('->>')[1]] === v : x[k] === v);
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
        maybeSingle() { single = true; return q; },
        then(resolve, reject) {
          const rows = (db[table] || []).filter((x) => predicates.every((p) => p(x))).slice(0, max);
          return Promise.resolve({ data: single ? rows[0] || null : rows }).then(resolve, reject);
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
          borrador_obra: p.p_borrador ?? null,
        };
        db.whatsapp_mensajes.unshift(row);
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

test("las rutas de simulación y recuperación de desarrollador se retiraron de producción", () => {
  const fs = require("node:fs");
  for (const path of [
    "webhook/whatsapp/simulador",
    "webhook/whatsapp/cliente",
    "auth/dev-sync",
  ])
    assert.equal(
      fs.existsSync(
        require("node:path").join(__dirname, "../app/api", path, "route.ts"),
      ),
      false,
    );
});

test("el diagnóstico del webhook identifica cuota sin publicar mensajes internos", async () => {
  setup();
  const { AIError } = require("../lib/ai/errors.ts");
  const handler = createWhatsAppWebhook({
    client: () => ({}),
    process: async () => {
      throw new AIError("AI_RATE_LIMIT", "sensitive-private-diagnostic", 429);
    },
    send: async () => {},
  });
  const result = await handler(request(event([{ id: "test" }])));
  const body = await result.json();
  assert.equal(result.status, 503);
  assert.equal(body.code, "AI_RATE_LIMIT");
  assert.equal(body.stage, "process");
  assert.ok(!JSON.stringify(body).includes("sensitive-private-diagnostic"));
});

test("foto de WhatsApp conserva archivo y bitácora con la obra autorizada; reintentar no vuelve a subirla", async () => {
  const sb = database();
  sb.db.proyectos = [
    {
      id: "p1",
      empresa_id: "empresa1",
      nombre: "Radier",
      estado: "activo",
      monto_cotizado: 0,
    },
  ];
  let uploads = 0;
  const rpc = sb.rpc;
  let params;
  sb.rpc = async (name, p) => {
    params = p;
    const r = await rpc(name, p);
    r.data.adjunto = p.p_adjunto;
    return r;
  };
  const deps = {
    media: async () => ({ mimeType: "image/jpeg", data: "cGhvdG8=" }),
    store: async () => {
      uploads++;
      return {
        path: "empresa1/jefe/photo.jpg",
        proyecto_id: null,
        origen_message_id: "photo1",
      };
    },
    transcribe: async () => "Se observa un radier.",
    chat: async () => ({
      respuesta: "Foto recibida",
      accion: null,
      cotizacion: null,
    }),
  };
  const message = {
    id: "photo1",
    from: "56912345678",
    type: "image",
    image: { id: "123", caption: "Avance en Radier" },
  };
  const first = await processPersonalMessage(sb, message, deps);
  await processPersonalMessage(sb, message, deps);
  assert.match(first.respuesta, /Foto guardada/);
  assert.equal(params.p_adjunto.proyecto_id, "p1");
  assert.equal(params.p_changed.bitacora_entradas.length, 1);
  assert.equal(
    params.p_changed.bitacora_entradas[0].foto_url,
    "whatsapp-evidencias:empresa1/jefe/photo.jpg",
  );
  assert.equal(uploads, 1);
});

test("una foto sin obra identificable queda pendiente y se puede asociar en el mensaje siguiente", async () => {
  const sb = database();
  sb.db.proyectos = [
    { id: "p1", empresa_id: "empresa1", nombre: "Radier" },
    { id: "p2", empresa_id: "empresa1", nombre: "Terraza" },
  ];
  const rpc = sb.rpc;
  let params;
  sb.rpc = async (name, p) => {
    params = p;
    const r = await rpc(name, p);
    r.data.adjunto = p.p_adjunto;
    return r;
  };
  const deps = {
    media: async () => ({ mimeType: "image/jpeg", data: "cGhvdG8=" }),
    store: async () => ({
      path: "empresa1/jefe/photo.jpg",
      proyecto_id: null,
      origen_message_id: "photo1",
    }),
    transcribe: async () => "Material acopiado.",
    chat: async () => ({
      respuesta: "Recibido",
      accion: null,
      cotizacion: null,
    }),
  };
  const result = await processPersonalMessage(
    sb,
    { id: "photo1", from: "56912345678", type: "image", image: { id: "123" } },
    deps,
  );
  assert.match(result.respuesta, /Indica el nombre/);
  assert.equal(params.p_changed.bitacora_entradas.length, 0);
  assert.equal(params.p_adjunto.proyecto_id, null);
  await processPersonalMessage(
    sb,
    {
      id: "answer1",
      from: "56912345678",
      type: "text",
      text: { body: "Corresponde a Terraza" },
    },
    deps,
  );
  assert.equal(params.p_adjunto.proyecto_id, "p2");
  assert.equal(params.p_changed.bitacora_entradas[0].proyecto_id, "p2");
});

test("fallo de Storage no confirma la recepción de una foto sin guardar", async () => {
  const sb = database();
  await assert.rejects(
    processPersonalMessage(
      sb,
      {
        id: "photo1",
        from: "56912345678",
        type: "image",
        image: { id: "123" },
      },
      {
        media: async () => ({}),
        store: async () => {
          throw Error("Storage failed");
        },
        chat: async () => {
          throw Error("no debe llamarse");
        },
      },
    ),
    /Storage failed/,
  );
  assert.equal(sb.commits, 0);
});

test("la foto y su pregunta llegan juntas a Gemini en una sola llamada, sin perder la respuesta al guardarla", async () => {
  const sb = database();
  sb.db.proyectos = [{ id: "p1", empresa_id: "empresa1", nombre: "Radier" }];
  let calls = 0;
  const photo = { mimeType: "image/jpeg", data: "cGhvdG8=" };
  const result = await processPersonalMessage(
    sb,
    {
      id: "direct-photo",
      from: "56912345678",
      type: "image",
      image: { id: "123", caption: "¿Qué problema se ve en Radier?" },
    },
    {
      media: async () => photo,
      store: async () => ({
        path: "empresa1/jefe/direct.jpg",
        proyecto_id: null,
        origen_message_id: "direct-photo",
      }),
      transcribe: async () => {
        throw Error("No se debe usar una descripción intermedia");
      },
      chat: async (_, text, context, options) => {
        calls++;
        assert.equal(text, "¿Qué problema se ve en Radier?");
        assert.equal(context.foto_adjunta, true);
        assert.deepEqual(options.image, photo);
        assert.ok(options.timeoutMs > 5000);
        return {
          respuesta:
            "Se observa una fisura; no puedo determinar su profundidad desde la foto.",
          accion: null,
          cotizacion: null,
        };
      },
    },
  );
  assert.equal(calls, 1);
  assert.match(result.respuesta, /Se observa una fisura/);
  assert.match(result.respuesta, /Foto guardada/);
});

test("si Gemini agota el tiempo se conserva la foto y se avisa sin inventar observaciones ni costos", async () => {
  const sb = database();
  sb.db.proyectos = [{ id: "p1", empresa_id: "empresa1", nombre: "Radier" }];
  const rpc = sb.rpc;
  let params;
  sb.rpc = async (name, p) => {
    params = p;
    return rpc(name, p);
  };
  const { AIError } = require("../lib/ai/errors.ts");
  const result = await processPersonalMessage(
    sb,
    {
      id: "slow-photo",
      from: "56912345678",
      type: "image",
      image: { id: "123", caption: "Foto de Radier" },
    },
    {
      media: async () => ({ mimeType: "image/jpeg", data: "cGhvdG8=" }),
      store: async () => ({
        path: "empresa1/jefe/slow.jpg",
        proyecto_id: null,
        origen_message_id: "slow-photo",
      }),
      chat: async () => {
        throw new AIError("AI_TIMEOUT", "private-provider-detail", 503);
      },
    },
  );
  assert.equal(result.persistido, true);
  assert.equal(params.p_adjunto.analisis_pendiente, true);
  assert.equal(params.p_changed.bitacora_entradas.length, 1);
  assert.equal(params.p_changed.pagos.length, 0);
  assert.equal(params.p_changed.imprevistos.length, 0);
  assert.match(result.respuesta, /análisis de la imagen no estuvo disponible/);
  assert.doesNotMatch(result.respuesta, /private-provider-detail/);
});

test("diagnóstico privado distingue un token vencido y no expone el detalle de Meta", async () => {
  setup();
  const { checkMetaConnection } = require("../lib/whatsapp/meta.ts");
  const result = await checkMetaConnection(
    async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 190,
            error_subcode: 463,
            message: "private-meta-token-detail",
          },
        }),
        { status: 401 },
      ),
  );
  assert.equal(result.estado, "renovar_conexion");
  assert.doesNotMatch(JSON.stringify(result), /private-meta-token-detail/);
  const good = await checkMetaConnection(
    async () =>
      new Response(JSON.stringify({ id: "fixture" }), { status: 200 }),
  );
  assert.equal(good.estado, "disponible");
  const denied = await checkMetaConnection(
    async () =>
      new Response(JSON.stringify({ error: { code: 200 } }), { status: 403 }),
  );
  assert.equal(denied.estado, "permisos_pendientes");
});

test("crear una obra por WhatsApp no guarda nada hasta reunir los cinco campos obligatorios", async () => {
  const sb = database();
  const rpc = sb.rpc;
  let params;
  sb.rpc = async (name, p) => {
    params = p;
    return rpc(name, p);
  };
  let step = 0;
  const deps = {
    chat: async (_, __, context) => {
      step++;
      if (step === 1)
        return {
          respuesta: "Faltan datos",
          accion: null,
          cotizacion: null,
          obra_propuesta: { nombre: "Patio", monto_cotizado: 1500000 },
        };
      assert.equal(context.creacion_obra_whatsapp.borrador.nombre, "Patio");
      return {
        respuesta: "Datos completos",
        accion: null,
        cotizacion: null,
        obra_propuesta: {
          cliente_nombre: "Ana Pérez",
          cliente_email: "ana@example.test",
          cliente_telefono: "+56987654321",
        },
      };
    },
  };
  const first = await processPersonalMessage(
    sb,
    {
      id: "create1",
      from: "56912345678",
      type: "text",
      text: { body: "Crea una obra llamada Patio, presupuesto 1500000" },
    },
    deps,
  );
  assert.match(first.respuesta, /Nombre del cliente/);
  assert.match(first.respuesta, /Correo/);
  assert.match(first.respuesta, /Teléfono/);
  assert.equal(params.p_acciones.tipo, "solicitar_datos_obra");
  assert.equal(Object.values(params.p_changed).flat().length, 0);
  const second = await processPersonalMessage(
    sb,
    {
      id: "create2",
      from: "56912345678",
      type: "text",
      text: {
        body: "Cliente Ana Pérez, correo ana@example.test, teléfono +56987654321",
      },
    },
    deps,
  );
  assert.match(second.respuesta, /Obra Creada/);
  assert.equal(params.p_changed.proyectos.length, 1);
  assert.equal(params.p_changed.proyectos[0].nombre, "Patio");
  assert.equal(params.p_changed.proyectos[0].monto_cotizado, 1500000);
  assert.equal(params.p_changed.clientes[0].email, "ana@example.test");
  assert.equal(params.p_changed.clientes[0].telefono, "+56987654321");
});

test("el aviso de WhatsApp se registra atómicamente con sus destinatarios y el reintento no vuelve a encolarlo", async () => {
  const sb = database();
  sb.db.usuarios.push({
    id: "worker",
    empresa_id: "empresa1",
    nombre: "Maestro",
    rol: "terreno",
    telefono_whatsapp: "+56912345679",
  });
  const rpc = sb.rpc;
  let queued = 0;
  sb.rpc = async (name, p) => {
    assert.equal(name, "aplicar_lote_copiloto");
    queued++;
    assert.deepEqual(p.p_aviso.destinatarios, ["worker"]);
    const result = await rpc("aplicar_lote_whatsapp", p);
    result.data.aviso_id = "11111111-1111-4111-a111-111111111111";
    return result;
  };
  const deps = {
    chat: async () => ({
      respuesta: "Aviso preparado",
      accion: {
        tipo: "enviar_mensaje_equipo",
        mensaje: "Mañana a las 08:00.",
        roles_destino: ["terreno"],
      },
      cotizacion: null,
    }),
  };
  const msg = {
    id: "aviso1",
    from: "56912345678",
    type: "text",
    text: { body: "Envía a terreno que mañana comenzamos a las 08:00" },
  };
  const result = await processPersonalMessage(sb, msg, deps);
  await processPersonalMessage(sb, msg, deps);
  assert.equal(queued, 1);
  assert.match(result.respuesta, /en cola/);
  assert.doesNotMatch(result.respuesta, /entregado|se envi[oó]/);
});

test("una petición expresa inicia el borrador aunque Gemini solo devuelva texto sin propuesta", async () => {
  const sb = database();
  const result = await processPersonalMessage(
    sb,
    {
      id: "draft-without-model-proposal",
      from: user.telefono_whatsapp,
      type: "text",
      text: { body: "Crea una obra llamada Terraza" },
    },
    {
      chat: async () => ({
        respuesta: "Dime los datos.",
        accion: null,
        cotizacion: null,
        sugerencias: [],
      }),
    },
  );
  assert.equal(result.acciones.tipo, "solicitar_datos_obra");
  assert.equal(result.acciones.detalles.borrador.nombre, "Terraza");
  assert.equal(sb.db.proyectos.length, 0);
  assert.match(result.respuesta, /Correo/);
});

test("una consulta sobre el avance de una obra no inicia una creación", async () => {
  const sb = database();
  const result = await processPersonalMessage(
    sb,
    {
      id: "query-not-creation",
      from: user.telefono_whatsapp,
      type: "text",
      text: { body: "Necesito saber el avance de la obra" },
    },
    {
      chat: async () => ({
        respuesta: "Indica la obra.",
        accion: null,
        cotizacion: null,
        sugerencias: [],
      }),
    },
  );
  assert.equal(result.acciones, null);
  assert.match(result.respuesta, /^🟧 \*ObraTrack\*/);
  assert.ok(result.respuesta.endsWith("Indica la obra."));
});

test("leer el número en Meta no acredita un permiso de mensajería que falta en la credencial", async () => {
  setup();
  const { checkMetaConnection } = require("../lib/whatsapp/meta.ts");
  const result = await checkMetaConnection(
    async (url) =>
      new Response(
        JSON.stringify(
          url.includes("/me/permissions")
            ? {
                data: [
                  {
                    permission: "whatsapp_business_management",
                    status: "granted",
                  },
                ],
              }
            : { id: "fixture" },
        ),
        { status: 200 },
      ),
  );
  assert.equal(result.estado, "permisos_pendientes");
  assert.equal(result.permisos_mensajeria, "pendiente");
  assert.match(result.mensaje, /whatsapp_business_messaging/);
});

test("una consulta o un aviso durante la creación de una obra conserva el borrador sin bloquear la otra tarea", async () => {
  const sb = database();
  sb.db.usuarios.push({
    id: "worker",
    empresa_id: "empresa1",
    nombre: "Maestro",
    rol: "terreno",
    telefono_whatsapp: "+56912345679",
  });
  let queued = 0;
  const baseRPC = sb.rpc;
  sb.rpc = async (name, p) => {
    if (p.p_aviso) {
      queued++;
      const response = await baseRPC(name, p);
      response.data.aviso_id = "aviso-real";
      return response;
    }
    return baseRPC(name, p);
  };
  const message = (id, body) => ({
    id,
    from: user.telefono_whatsapp,
    type: "text",
    text: { body },
  });
  await processPersonalMessage(
    sb,
    message("draft", "Crea una obra llamada Patio"),
    {
      chat: async () => ({
        respuesta: "Datos",
        accion: null,
        cotizacion: null,
        obra_propuesta: { nombre: "Patio" },
      }),
    },
  );
  for (let i = 0; i < 8; i++) {
    const reply = await processPersonalMessage(
      sb,
      message("query" + i, "¿Qué puedes hacer?"),
      {
        chat: async () => ({
          respuesta: "Puedo consultar tu obra.",
          accion: null,
          cotizacion: null,
          obra_propuesta: null,
        }),
      },
    );
    assert.match(reply.respuesta, /^🟧 \*ObraTrack\*/);
    assert.ok(reply.respuesta.endsWith("Puedo consultar tu obra."));
    assert.equal(reply.borrador_obra.nombre, "Patio");
  }
  const notice = await processPersonalMessage(
    sb,
    message("notice", "Envía a terreno: mañana a las 08:00"),
    {
      chat: async () => ({
        respuesta: "Aviso",
        accion: {
          tipo: "enviar_mensaje_equipo",
          mensaje: "Mañana a las 08:00",
          roles_destino: ["terreno"],
        },
        cotizacion: null,
        obra_propuesta: null,
      }),
    },
  );
  assert.equal(queued, 1);
  assert.equal(notice.acciones.tipo, "enviar_mensaje_equipo");
  assert.equal(notice.borrador_obra.nombre, "Patio");
  const complete = await processPersonalMessage(
    sb,
    message(
      "complete",
      "Cliente Ana, presupuesto 1500000, correo ana@example.test, teléfono +56987654321",
    ),
    {
      chat: async () => ({
        respuesta: "Datos",
        accion: null,
        cotizacion: null,
        obra_propuesta: {
          cliente_nombre: "Ana",
          monto_cotizado: 1500000,
          cliente_email: "ana@example.test",
          cliente_telefono: "+56987654321",
        },
      }),
    },
  );
  assert.match(complete.respuesta, /Obra Creada/);
  assert.equal(complete.borrador_obra, null);
});

test("confirmar una cotización por WhatsApp crea sus partidas y materiales sin volver a cotizar", async () => {
  const { normalizeQuote } = require('../lib/ai/protocol.ts');
  const q = normalizeQuote({ titulo_proyecto:'Radier cotizado', cliente_nombre:'Cliente', cliente_email:'cliente@example.test', cliente_telefono:'+56922223333', comuna_region:'Maipú', duracion_dias_estimada:3, materiales:[{nombre:'Hormigón',cantidad:0.5,unidad:'m3',precio_unitario_estimado:100000}],mano_de_obra:[],actividades_gantt:[{nombre:'Preparación',dias:1},{nombre:'Vaciado',dias:2}] });
  const sb = database();
  sb.db.presupuestos = [{id:'wa:quote-source',empresa_id:user.empresa_id,cotizacion:q,proyecto_id:null,estado:'borrador'}];
  sb.db.whatsapp_mensajes = [{message_id:'source',empresa_id:user.empresa_id,actor_id:user.id,cotizacion:q,respuesta:'¿Quieres crear la obra?',texto:'Cotiza el radier'}];
  let committed;
  const rpc = sb.rpc.bind(sb); sb.rpc = async (name,p) => {committed=p;return rpc(name,p)};
  const response = await processPersonalMessage(sb,{id:'quote-confirm',from:'56912345678',type:'text',text:{body:'Sí'}},{chat:async()=>{throw Error('No debe volver a cotizar')}});
  assert.match(response.respuesta,/Guardado en ObraTrack/);
  assert.equal(committed.p_changed.materiales_proyecto[0].cantidad,0.5);
  assert.equal(committed.p_changed.actividades.length,2);
  assert.equal(committed.p_changed.clientes[0].email,'cliente@example.test');
  assert.equal(committed.p_acciones.presupuesto_cotizacion_id,q.id);
  assert.equal(committed.p_acciones.presupuesto_proyecto_id,committed.p_changed.proyectos[0].id);
});
test("aceptar una cotización sin contactos conserva materiales y pide los obligatorios antes de crear", async () => {
  const { normalizeQuote } = require('../lib/ai/protocol.ts');
  const q = normalizeQuote({ titulo_proyecto:'Muro cotizado',cliente_nombre:'Cliente',materiales:[{nombre:'Ladrillos',cantidad:100,unidad:'un',precio_unitario_estimado:1000}],mano_de_obra:[] });
  const sb=database();sb.db.presupuestos=[{id:'wa:pending',empresa_id:user.empresa_id,cotizacion:q,estado:'borrador'}];
  sb.db.whatsapp_mensajes=[{message_id:'source',empresa_id:user.empresa_id,actor_id:user.id,cotizacion:q,respuesta:'¿Quieres crear la obra?',texto:'Cotiza'}];
  const response=await processPersonalMessage(sb,{id:'quote-missing',from:'56912345678',type:'text',text:{body:'Sí'}},{chat:async()=>{throw Error('No debe llamar a Gemini')}});
  assert.match(response.respuesta,/Correo electr/);assert.match(response.respuesta,/Teléfono del cliente/);
  const draft=sb.db.whatsapp_mensajes[0].borrador_obra;assert.equal(draft.materiales.length,1);assert.equal(draft.presupuesto_cotizacion_id,q.id);
});
test("la confirmación de un presupuesto asociado informa la obra existente y no crea otra", async () => {
  const { normalizeQuote } = require('../lib/ai/protocol.ts');
  const q=normalizeQuote({titulo_proyecto:'Obra existente',materiales:[{nombre:'Material',cantidad:1,precio_unitario_estimado:1000}],mano_de_obra:[]});
  const sb=database();sb.db.presupuestos=[{id:'wa:existing',empresa_id:user.empresa_id,cotizacion:q,proyecto_id:'existing',estado:'aprobada'}];
  sb.db.whatsapp_mensajes=[{message_id:'source',empresa_id:user.empresa_id,actor_id:user.id,cotizacion:q,respuesta:'¿Quieres crear la obra?',texto:'Cotiza'}];
  const response=await processPersonalMessage(sb,{id:'confirm-existing',from:'56912345678',type:'text',text:{body:'Sí'}},{chat:async()=>{throw Error('No debe llamar a Gemini')}});
  assert.match(response.respuesta,/ya tiene una obra/);assert.equal(sb.db.whatsapp_mensajes[0].acciones,null);
});

test('las opciones del presupuesto mostrado crean con confirmación o preguntan sin ejecutar cambios', async () => {
  const { normalizeQuote } = require('../lib/ai/protocol.ts');
  const { quoteWhatsApp } = require('../lib/whatsapp/format.ts');
  const q = normalizeQuote({ titulo_proyecto: 'Radier con menú', cliente_nombre: 'Cliente', cliente_email: 'cliente@example.test', cliente_telefono: '+56922223333', materiales: [{ nombre: 'Hormigón', cantidad: 1, unidad: 'm3', precio_unitario_estimado: 90000 }], mano_de_obra: [] });
  for (const choice of ['1', '2', '3']) {
    const sb = database();
    sb.db.presupuestos = [{ id: 'wa:menu', empresa_id: user.empresa_id, cotizacion: q, proyecto_id: null, estado: 'borrador' }];
    sb.db.whatsapp_mensajes = [{ message_id: 'source', empresa_id: user.empresa_id, actor_id: user.id, cotizacion: q, respuesta: quoteWhatsApp(q), texto: 'Cotiza' }];
    const reply = await processPersonalMessage(sb, { id: 'menu-' + choice, from: '56912345678', type: 'text', text: { body: choice } }, { chat: async () => { throw Error('El menú no necesita Gemini'); } });
    assert.match(reply.respuesta, /^🟧 \*ObraTrack\*/);
    if (choice === '1') assert.match(reply.respuesta, /Obra Creada/);
    else {
      assert.equal(sb.db.whatsapp_mensajes[0].acciones, null);
      assert.match(reply.respuesta, choice === '2' ? /Qué deseas modificar/ : /Qué material quieres comparar/);
    }
  }
});

test('varias alternativas por WhatsApp: un sí pide elegir y el número 2 conserva WPC al pedir contactos', async () => {
  setup();
  const { normalizeQuote } = require('../lib/ai/protocol.ts');
  const { quoteWhatsApp } = require('../lib/whatsapp/format.ts');
  const make=(name,amount)=>normalizeQuote({titulo_proyecto:'Remodelación',nombre_alternativa:name,modo_presupuesto:'precio_acordado',tratamiento_iva:'incluido',partidas_venta:[{nombre:'Alcance',unidad:'gl',cantidad:1,precio_unitario:amount}],materiales:[{nombre:name,cantidad:2,unidad:'un',precio_unitario_estimado:5000}],mano_de_obra:[],duracion_dias_estimada:30});
  for (const answer of ['sí','2']) {
    const [a,b]=[make('Wall panel',8811000),make('Deck WPC',8887000)];
    const message={...a,alternativas:[b]};
    const sb=database();
    sb.db.presupuestos=[a,b].map(q=>({id:q.id,empresa_id:user.empresa_id,cotizacion:q,grupo_id:'group1',estado:'borrador',proyecto_id:null}));
    sb.db.whatsapp_mensajes.unshift({message_id:'options',empresa_id:user.empresa_id,actor_id:user.id,cotizacion:message,respuesta:quoteWhatsApp(message)});
    const response=await processPersonalMessage(sb,{id:'choose-'+answer,from:'56912345678',type:'text',text:{body:answer}},{chat:async()=>{throw Error('Elegir no necesita generar otra cotización');}});
    assert.equal(sb.db.proyectos.length,0);
    if(answer==='sí') {
      assert.match(response.respuesta,/Hay varias alternativas/);
      assert.equal(sb.db.whatsapp_mensajes[0].borrador_obra,null);
    } else {
      const draft=sb.db.whatsapp_mensajes[0].borrador_obra;
      assert.equal(draft.presupuesto_cotizacion_id,b.id);
      assert.equal(draft.monto_cotizado,8887000);
      assert.equal(draft.materiales[0].nombre,'Deck WPC');
      assert.match(response.respuesta,/cliente|correo|teléfono/i);
    }
  }
});
