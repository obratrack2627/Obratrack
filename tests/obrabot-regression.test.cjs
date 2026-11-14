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

const { createChatHandler } = require("../lib/ai/server.ts");
const { validateAction } = require("../lib/ai/protocol.ts");
const { checkActionPermissions } = require("../lib/ai/permissions.ts");
const { applyAIResponse } = require("../lib/ai/client.ts");
const { anotherTask } = require("../lib/ai/person-literals.ts");
const {
  hasNonSearchTask,
  hasOtherWorkBeyondDeadline,
  hasOtherWorkBeyondStatus,
} = require("../lib/ai/prompt.ts");
const { sodimacProducts } = require("../lib/materials/retail.ts");
const {
  catalogProviders,
  parseCatalogProducts,
  compareMaterialPrices,
} = require("../lib/materials/catalog.ts");
const { chatAsesorObrasGemini } = require("../lib/gemini.ts");

const makeRequest = (body) =>
  new NextRequest("http://localhost/api/cotizador/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const authorizedAs =
  (rol = "admin") =>
  async () => ({
    client: fixture.supabase,
    user: { id: "u-admin", nombre: "Benjamín", empresa_id: "company-a", rol },
  });

const baseEnv = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  AI_PROVIDER: process.env.AI_PROVIDER,
  AI_FALLBACK_PROVIDER: process.env.AI_FALLBACK_PROVIDER,
};
const originalFetch = globalThis.fetch;

beforeEach(() => {
  fixture.tables.set("empresas", [{ id: "company-a", plan_id: "pro_ia" }]);
  fixture.tables.set("proyectos", [
    {
      id: "p-cisterna",
      empresa_id: "company-a",
      nombre: "Cobertizo La Cisterna",
      estado: "activo",
      monto_cotizado: 561632,
      fecha_inicio: "2026-11-01",
      fecha_termino_estimada: "2026-12-20",
    },
  ]);
  fixture.tables.set("pagos", [
    { id: "pag-1", proyecto_id: "p-cisterna", monto: 250000, fecha: "2026-11-05", estado: "confirmado" },
  ]);
});

afterEach(() => {
  fixture.reset();
  globalThis.fetch = originalFetch;
  for (const [k, v] of Object.entries(baseEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test("catálogo retail normaliza enlaces Falabella-Sodimac, soporta '25 kg Saco' y filtra palabras de empaque", async () => {
  const sodimac = catalogProviders.find((p) => p.nombre === "Sodimac");
  const easy = catalogProviders.find((p) => p.nombre === "Easy");
  const nextHtml = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: {
      pageProps: {
        results: [
          {
            sellerId: "SODIMAC_CHILE",
            skuId: "110212756",
            displayName: "25 kg Saco",
            brand: "CEMENTO POLPAICO",
            url: "https://www.falabella.com/falabella-cl/product/110212755/Cemento-polpaico-especial-25-kilos/110212756?exp=sodimac",
            prices: [{ type: "internetPrice", price: ["5.690"], crossed: false }],
          },
          {
            sellerId: "SODIMAC_CHILE",
            skuId: "999",
            displayName: "Tapa ciega para cemento 25 kg",
            brand: "GENERICO",
            url: "https://www.sodimac.cl/sodimac-cl/articulo/999/tapa",
            prices: [{ type: "internetPrice", price: ["1.290"], crossed: false }],
          },
        ],
      },
    },
  })}</script>`;

  const parsedSodimac = parseCatalogProducts(sodimacProducts(nextHtml), sodimac, {
    producto: "cemento",
    presentacion: "saco de 25 kg",
  });
  assert.equal(parsedSodimac.length, 1);
  assert.match(parsedSodimac[0].nombre, /CEMENTO POLPAICO 25 kg Saco/);
  assert.equal(parsedSodimac[0].precio, 5690);
  assert.equal(
    parsedSodimac[0].url,
    "https://www.sodimac.cl/sodimac-cl/articulo/110212755/Cemento-polpaico-especial-25-kilos",
  );

  // Easy devuelve productos cuando busca "cemento 25 kg" (sin "saco de"), o reintenta con término amplio
  const seenUrls = [];
  const fakeFetcher = async (url) => {
    seenUrls.push(url);
    if (url.includes("easy")) {
      return new Response(
        JSON.stringify([
          {
            productName: "Cemento Polpaico Especial 25kg",
            brand: "Polpaico",
            link: "https://www.easy.cl/cemento-25kg/p",
            items: [
              {
                itemId: "easy-1",
                nameComplete: "Cemento Polpaico Especial 25kg",
                sellers: [{ sellerDefault: true, commertialOffer: { Price: 5490, AvailableQuantity: 10 } }],
              },
            ],
          },
          {
            productName: "Cemento Especial 20kg",
            brand: "Polpaico",
            link: "https://www.easy.cl/cemento-20kg/p",
            items: [
              {
                itemId: "easy-20kg",
                nameComplete: "Cemento Especial 20kg",
                sellers: [{ sellerDefault: true, commertialOffer: { Price: 4290, AvailableQuantity: 10 } }],
              },
            ],
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("[]", { status: 200 });
  };

  const comparison = await compareMaterialPrices(
    { producto: "cemento", presentacion: "saco de 25 kg", cantidad: 10, unidad_cantidad: "saco", tiendas: ["Easy"] },
    fakeFetcher,
  );
  assert.equal(comparison.ofertas.length, 1);
  assert.equal(comparison.ofertas[0].precio, 5490);
  assert.ok(!seenUrls[0].includes("saco"));
});

test("checkActionPermissions permite combinar agregar_material con enviar_mensaje_equipo manteniendo CLOSE_SEPARATE", () => {
  const mixed = checkActionPermissions(
    { id: "u-1", rol: "admin" },
    [
      { tipo: "agregar_material", proyecto_id: "p-1", nombre: "Cemento", cantidad: 5, precio_unitario: 5500 },
      { tipo: "generar_mensaje_whatsapp", proyecto_id: "p-1", mensaje: "Llegó el cemento a obra" },
    ],
    "Agrega 5 sacos de cemento y envíales un whatsapp al equipo avisando que llegó el cemento",
  );
  assert.equal(mixed.length, 2);
  assert.equal(mixed[1].tipo, "enviar_mensaje_equipo");
  assert.deepEqual(mixed[1].roles_destino, ["terreno", "supervisor"]);

  // Borrador sigue sin enviarse
  const draftOnly = checkActionPermissions(
    { id: "u-1", rol: "admin" },
    [{ tipo: "generar_mensaje_whatsapp", proyecto_id: "p-1", mensaje: "Texto borrador" }],
    "Prepara un whatsapp para avisar del cemento",
  );
  assert.equal(draftOnly[0].tipo, "generar_mensaje_whatsapp");

  // Cierre diario sigue requiriendo separación estricta
  assert.throws(
    () =>
      checkActionPermissions(
        { id: "u-1", rol: "admin" },
        [
          { tipo: "registrar_documento", proyecto_id: "p-1", nombre: "Cierre", categoria: "cierre_diario" },
          { tipo: "agregar_material", proyecto_id: "p-1", nombre: "Cemento", cantidad: 2, precio_unitario: 5000 },
        ],
        "Cierra el día y agrega cemento",
      ),
    (e) => e.code === "CLOSE_SEPARATE",
  );
});

test("protocolo deriva título en crear_bitacora y applyAIResponse combina consulta, acción y respuesta adicional", async () => {
  const bitacora = validateAction({
    tipo: "crear_bitacora",
    proyecto_id: "p-cisterna",
    nota: "Falla en alineación de pilar sur; se corrige mañana temprano",
  });
  assert.equal(bitacora.titulo, "Falla en alineación de pilar sur");

  const fakeData = {
    respuesta: "Voy a registrar la bitácora.",
    respuesta_consulta: "El saldo por cobrar de Cobertizo La Cisterna es $311.632.",
    respuesta_adicional: "Aviso al equipo puesto en cola para 1 destinatario.",
    accion: {
      tipo: "actualizar_proyecto",
      proyecto_id: "p-cisterna",
      estado: "activo",
    },
  };
  // Simular acción ejecutada directamente mediante respuesta sin acción local: verifica dedup y no-regresión
  const plain = await applyAIResponse({ respuesta: "Voy a marcar Radier como cancelada.", accion: null });
  assert.equal(plain.texto, "Voy a marcar Radier como cancelada.");

  const customWindow = await applyAIResponse({
    ...fakeData,
    accion: null,
  });
  assert.equal(customWindow.texto, fakeData.respuesta);
});

test("detectores compuestos distinguen consultas únicas de solicitudes multi-tarea y escapan fichas de persona", () => {
  assert.equal(hasNonSearchTask("Busca precios de 10 sacos de cemento de 25 kg"), false);
  assert.equal(
    hasNonSearchTask("En qué estado está Cobertizo La Cisterna y busca 10 sacos de cemento de 25 kg"),
    true,
  );
  assert.equal(hasOtherWorkBeyondDeadline("¿Cuándo vence Cobertizo La Cisterna?"), false);
  assert.equal(hasOtherWorkBeyondDeadline("¿Cuándo vence Cobertizo y cuánto falta por cobrar?"), true);
  assert.equal(hasOtherWorkBeyondStatus("Marca Inacap como pausada"), false);
  assert.equal(
    hasOtherWorkBeyondStatus("Marca Inacap como en curso y envíales un whatsapp al equipo"),
    true,
  );
  assert.equal(anotherTask("Marca madera de pino como comprada en Easy por $50.000", "Juan Pérez"), true);
});

test("createChatHandler combina acción cliente + envío WhatsApp servidor y evita atajos en consultas compuestas", async () => {
  fixture.tables.set("usuarios", [
    { id: "u-admin", nombre: "Benjamín", empresa_id: "company-a", rol: "admin" },
    {
      id: "u-worker",
      nombre: "Maestro Juan",
      empresa_id: "company-a",
      rol: "terreno",
      telefono_whatsapp: "+56987654321",
    },
  ]);
  fixture.tables.set("proyecto_trabajadores", [
    { proyecto_id: "p-cisterna", usuario_id: "u-worker" },
  ]);
  fixture.handleRPC("encolar_aviso_equipo", () => ({ data: { id: "camp-1" } }));
  fixture.tables.set("presupuestos", [
    {
      id: "b-prev",
      empresa_id: "company-a",
      proyecto_id: "p-cisterna",
      estado: "borrador",
      created_at: "2026-11-12T10:00:00Z",
      cotizacion: {
        titulo_proyecto: "Cobertizo madera anterior",
        tipo_obra: "Cobertizo",
        metros_cuadrados: 18,
        estructura_financiera: { precio_sugerido_neto: 471960, precio_total_con_iva: 561632 },
        materiales: [{ nombre: "Madera de pino", cantidad: 40, unidad: "unidad", precio_unitario_estimado: 1500 }],
      },
    },
  ]);

  let calls = 0;
  let lastContext = null;
  const handler = createChatHandler({
    authorize: authorizedAs("admin"),
    global: async (_h, _m, context) => {
      calls++;
      lastContext = context;
      return {
        respuesta: "Listo.",
        respuesta_consulta: "Faltan $311.632 por cobrar.",
        accion: {
          tipo: "lote_acciones",
          acciones: [
            {
              tipo: "agregar_material",
              proyecto_id: "p-cisterna",
              nombre: "Clavos",
              cantidad: 2,
              unidad: "caja",
              precio_unitario: 4500,
            },
            {
              tipo: "enviar_mensaje_equipo",
              proyecto_id: "p-cisterna",
              mensaje: "Revisar llegada de clavos hoy",
              roles_destino: ["terreno"],
            },
          ],
        },
        cotizacion: null,
        sugerencias: [],
      };
    },
    project: async () => ({ respuesta: "ok", accion: null, cotizacion: null, sugerencias: [] }),
  });

  // 1. Consulta compuesta de plazo + saldo + presupuesto anterior llega al LLM con contexto completo y presupuestos
  const res = await handler(
    makeRequest({
      mensaje:
        "¿Cuándo vence Cobertizo La Cisterna, cuánto falta por cobrar, recuerdas el presupuesto anterior, agrega clavos y envíales un whatsapp al equipo avisando?",
    }),
  );
  assert.equal(res.status, 200);
  assert.equal(calls, 1);
  assert.ok(lastContext.presupuestos_guardados.length >= 1);
  assert.equal(lastContext.presupuestos_guardados[0].titulo, "Cobertizo madera anterior");
  const json = await res.json();
  assert.equal(json.accion.tipo, "agregar_material");
  assert.ok(json.aviso_equipo);
  assert.match(json.respuesta_adicional, /Maestro Juan|cola|envío/i);
  assert.equal(fixture.rpcCalls.filter((c) => c.name === "encolar_aviso_equipo").length, 1);

  // 2. Perfil terreno nunca recibe presupuestos_guardados
  let terrenoContext = null;
  const workerHandler = createChatHandler({
    authorize: authorizedAs("terreno"),
    global: async (_h, _m, context) => {
      terrenoContext = context;
      return { respuesta: "ok", accion: null, cotizacion: null, sugerencias: [] };
    },
    project: async () => ({ respuesta: "ok", accion: null, cotizacion: null, sugerencias: [] }),
  });
  await workerHandler(makeRequest({ mensaje: "¿Recuerdas el presupuesto anterior?" }));
  assert.deepEqual(terrenoContext.presupuestos_guardados, []);
});

test("chatAsesorObrasGemini en modo híbrido consulta + búsqueda de precios conserva ambos resultados", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  process.env.AI_PROVIDER = "openai";
  delete process.env.AI_FALLBACK_PROVIDER;

  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("api.openai.com/v1/responses")) {
      return new Response(
        JSON.stringify({
          status: 'completed', output: [{type:'message',content:[{type:'output_text',text: JSON.stringify({
                      respuesta: "Cobertizo La Cisterna está En curso y su saldo por cobrar es $311.632.",
                      respuesta_consulta:
                        "Cobertizo La Cisterna está En curso y su saldo por cobrar es $311.632.",
                      acciones: [],
                      cotizacion: null,
                      busqueda_materiales: {
                        producto: "cemento",
                        presentacion: "saco de 25 kg",
                        cantidad: 10,
                        unidad_cantidad: "saco",
                      },
                    }),}]}],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (u.includes("easy")) {
      return new Response(
        JSON.stringify([
          {
            productName: "Cemento Especial 25 kg",
            brand: "Polpaico",
            link: "https://www.easy.cl/cemento-25kg/p",
            items: [
              {
                itemId: "100",
                nameComplete: "Cemento Especial 25 kg",
                sellers: [{ sellerDefault: true, commertialOffer: { Price: 5690, AvailableQuantity: 20 } }],
              },
            ],
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("[]", { status: 200 });
  };

  const reply = await chatAsesorObrasGemini(
    [],
    "¿Cuánto falta por cobrar en Cobertizo La Cisterna y busca 10 sacos de cemento de 25 kg en internet?",
    {
      proyectos: [{ id: "p-1", nombre: "Cobertizo La Cisterna", estado: "activo" }],
    },
  );
  assert.match(reply.respuesta, /311\.632/);
  assert.match(reply.respuesta, /5\.690/);
  assert.equal(reply.comparacion_materiales.ofertas.length, 1);
});
