require("./helpers/typescript.cjs");
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("./helpers/supabase.cjs");
require.cache[require.resolve("../lib/supabase/client.ts")] = {
  id: require.resolve("../lib/supabase/client.ts"),
  filename: require.resolve("../lib/supabase/client.ts"),
  loaded: true,
  exports: fixture,
};
const { prepareCampaign } = require("../lib/whatsapp/campaigns.ts");
const { checkActionPermissions } = require("../lib/ai/permissions.ts");
const {
  processOutbox,
  sendTeamMessage,
  DispatchError,
  receiveDeliveryStatus,
} = require("../lib/whatsapp/outbox.ts");
const { projectIntake } = require("../lib/whatsapp/project-intake.ts");
const actor = {
  id: "admin",
  empresa_id: "a",
  rol: "admin",
  nombre: "Jefa",
  telefono_whatsapp: "+56912345678",
};
const users = [
  actor,
  {
    id: "u1",
    empresa_id: "a",
    rol: "terreno",
    nombre: "Maestro Uno",
    telefono_whatsapp: "+56912345679",
  },
  {
    id: "u2",
    empresa_id: "a",
    rol: "supervisor",
    nombre: "Supervisora",
    telefono_whatsapp: "+56912345670",
  },
  {
    id: "u3",
    empresa_id: "a",
    rol: "terreno",
    nombre: "Sin teléfono",
    telefono_whatsapp: "",
  },
  {
    id: "other",
    empresa_id: "b",
    rol: "terreno",
    nombre: "Otra empresa",
    telefono_whatsapp: "+56912345671",
  },
];
const job = {
  id: "11111111-1111-4111-a111-111111111111",
  aviso_id: "campaign1",
  empresa_id: "a",
  destinatario_id: "u1",
  nombre: "Maestro Uno",
  telefono: "56912345679",
  intentos: 1,
  reintentos: 0,
  forzar_plantilla: false,
  estado: "procesando",
};
beforeEach(() => {
  fixture.reset();
  fixture.tables.set("whatsapp_avisos", [
    {
      id: "campaign1",
      empresa_id: "a",
      mensaje: "Mañana comenzamos a las 08:00.",
    },
  ]);
  fixture.tables.set("empresas", [{ id: "a", nombre: "Constructora" }]);
  fixture.tables.set("usuarios", users);
  fixture.tables.set("whatsapp_envios", [{ ...job }]);
  fixture.handleRPC("reservar_envios_whatsapp", async () => ({
    data: [{ ...job }],
    error: null,
  }));
  fixture.handleRPC("estado_envio_whatsapp", async () => ({
    data: true,
    error: null,
  }));
});
test("un aviso por rol selecciona solo la empresa y permite limitar a una obra", () => {
  const plan = prepareCampaign(
    actor,
    { mensaje: "Aviso", roles_destino: ["terreno"] },
    users,
    [],
  );
  assert.deepEqual(plan.destinatarios, ["u1", "u3"]);
  assert.match(plan.result.resultado_texto, /1 persona\(s\) sin teléfono/);
  const scoped = prepareCampaign(
    actor,
    {
      mensaje: "Aviso",
      roles_destino: ["terreno", "supervisor"],
      proyecto_id: "p1",
    },
    users,
    [{ id: "p1", nombre: "Radier", trabajadores_ids: ["u1"] }],
  );
  assert.deepEqual(scoped.destinatarios, ["u1"]);
});
test("solo una petición expresa de envío puede generar avisos y terreno no puede enviarlos", () => {
  const action = {
    tipo: "enviar_mensaje_equipo",
    mensaje: "Aviso",
    roles_destino: ["terreno"],
  };
  assert.throws(
    () =>
      checkActionPermissions(actor, action, "Redacta un aviso para terreno"),
    /expresamente/,
  );
  assert.throws(
    () =>
      checkActionPermissions(actor, action, "No envíes, solo prepara el aviso"),
    /expresamente/,
  );
  assert.throws(
    () =>
      checkActionPermissions(
        { ...actor, rol: "terreno" },
        action,
        "Envía un aviso a terreno",
      ),
    /perfil de terreno/,
  );
  assert.equal(
    checkActionPermissions(
      actor,
      action,
      "Envíales este aviso a todos los trabajadores de terreno",
    ).length,
    1,
  );
});
test("no se asume el primer trabajador cuando los nombres son ambiguos", () => {
  assert.throws(
    () =>
      prepareCampaign(
        actor,
        { mensaje: "Aviso", trabajadores_nombres: ["Maestro"] },
        [
          ...users,
          { id: "u4", empresa_id: "a", nombre: "Maestro Dos", rol: "terreno" },
        ],
        [],
      ),
    /más de una coincidencia/,
  );
});
test("con ventana abierta el worker envía texto y guarda el ID real aceptado por Meta", async () => {
  fixture.tables.set("whatsapp_mensajes", [
    {
      empresa_id: "a",
      sender_phone: job.telefono,
      created_at: new Date().toISOString(),
    },
  ]);
  let calls = 0;
  await processOutbox(fixture.supabase, {
    template: async () => {
      throw Error("No necesita plantilla");
    },
    send: async (j, message, company, template) => {
      calls++;
      assert.equal(template, false);
      assert.equal(message, "Mañana comenzamos a las 08:00.");
      return "wamid.real";
    },
  });
  assert.equal(calls, 1);
  assert.equal(
    fixture.rpcCalls.find((c) => c.name === "estado_envio_whatsapp").params
      .p_meta,
    "wamid.real",
  );
});
test("sin ventana se utiliza la plantilla aprobada y nunca se hace pasar aceptación por entrega", async () => {
  await processOutbox(fixture.supabase, {
    template: async () => ({ status: "APPROVED" }),
    send: async (j, m, c, useTemplate) => {
      assert.equal(useTemplate, true);
      return "wamid.template";
    },
  });
  assert.equal(
    fixture.rpcCalls.find((c) => c.name === "estado_envio_whatsapp").params
      .p_estado,
    "accepted",
  );
});
test("una plantilla pendiente deja el aviso en espera y no intenta enviar texto fuera de ventana", async () => {
  let sent = 0;
  await processOutbox(fixture.supabase, {
    template: async () => ({ status: "PENDING" }),
    send: async () => {
      sent++;
      return "fake";
    },
  });
  assert.equal(sent, 0);
  assert.equal(
    fixture.tables.get("whatsapp_envios")[0].estado,
    "esperando_plantilla",
  );
});
test("una respuesta de red incierta no provoca un reenvío automático que pueda duplicarse", async () => {
  fixture.tables.set("whatsapp_mensajes", [
    {
      empresa_id: "a",
      sender_phone: job.telefono,
      created_at: new Date().toISOString(),
    },
  ]);
  await processOutbox(fixture.supabase, {
    template: async () => ({ status: "APPROVED" }),
    send: async () => {
      throw new DispatchError("ENVIO_SIN_CONFIRMACION", true);
    },
  });
  assert.equal(
    fixture.tables.get("whatsapp_envios")[0].estado,
    "por_verificar",
  );
});
test("el error de destinatario de prueba queda visible por persona", async () => {
  await processOutbox(fixture.supabase, {
    template: async () => ({ status: "APPROVED" }),
    send: async () => {
      throw new DispatchError("131030");
    },
  });
  const row = fixture.tables.get("whatsapp_envios")[0];
  assert.equal(row.estado, "fallido");
  assert.match(row.error_detalle, /número de prueba/);
});
test("el mensaje saliente usa una marca de correlación por intento y obtiene el ID del proveedor", async () => {
  const result = await sendTeamMessage(
    job,
    "Aviso",
    "Constructora",
    false,
    async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.biz_opaque_callback_data, "obratrack:" + job.id + ":1");
      assert.equal(body.to, job.telefono);
      assert.equal(body.type, "text");
      return new Response(
        JSON.stringify({ messages: [{ id: "wamid.test" }] }),
        { status: 200 },
      );
    },
  );
  assert.equal(result, "wamid.test");
});
test("la notificación firmada de entrega se correlaciona con el destinatario y el intento", async () => {
  await receiveDeliveryStatus(fixture.supabase, {
    id: "wamid.test",
    status: "delivered",
    recipient_id: job.telefono,
    biz_opaque_callback_data: "obratrack:" + job.id + ":1",
  });
  const p = fixture.rpcCalls[0].params;
  assert.equal(p.p_id, job.id);
  assert.equal(p.p_intento, 1);
  assert.equal(p.p_estado, "delivered");
  assert.equal(p.p_telefono, job.telefono);
});
test("la creación de obra pide los cinco datos, conserva el borrador y permite omitir la ubicación", () => {
  let step = projectIntake(
    actor,
    { nombre: "Terraza" },
    null,
    [],
    "Crea una obra llamada Terraza",
  );
  assert.match(step.question, /Nombre del cliente/);
  assert.match(step.question, /Presupuesto/);
  assert.match(step.question, /Correo/);
  assert.match(step.question, /Teléfono/);
  assert.equal(step.actions.length, 0);
  step = projectIntake(
    actor,
    { cliente_nombre: "Ana Pérez", monto_cotizado: 2000000 },
    step.draft,
    [],
    "Cliente Ana Pérez, presupuesto 2 millones",
  );
  assert.equal(step.draft.nombre, "Terraza");
  assert.doesNotMatch(step.question, /Nombre de la obra/);
  step = projectIntake(
    actor,
    { cliente_email: "ana@example.test", cliente_telefono: "+56987654321" },
    step.draft,
    [],
    "ana@example.test y +56987654321",
  );
  assert.equal(step.question, null);
  assert.equal(step.actions.at(-1).nombre, "Terraza");
  assert.equal(step.actions.at(-1).cliente_email, "ana@example.test");
  assert.equal(step.actions.at(-1).comuna, undefined);
});
test("el borrador no acepta contactos inventados y puede usar los del cliente ya registrado", () => {
  const bad = projectIntake(
    actor,
    {
      nombre: "Terraza",
      cliente_nombre: "Ana",
      monto_cotizado: 2000000,
      cliente_email: "inventado@example.test",
      cliente_telefono: "+56987654321",
    },
    null,
    [],
    "Crea Terraza para Ana por 2 millones",
  );
  assert.match(bad.question, /Correo/);
  assert.match(bad.question, /Teléfono/);
  const good = projectIntake(
    actor,
    { nombre: "Terraza", cliente_id: "client1", monto_cotizado: 2000000 },
    null,
    [
      {
        id: "client1",
        nombre: "Ana",
        email: "ana@example.test",
        telefono: "+56987654321",
      },
    ],
    "Crea Terraza para Ana por 2 millones",
  );
  assert.equal(good.question, null);
  assert.equal(good.actions.at(-1).cliente_id, "client1");
});

test("el procesador privado solo acepta firmas recientes y no admite suplantar una firma", () => {
  const { validDispatchSignature } = require("../lib/whatsapp/outbox.ts");
  const { createHmac } = require("node:crypto");
  const at = String(Math.floor(Date.now() / 1000));
  const key = "private-fixture";
  const signature = createHmac("sha256", key)
    .update("obratrack-dispatch:" + at)
    .digest("hex");
  assert.equal(validDispatchSignature(at, signature, key), true);
  assert.equal(validDispatchSignature(at, signature, "other"), false);
  assert.equal(
    validDispatchSignature(at, signature, key, Date.now() + 301000),
    false,
  );
  assert.equal(validDispatchSignature(at, "bad", key), false);
});

test("si cambia el teléfono del trabajador antes del envío, no se manda el aviso al contacto anterior", async () => {
  fixture.tables.set(
    "usuarios",
    users.map((u) =>
      u.id === "u1" ? { ...u, telefono_whatsapp: "+56955555555" } : u,
    ),
  );
  let sends = 0;
  await processOutbox(fixture.supabase, {
    template: async () => ({ status: "APPROVED" }),
    send: async () => {
      sends++;
      return "not-used";
    },
  });
  assert.equal(sends, 0);
  assert.equal(
    fixture.tables.get("whatsapp_envios")[0].error_codigo,
    "CONTACTO_CAMBIADO",
  );
});

test("un fallo de lectura anterior a Meta devuelve el trabajo a la cola sin riesgo de duplicar", async () => {
  fixture.fail("whatsapp_avisos", 1, "select");
  let sends = 0;
  await assert.rejects(
    () =>
      processOutbox(fixture.supabase, {
        template: async () => ({ status: "APPROVED" }),
        send: async () => {
          sends++;
          return "unused";
        },
      }),
    /actualizar el estado/,
  );
  assert.equal(sends, 0);
  assert.equal(fixture.tables.get("whatsapp_envios")[0].estado, "pendiente");
  assert.equal(
    fixture.tables.get("whatsapp_envios")[0].error_codigo,
    "LECTURA_PENDIENTE",
  );
});

test("los datos obligatorios etiquetados se conservan cuando la IA omite email o teléfono", () => {
  const result = projectIntake(
    actor,
    { nombre: "Terraza" },
    null,
    [],
    "Crea una obra llamada Terraza, cliente Ana Pérez, presupuesto 2,5 millones, email ana@example.test, teléfono +56987654321",
  );
  assert.equal(result.question, null);
  assert.equal(result.draft.monto_cotizado, 2500000);
  assert.equal(result.draft.cliente_nombre, "Ana Pérez");
  assert.equal(result.draft.cliente_email, "ana@example.test");
  assert.equal(result.draft.cliente_telefono, "+56987654321");
});

test("una obra con los cinco datos y campos opcionales vacíos se puede ejecutar sin partidas", () => {
  const {
    isolatedState,
    planWhatsAppActions,
  } = require("../lib/whatsapp/state.ts");
  const result = projectIntake(
    actor,
    { nombre: "Terraza", dias: 0, partidas: [] },
    null,
    [],
    "Crea una obra llamada Terraza, cliente Ana Pérez, presupuesto 2500000, email ana@example.test, teléfono +56987654321",
  );
  assert.equal(result.question, null);
  const service = isolatedState(
    actor,
    { usuarios: [actor], proyectos: [], clientes: [] },
    "pro_ia",
  );
  const plan = planWhatsAppActions(service, result.actions);
  assert.equal(plan.changed.proyectos.length, 1);
  assert.equal(plan.changed.clientes[0].email, "ana@example.test");
  assert.equal(plan.changed.actividades?.length || 0, 0);
});
