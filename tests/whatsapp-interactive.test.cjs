require("./helpers/typescript.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const { NextRequest } = require("next/server");

const {
  parseWhatsAppInteractiveReply,
  directInteractiveMenuReply,
  isGreetingOrMenuRequest,
  buildWhatsAppInteractivePayload,
  buildMetaInteractiveRequestBody,
} = require("../lib/whatsapp/interactive.ts");
const { chatGenerationRequest } = require("../lib/gemini.ts");
const { createWhatsAppWebhook } = require("../lib/whatsapp/webhook.ts");

test("parseWhatsAppInteractiveReply traduce botones y listas de Meta a instrucciones deterministas", () => {
  const button = (id, title = "Botón") => ({
    type: "interactive",
    interactive: { type: "button_reply", button_reply: { id, title } },
  });
  const list = (id, title) => ({
    type: "interactive",
    interactive: { type: "list_reply", list_reply: { id, title } },
  });

  assert.equal(parseWhatsAppInteractiveReply(button("ot:quote:create")), "Crea la obra con esta cotización");
  assert.equal(parseWhatsAppInteractiveReply(button("ot:quote:compare")), "Busca precios de los materiales de esta cotización en tiendas");
  assert.equal(parseWhatsAppInteractiveReply(button("ot:quote:alt")), "Dame otra alternativa de esta cotización");
  assert.equal(parseWhatsAppInteractiveReply(button("ot:draft:confirm")), "Sí, confirmar y crear la obra");
  assert.equal(parseWhatsAppInteractiveReply(button("ot:draft:cancel")), "Cancelar borrador");
  const { cancelsProjectDraft } = require("../lib/whatsapp/quote-intake.ts");
  assert.equal(cancelsProjectDraft("Cancelar borrador"), true);
  assert.equal(cancelsProjectDraft("Cancelar creación de obra"), true);
  const { isIntroductoryPauseOnly } = require("../lib/whatsapp/burst.ts");
  assert.ok(isIntroductoryPauseOnly("Holaa", false, []));
  assert.ok(isIntroductoryPauseOnly("Buenas", false, []));
  assert.equal(parseWhatsAppInteractiveReply(button("ot:team:assign")), "Sí");
  assert.equal(parseWhatsAppInteractiveReply(button("ot:team:skip")), "Ahora no");
  assert.equal(parseWhatsAppInteractiveReply(button("ot:act:close")), "Haz el cierre diario de hoy de esta obra");
  assert.equal(parseWhatsAppInteractiveReply(button("ot:act:attendance_all")), "Marca a todos los trabajadores asignados como presentes hoy en esta obra");
  assert.equal(parseWhatsAppInteractiveReply(button("ot:photo:incident")), "Registra la foto anterior como incidente o falla en obra");
  assert.equal(parseWhatsAppInteractiveReply(list("ot:project:p-1", "Casa Norte")), "Trabajar en la obra Casa Norte");
  assert.equal(parseWhatsAppInteractiveReply({ type: "button", button: { text: "Confirmar", payload: "ok" } }), "Confirmar");
});

test("menú de saludo muestra Hacer cotización, Cotización pactada, Crear obra y Ver obras para jefatura y 3 botones para terreno", () => {
  const adminGreeting = buildWhatsAppInteractivePayload({}, { role: "admin", showGreetingMenu: true });
  assert.equal(adminGreeting.kind, "list");
  assert.equal(adminGreeting.buttonText, "📋 ¿Qué hacer?");
  assert.ok(adminGreeting.buttonText.length <= 20);
  assert.deepEqual(
    adminGreeting.rows.map((r) => r.id),
    ["ot:menu:quote", "ot:menu:agreed_quote", "ot:menu:create_project", "ot:menu:list_projects", "ot:menu:prices"],
  );
  for (const r of adminGreeting.rows) {
    assert.ok(r.title.length <= 24, `Row title excede 24 chars: ${r.title}`);
    assert.ok((r.description || "").length <= 72);
  }

  const workerGreeting = buildWhatsAppInteractivePayload({}, { role: "terreno", showGreetingMenu: true });
  assert.equal(workerGreeting.kind, "buttons");
  for (const b of workerGreeting.buttons) assert.ok(b.title.length <= 20);
  assert.deepEqual(workerGreeting.buttons.map((b) => b.id), ["ot:menu:list_projects", "ot:act:progress", "ot:act:incident"]);

  // Respuestas inmediatas sin LLM para cotización, cotización pactada y precios
  assert.match(
    directInteractiveMenuReply([{ type: "interactive", interactive: { type: "list_reply", list_reply: { id: "ot:menu:quote" } } }]).respuesta,
    /cotización/i,
  );
  assert.match(
    directInteractiveMenuReply([{ type: "interactive", interactive: { type: "list_reply", list_reply: { id: "ot:menu:agreed_quote" } } }]).respuesta,
    /cotización pactada/i,
  );
  assert.equal(
    parseWhatsAppInteractiveReply({ type: "interactive", interactive: { type: "list_reply", list_reply: { id: "ot:menu:create_project" } } }),
    "Quiero crear una obra nueva",
  );
  assert.equal(
    parseWhatsAppInteractiveReply({ type: "interactive", interactive: { type: "list_reply", list_reply: { id: "ot:menu:list_projects" } } }),
    "¿Qué obras tengo?",
  );

  // Saludos como "Hola obrabottt" siempre abren el menú y conversaciones de cotización multi-turno mantienen modo quote + botones
  assert.equal(isGreetingOrMenuRequest("Hola obrabottt"), true);
  assert.equal(isGreetingOrMenuRequest("Buenos días obrabot"), true);

  const history = [
    { rol: "user", texto: "Quisiera cotizar" },
    { rol: "model", texto: "¿Qué trabajo necesitas cotizar y cuáles son sus dimensiones y comuna?" },
  ];
  const turn2 = chatGenerationRequest(
    history,
    "Hay que pintar una fachada en las condes, es un muro de 2 metros de alto por 5 de largo",
    {},
  );
  assert.equal(turn2.mode, "quote", "El seguimiento de cotización debe mantenerse en modo quote");

  const historyTurn3 = [
    ...history,
    { rol: "user", texto: "Hay que pintar una fachada en las condes, es un muro de 2 metros de alto por 5 de largo" },
    { rol: "model", texto: "Para cotizar la pintura de la fachada en Las Condes, necesito saber qué tipo de pintura o terminación buscas y si el muro requiere preparación o reparación previa." },
  ];
  const turn3 = chatGenerationRequest(
    historyTurn3,
    "Es latex sintético y el muro necesita preparación previa",
    {},
  );
  assert.equal(turn3.mode, "quote", "El tercer turno de cotización debe seguir en modo quote para emitir el presupuesto");

  const midQuoteButtons = buildWhatsAppInteractivePayload(
    { respuesta: "¿Qué trabajo necesitas cotizar y cuáles son sus dimensiones y comuna?", acciones: {} },
    { role: "admin" },
  );
  assert.equal(midQuoteButtons.kind, "buttons");
  assert.deepEqual(midQuoteButtons.buttons.map((b) => b.id), ["ot:quote:standard", "ot:menu:open"]);
});

test("buildWhatsAppInteractivePayload cubre menú de obra por rol, foto ambigua y acciones contextuales", () => {
  // Menú al elegir obra para admin -> lista de 6 acciones
  const adminMenu = buildWhatsAppInteractivePayload({}, { role: "admin", selectedProjectMenu: true });
  assert.equal(adminMenu.kind, "list");
  assert.equal(adminMenu.rows.length, 6);
  for (const r of adminMenu.rows) {
    assert.ok(r.title.length <= 24);
    assert.ok((r.description || "").length <= 72);
  }

  // Menú al elegir obra para terreno -> 3 botones
  const workerMenu = buildWhatsAppInteractivePayload({}, { role: "terreno", selectedProjectMenu: true });
  assert.equal(workerMenu.kind, "buttons");
  assert.deepEqual(workerMenu.buttons.map((b) => b.id), ["ot:act:progress", "ot:act:incident", "ot:act:gantt"]);

  // Foto sin texto -> 3 botones de clasificación
  const photoMenu = buildWhatsAppInteractivePayload({}, { role: "terreno", ambiguousPhoto: true });
  assert.equal(photoMenu.kind, "buttons");
  assert.deepEqual(photoMenu.buttons.map((b) => b.id), ["ot:photo:progress", "ot:photo:incident", "ot:photo:doc"]);

  // Avance registrado por admin -> botones Cierre diario PDF / Ver pendientes
  const afterProgress = buildWhatsAppInteractivePayload(
    { acciones: { tipo: "actualizar_avance", proyecto_contexto_id: "p-1" } },
    { role: "admin" },
  );
  assert.equal(afterProgress.kind, "buttons");
  assert.deepEqual(afterProgress.buttons.map((b) => b.id), ["ot:act:close", "ot:act:gantt"]);

  // Consulta de asistencia por admin -> Todos presentes / Ver partidas
  const afterAttendance = buildWhatsAppInteractivePayload(
    { acciones: { proyecto_contexto_id: "p-1" } },
    { role: "admin", userText: "Muéstrame la asistencia de hoy" },
  );
  assert.equal(afterAttendance.kind, "buttons");
  assert.deepEqual(afterAttendance.buttons.map((b) => b.id), ["ot:act:attendance_all", "ot:act:gantt"]);

  // Consulta de materiales pendientes -> Buscar precios / Ver saldo
  const afterMaterials = buildWhatsAppInteractivePayload(
    { acciones: { proyecto_contexto_id: "p-1" } },
    { role: "admin", userText: "¿Qué materiales faltan por comprar?" },
  );
  assert.equal(afterMaterials.kind, "buttons");
  assert.deepEqual(afterMaterials.buttons.map((b) => b.id), ["ot:act:compare", "ot:act:balance"]);
});

test("buildWhatsAppInteractivePayload genera botones/listas válidos dentro de los límites estrictos de Meta Cloud API", () => {
  // 1. Seguimiento de cuadrilla
  const team = buildWhatsAppInteractivePayload({
    acciones: { borrador_registro: { asignacion: { nombres: [], proyecto_id: "p-1" } } },
  });
  assert.equal(team.kind, "buttons");
  assert.deepEqual(team.buttons.map((b) => b.id), ["ot:team:assign", "ot:team:skip"]);

  // 2. Borrador de obra listo para confirmar
  const draft = buildWhatsAppInteractivePayload({
    borrador_obra: { nombre: "Radier Maipú" },
    respuesta: "Resumen listo. ¿Confirmas la creación de la obra?",
  });
  assert.equal(draft.kind, "buttons");
  assert.deepEqual(draft.buttons.map((b) => b.id), ["ot:draft:confirm", "ot:draft:cancel"]);

  // 3. Cotización nueva
  const quote = buildWhatsAppInteractivePayload({
    cotizacion: { id: "q-1", titulo_proyecto: "Quincho" },
    acciones: {},
  });
  assert.equal(quote.kind, "buttons");
  assert.equal(quote.buttons.length, 3);
  for (const b of quote.buttons) assert.ok(b.title.length <= 20, `Título supera 20 chars: ${b.title}`);

  // 4. Lista de obras (recorta títulos > 24 chars y descarta canceladas)
  const projects = Array.from({ length: 12 }, (_, i) => ({
    id: `p-${i}`,
    nombre: `Proyecto Muy Largo Número ${i + 1} en Santiago`,
    estado: i === 11 ? "cancelado" : "activo",
    comuna: "Providencia",
  }));
  const listPayload = buildWhatsAppInteractivePayload({}, { projects, showProjectList: true });
  assert.equal(listPayload.kind, "list");
  assert.equal(listPayload.rows.length, 10);
  for (const r of listPayload.rows) {
    assert.ok(r.title.length <= 24, `Row title supera 24 chars: ${r.title}`);
    assert.ok((r.description || "").length <= 72);
  }

  // Verificar payload JSON exacto para Meta (conservando saltos de línea y viñetas en body.text)
  const multiline = "Para crear la obra falta:\n• Nombre del cliente\n• Nombre de la obra\n\nPuedes responder estos datos juntos.";
  const metaBtn = buildMetaInteractiveRequestBody("56912345678", quote, multiline);
  assert.equal(metaBtn.type, "interactive");
  assert.equal(metaBtn.interactive.type, "button");
  assert.equal(metaBtn.interactive.body.text, multiline);
  assert.equal(metaBtn.interactive.action.buttons.length, 3);

  const metaList = buildMetaInteractiveRequestBody("56912345678", listPayload);
  assert.equal(metaList.type, "interactive");
  assert.equal(metaList.interactive.type, "list");
  assert.equal(metaList.interactive.action.sections[0].rows.length, 10);
});

test("webhook envía mensaje interactivo único si cabe en 1024 chars, y texto + tarjeta interactiva si la cotización es larga", async () => {
  const prevEnv = { ...process.env };
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify-tok";
  process.env.WHATSAPP_APP_SECRET = "app-secret";
  process.env.WHATSAPP_CLOUD_API_ACCESS_TOKEN = "access-tok";
  process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID = "123456";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.OPENAI_API_KEY = "openai-key";

  const makeSignedRequest = (msg) => {
    const raw = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: { metadata: { phone_number_id: "123456" }, messages: [msg] } }] }],
    });
    const sig = `sha256=${createHmac("sha256", "app-secret").update(raw).digest("hex")}`;
    return new NextRequest("https://obratrack.test/api/whatsapp/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": sig },
      body: raw,
    });
  };

  try {
    // Caso A: respuesta corta (<= 1024 chars) con botones -> 1 envío interactivo, 0 envíos de texto plano.
    const sentTextA = [];
    const sentInteractiveA = [];
    const webhookA = createWhatsAppWebhook({
      client: () => ({
        rpc: async () => ({ data: { claimed: true }, error: null }),
        from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
      }),
      process: async () => ({
        persistido: true,
        empresa_id: "e1",
        actor_id: "u1",
        respuesta: "Obra creada. ¿Quieres asignar cuadrilla?",
        interactive: {
          kind: "buttons",
          body: "¿Quieres asignar cuadrilla?",
          buttons: [
            { id: "ot:team:assign", title: "Asignar cuadrilla" },
            { id: "ot:team:skip", title: "Ahora no" },
          ],
        },
      }),
      send: async (to, text) => sentTextA.push({ to, text }),
      sendInteractive: async (to, payload, override) => sentInteractiveA.push({ to, payload, override }),
    });

    const resA = await webhookA(makeSignedRequest({ id: "m-short", from: "56911112222", type: "text", text: { body: "Crear obra" } }));
    assert.equal(resA.status, 200);
    assert.equal(sentTextA.length, 0);
    assert.equal(sentInteractiveA.length, 1);
    assert.equal(sentInteractiveA[0].override, "Obra creada. ¿Quieres asignar cuadrilla?");

    // Caso B: cotización larga (> 1024 chars) -> texto completo vía send + tarjeta interactiva corta vía sendInteractive.
    const sentTextB = [];
    const sentInteractiveB = [];
    const longQuote = "Detalle de cotización ".repeat(80);
    const webhookB = createWhatsAppWebhook({
      client: () => ({
        rpc: async () => ({ data: { claimed: true }, error: null }),
        from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
      }),
      process: async () => ({
        persistido: true,
        empresa_id: "e1",
        actor_id: "u1",
        respuesta: longQuote,
        cotizacion: { id: "q-1" },
        interactive: {
          kind: "buttons",
          body: "¿Qué quieres hacer con esta cotización?",
          buttons: [
            { id: "ot:quote:create", title: "Crear obra" },
            { id: "ot:quote:compare", title: "Ver precios retail" },
          ],
        },
      }),
      send: async (to, text) => sentTextB.push({ to, text }),
      sendInteractive: async (to, payload, override) => sentInteractiveB.push({ to, payload, override }),
    });

    const resB = await webhookB(makeSignedRequest({ id: "m-long", from: "56911112222", type: "text", text: { body: "Cotiza radier" } }));
    assert.equal(resB.status, 200);
    assert.ok(sentTextB.length >= 1);
    assert.equal(sentInteractiveB.length, 1);
    assert.equal(sentInteractiveB[0].override, undefined);
  } finally {
    for (const k of Object.keys(process.env)) {
      if (!(k in prevEnv)) delete process.env[k];
    }
    Object.assign(process.env, prevEnv);
  }
});
