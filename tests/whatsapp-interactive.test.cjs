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

  // Avance registrado por admin -> botones Cierre diario PDF / Ver pendientes / Más acciones
  const afterProgress = buildWhatsAppInteractivePayload(
    { acciones: { tipo: "actualizar_avance", proyecto_contexto_id: "p-1" } },
    { role: "admin" },
  );
  assert.equal(afterProgress.kind, "buttons");
  assert.deepEqual(afterProgress.buttons.map((b) => b.id), ["ot:act:close", "ot:act:gantt", "ot:act:menu"]);

  // Consulta de asistencia por admin -> Todos presentes / Ver partidas / Más acciones
  const afterAttendance = buildWhatsAppInteractivePayload(
    { acciones: { proyecto_contexto_id: "p-1" } },
    { role: "admin", userText: "Muéstrame la asistencia de hoy" },
  );
  assert.equal(afterAttendance.kind, "buttons");
  assert.deepEqual(afterAttendance.buttons.map((b) => b.id), ["ot:act:attendance_all", "ot:act:gantt", "ot:act:menu"]);

  // Consulta de materiales pendientes -> Buscar precios / Marcar comprado / Más acciones
  const afterMaterials = buildWhatsAppInteractivePayload(
    { acciones: { proyecto_contexto_id: "p-1" } },
    { role: "admin", userText: "¿Qué materiales faltan por comprar?" },
  );
  assert.equal(afterMaterials.kind, "buttons");
  assert.deepEqual(afterMaterials.buttons.map((b) => b.id), ["ot:act:compare", "ot:act:mat_bought", "ot:act:menu"]);

  // Alternativas de cotización -> botones directos Opción 1 / Opción 2
  const withAlts = buildWhatsAppInteractivePayload(
    {
      cotizacion: {
        id: "q-1",
        nombre_alternativa: "Estándar",
        alternativas: [{ id: "q-2", nombre_alternativa: "Premium" }],
      },
      acciones: {},
    },
    { role: "admin" },
  );
  assert.equal(withAlts.kind, "buttons");
  assert.deepEqual(withAlts.buttons.map((b) => b.id), ["ot:alt:1", "ot:alt:2"]);

  // Cotización pactada pidiendo IVA -> botones IVA incluido / Más IVA / Menú
  const agreedIva = buildWhatsAppInteractivePayload(
    { respuesta: "Perfecto, preparemos una cotización pactada. Indícame el precio y si incluye IVA.", acciones: {} },
    { role: "admin" },
  );
  assert.equal(agreedIva.kind, "buttons");
  assert.deepEqual(agreedIva.buttons.map((b) => b.id), ["ot:agreed:iva_inc", "ot:agreed:iva_net", "ot:menu:open"]);

  // Selección de trabajador por lista cuando pide nombres
  const workerPicker = buildWhatsAppInteractivePayload(
    {
      respuesta: "¿A quiénes quieres añadir? Indica los nombres de los trabajadores.",
      acciones: { borrador_registro: { asignacion: { nombres: [], proyecto_id: "p-1" } } },
    },
    { role: "admin", workers: [{ id: "u-w1", nombre: "Nicolás Paredes", rol: "terreno" }] },
  );
  assert.equal(workerPicker.kind, "list");
  assert.equal(workerPicker.rows[0].id, "ot:worker:u-w1");

  // Comparador de precios -> Buscar otro / Hacer cotización / Menú principal
  const afterPrices = buildWhatsAppInteractivePayload(
    { comparacion_materiales: { ofertas: [] }, acciones: {} },
    { role: "admin" },
  );
  assert.equal(afterPrices.kind, "buttons");
  assert.deepEqual(afterPrices.buttons.map((b) => b.id), ["ot:menu:prices", "ot:menu:quote", "ot:menu:open"]);

  // Finanzas / saldo -> Registrar pago / Ver partidas / Más acciones
  const afterBalance = buildWhatsAppInteractivePayload(
    { acciones: { proyecto_contexto_id: "p-1" } },
    { role: "admin", userText: "¿Cuál es el saldo por cobrar?" },
  );
  assert.equal(afterBalance.kind, "buttons");
  assert.deepEqual(afterBalance.buttons.map((b) => b.id), ["ot:act:pay_prompt", "ot:act:gantt", "ot:act:menu"]);
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
    message_id: "wamid.cot",
    cotizacion: { id: "q-1", titulo_proyecto: "Quincho" },
    acciones: {},
  });
  assert.equal(quote.kind, "buttons");
  assert.deepEqual(quote.buttons.map(b => b.title), ["Crear obra", "Generar PDF"]);
  assert.equal(quote.buttons[1].id, "ot:quote:pdf:wamid.cot");
  for (const b of quote.buttons) assert.ok(b.title.length <= 20, `Título supera 20 chars: ${b.title}`);

  const approvedId = "35e18dcb-fab1-403b-95b9-21834d98aef1";
  const approvedCard = buildWhatsAppInteractivePayload({
    message_id: "wamid.approved", acciones: { cotizacion_aprobada_id: approvedId, rol_actor: "admin" },
  });
  assert.deepEqual(approvedCard.buttons.map(b => b.title), ["Crear obra", "Generar PDF"]);
  assert.equal(parseWhatsAppInteractiveReply({ type: "interactive", interactive: { type: "button_reply", button_reply: approvedCard.buttons[0] } }),
    "Crea la obra con la cotización " + approvedId);
  const supervisorCard = buildWhatsAppInteractivePayload({ message_id: "wamid.cot", cotizacion: { id: "q-1" } }, { role: "supervisor" });
  assert.deepEqual(supervisorCard.buttons.map(b => b.title), ["Crear obra"]);

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

test("tocar [Crear obra] con context.id saliente de Meta o responder 'La que recién me diste' usa la última cotización sin caer en modo quote", async () => {
  const { processPersonalMessage } = require("../lib/whatsapp/assistant.ts");
  const { normalizeQuote } = require("../lib/ai/protocol.ts");
  const delivery = require("./helpers/reply-delivery.cjs")();

  const quote = normalizeQuote({
    id: "q-pintura-lc",
    titulo_proyecto: "Pintura de pieza 2 × 3 m",
    comuna_region: "Las Condes",
    duracion_dias_estimada: 2,
    materiales: [{ nombre: "Látex blanco", cantidad: 1, unidad: "galón", precio_unitario_estimado: 24990 }],
    mano_de_obra: [{ rol: "Pintor", cantidad_personas: 1, dias_estimados: 2, valor_jornal_diario: 45000 }],
    actividades_gantt: [{ nombre: "Preparación y pintura", dias: 2 }],
  });

  const makeSb = (messages) => {
    const db = {
      usuarios: [{ id: "u-admin", empresa_id: "e-1", nombre: "Jorge", rol: "admin", telefono_whatsapp: "+56 9 1234 5678", email: "jorge@test.cl" }],
      empresas: [{ id: "e-1", plan_id: "pro_ia" }],
      presupuestos: [{ id: quote.id, empresa_id: "e-1", cotizacion: quote, estado: "borrador", proyecto_id: null }],
      whatsapp_mensajes: messages,
      proyectos: [],
      clientes: [],
    };
    return {
      db,
      from(table) {
        let preds = [], max = Infinity, offset = 0, single = false;
        const q = {
          select: () => q,
          eq: (k, v) => { preds.push((x) => x[k] === v); return q; },
          in: (k, v) => { preds.push((x) => v.includes(x[k])); return q; },
          order: () => q,
          limit: (n) => { max = n; return q; },
          range: (s, e) => { offset = s; max = e - s + 1; return q; },
          maybeSingle: () => { single = true; return q; },
          then: (res, rej) => {
            const rows = (db[table] || []).filter((x) => preds.every((p) => p(x))).slice(offset, offset + max);
            return Promise.resolve({ data: single ? rows[0] || null : rows }).then(res, rej);
          },
        };
        return q;
      },
      async rpc(name, p) {
        if (name.startsWith("whatsapp_reservar_respuesta") || name === "whatsapp_finalizar_respuesta") return delivery(name, p);
        const row = {
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
        return { data: row };
      },
    };
  };

  // 1) Tocar el botón interactivo [🏗️ Crear obra] cuando Meta envía context.id apuntando al WAMID saliente de la tarjeta
  const sbButton = makeSb([
    {
      message_id: "wamid.user-inbound-quote",
      empresa_id: "e-1",
      actor_id: "u-admin",
      texto: "Sin grietas, es pintura interior de una pieza en Las Condes de 2 x 3",
      respuesta: "📋 *Pintura de pieza 2 × 3 m*",
      cotizacion: quote,
    },
  ]);

  const btnResult = await processPersonalMessage(
    sbButton,
    {
      id: "wamid.tap-create-btn",
      from: "56912345678",
      type: "interactive",
      context: { from: "56900000000", id: "wamid.outbound-interactive-card-id" },
      interactive: { type: "button_reply", button_reply: { id: "ot:quote:create", title: "🏗️ Crear obra" } },
    },
    { chat: async () => { throw new Error("No debe invocar al modelo al iniciar el borrador desde la cotización"); } },
  );

  assert.doesNotMatch(btnResult.respuesta, /Qué cotización quieres usar/i);
  assert.match(btnResult.respuesta, /Nombre del cliente/);
  assert.equal(sbButton.db.whatsapp_mensajes[0].borrador_obra.presupuesto_cotizacion_id, quote.id);
  assert.equal(sbButton.db.whatsapp_mensajes[0].borrador_obra.nombre, "Pintura de pieza 2 × 3 m");

  // 2) Si el usuario escribe "La que recién me diste" tras una pregunta intermedia, recupera la cotización reciente
  const sbFollowUp = makeSb([
    {
      message_id: "wamid.question-which",
      empresa_id: "e-1",
      actor_id: "u-admin",
      texto: "Crea la obra con esta cotización",
      respuesta: "¿Qué cotización quieres usar? Responde al mensaje de esa cotización o indícala en ObraTrack; no crearé una obra con un presupuesto distinto.",
      cotizacion: null,
    },
    {
      message_id: "wamid.user-inbound-quote",
      empresa_id: "e-1",
      actor_id: "u-admin",
      texto: "Pintura de una pieza en Las Condes de 2 x 3",
      respuesta: "📋 *Pintura de pieza 2 × 3 m*",
      cotizacion: quote,
    },
  ]);

  const recentResult = await processPersonalMessage(
    sbFollowUp,
    {
      id: "wamid.la-que-recien-me-diste",
      from: "56912345678",
      type: "text",
      text: { body: "La que recién me diste" },
    },
    { chat: async () => { throw new Error("Debe iniciar el borrador de la obra con la cotización reciente sin llamar al modelo"); } },
  );

  assert.match(recentResult.respuesta, /Nombre del cliente/);
  assert.equal(sbFollowUp.db.whatsapp_mensajes[0].borrador_obra.presupuesto_cotizacion_id, quote.id);

  // 3) No adjuntar botón [⚡ Cotizar estándar] a "¿Qué cotización quieres usar?" ni activar modo quote en "La que recién me diste"
  const noQuoteStdButtons = buildWhatsAppInteractivePayload(
    {
      respuesta: "¿Qué cotización quieres usar? Responde al mensaje de esa cotización o indícala en ObraTrack; no crearé una obra con un presupuesto distinto.",
      acciones: {},
    },
    { role: "admin" },
  );
  assert.equal(noQuoteStdButtons, null);

  const reqCheck = chatGenerationRequest(
    [
      { rol: "user", texto: "Quisiera cotizar pintura pieza 2x3 Las Condes" },
      { rol: "model", texto: "¿Qué cotización quieres usar? Responde al mensaje de esa cotización o indícala en ObraTrack; no crearé una obra con un presupuesto distinto." },
    ],
    "La que recién me diste",
    {},
  );
  assert.equal(reqCheck.mode, "chat");
});

test("crear una cotización para una obra ya existente sin cotización, gantt ni trabajadores entra a modo quote, muestra [Aplicar a la obra] y la carga directo en la obra", async () => {
  const { processPersonalMessage } = require("../lib/whatsapp/assistant.ts");
  const { isQuoteRequest, requestsPlatformAction } = require("../lib/ai/prompt.ts");
  const { normalizeQuote } = require("../lib/ai/protocol.ts");
  const delivery = require("./helpers/reply-delivery.cjs")();

  const promptText = "Crea una cotización para la obra Bodega Maipú que no tiene cotización, gantt, ni trabajadores, nada asociado";
  assert.equal(requestsPlatformAction(promptText), false);
  assert.equal(isQuoteRequest(promptText), true);
  assert.equal(chatGenerationRequest([], promptText, {}).mode, "quote");

  const quote = normalizeQuote({
    id: "q-bodega-maipu",
    titulo_proyecto: "Bodega Maipú",
    comuna_region: "Maipú",
    duracion_dias_estimada: 4,
    materiales: [
      { nombre: "Plancha Zincalum", cantidad: 10, unidad: "un", precio_unitario_estimado: 12000 },
      { nombre: "Perfil metálico", cantidad: 6, unidad: "un", precio_unitario_estimado: 15000 },
    ],
    mano_de_obra: [{ rol: "Maestro carpintero", cantidad_personas: 1, dias_estimados: 4, valor_jornal_diario: 50000 }],
    actividades_gantt: [
      { nombre: "Estructura metálica", dias: 2 },
      { nombre: "Revestimiento y cubierta", dias: 2 },
    ],
  });

  const existingProject = {
    id: "p-bodega",
    empresa_id: "e-1",
    nombre: "Bodega Maipú",
    comuna: "Maipú",
    estado: "activo",
    fecha_inicio: "2026-11-20",
    fecha_termino_estimada: "2026-11-30",
    monto_cotizado: 0,
  };

  const db = {
    usuarios: [{ id: "u-admin", empresa_id: "e-1", nombre: "Jorge", rol: "admin", telefono_whatsapp: "+56 9 1234 5678", email: "jorge@test.cl" }],
    empresas: [{ id: "e-1", plan_id: "pro_ia" }],
    presupuestos: [],
    whatsapp_mensajes: [],
    proyectos: [existingProject],
    proyecto_trabajadores: [],
    actividades: [],
    materiales_proyecto: [],
    clientes: [],
  };

  let lastRpc = null;
  const sb = {
    db,
    from(table) {
      let preds = [], max = Infinity, offset = 0, single = false;
      const q = {
        select: () => q,
        eq: (k, v) => { preds.push((x) => k.includes("->>") ? x[k.split("->>")[0]]?.[k.split("->>")[1]] === v : x[k] === v); return q; },
        in: (k, v) => { preds.push((x) => v.includes(x[k])); return q; },
        order: () => q,
        limit: (n) => { max = n; return q; },
        range: (s, e) => { offset = s; max = e - s + 1; return q; },
        maybeSingle: () => { single = true; return q; },
        then: (res, rej) => {
          const rows = (db[table] || []).filter((x) => preds.every((p) => p(x))).slice(offset, offset + max);
          return Promise.resolve({ data: single ? rows[0] || null : rows }).then(res, rej);
        },
      };
      return q;
    },
    async rpc(name, p) {
      if (name.startsWith("whatsapp_reservar_respuesta") || name === "whatsapp_finalizar_respuesta") return delivery(name, p);
      lastRpc = p;
      if (p.p_cotizacion) {
        db.presupuestos.unshift({
          id: `wa:${p.p_id}`,
          empresa_id: p.p_empresa,
          cotizacion: p.p_cotizacion,
          estado: "borrador",
          proyecto_id: null,
        });
      }
      const row = {
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
      return { data: row };
    },
  };

  // Turno 1: Pedir cotización para la obra existente Bodega Maipú
  const turn1 = await processPersonalMessage(
    sb,
    { id: "wamid.quote-existing-1", from: "56912345678", type: "text", text: { body: promptText } },
    { chat: async () => ({ respuesta: "Cotización lista.", accion: null, cotizacion: quote }) },
  );

  assert.equal(turn1.cotizacion.proyecto_objetivo_id, "p-bodega");
  assert.equal(turn1.interactive.kind, "buttons");
  assert.deepEqual(
    turn1.interactive.buttons.map((b) => b.id),
    ["ot:quote:apply", "ot:quote:pdf:wamid.quote-existing-1"],
  );

  // Turno 2: Tocar [✅ Aplicar a la obra] aplica presupuesto, Gantt y materiales a la obra existente y ofrece asignar cuadrilla
  const turn2 = await processPersonalMessage(
    sb,
    {
      id: "wamid.apply-existing-2",
      from: "56912345678",
      type: "interactive",
      context: { from: "56900000000", id: "wamid.outbound-card" },
      interactive: { type: "button_reply", button_reply: { id: "ot:quote:apply", title: "✅ Aplicar a la obra" } },
    },
    { chat: async () => { throw new Error("Debe aplicar la cotización directamente sin llamar al modelo"); } },
  );

  assert.match(turn2.respuesta, /Apliqué la cotización a «Bodega Maipú»/);
  assert.match(turn2.respuesta, /2 partidas en la Carta Gantt/);
  assert.match(turn2.respuesta, /2 materiales/);
  assert.match(turn2.respuesta, /¿Quieres añadir trabajadores o jefes de obra/);
  assert.equal(lastRpc.p_changed.proyectos.length, 1);
  assert.equal(lastRpc.p_changed.proyectos[0].id, "p-bodega");
  assert.equal(lastRpc.p_changed.proyectos[0].monto_cotizado, quote.estructura_financiera.precio_total_con_iva);
  assert.equal(lastRpc.p_changed.actividades.length, 2);
  assert.equal(lastRpc.p_changed.materiales_proyecto.length, 2);
  assert.equal(lastRpc.p_acciones.presupuesto_cotizacion_id, quote.id);
  assert.equal(lastRpc.p_acciones.presupuesto_proyecto_id, "p-bodega");
  assert.deepEqual(turn2.interactive.buttons.map((b) => b.id), ["ot:team:assign", "ot:team:skip"]);
});
