import { test, expect, type Page } from "@playwright/test";
import { normalizeQuote } from "../lib/ai/protocol";

const ownerId = "00000000-0000-0000-0000-000000000001";
const company = "fixture-company";
const owner = {
  id: ownerId,
  auth_user_id: ownerId,
  empresa_id: company,
  nombre: "Contratista de prueba",
  email: "owner@example.test",
  rol: "admin",
  telefono_whatsapp: "",
};
async function setup(
  page: Page,
  reply: any,
  seedProject = false,
  failPayment = false,
) {
  const db: Record<string, any[]> = {};
  let failed = false;
  await page.context().addCookies([
    {
      name: "obratrack_auth_token",
      value: ownerId,
      domain: "localhost",
      path: "/",
    },
  ]);
  await page.addInitScript(
    ({ owner, company, seedProject }) => {
      localStorage.clear();
      localStorage.setItem("obratrack_active_user_v7", JSON.stringify(owner));
      localStorage.setItem(
        `obratrack_active_plan_v7_${company}`,
        JSON.stringify("pro_ia"),
      );
      localStorage.setItem(
        `obratrack_usuarios_v7_${company}`,
        JSON.stringify([owner]),
      );
      if (seedProject)
        localStorage.setItem(
          `obratrack_actividades_v7_${company}`,
          JSON.stringify([
            {
              id: "act-existing",
              proyecto_id: "p-existing",
              nombre: "Radier",
              fecha_inicio: "2026-10-27",
              fecha_termino: "2026-11-10",
              porcentaje_avance: 0,
              estado: "pendiente",
              orden: 1,
            },
          ]),
        );
      if (seedProject)
        localStorage.setItem(
          `obratrack_proyectos_v7_${company}`,
          JSON.stringify([
            {
              id: "p-existing",
              empresa_id: company,
              nombre: "Terraza",
              fecha_inicio: "2026-10-27",
              fecha_termino_estimada: "2026-11-20",
              estado: "activo",
              monto_cotizado: 3000000,
            },
          ]),
        );
      const payload = {
        sub: owner.id,
        role: "authenticated",
        aud: "authenticated",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      const token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify(payload))}.fixture`;
      localStorage.setItem(
        "sb-gaoxbkvhtdsgqxjihlrv-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "fixture-refresh",
          expires_at: payload.exp,
          expires_in: 3600,
          token_type: "bearer",
          user: {
            id: owner.id,
            email: owner.email,
            aud: "authenticated",
            role: "authenticated",
            app_metadata: {},
            user_metadata: {},
            created_at: "2026-01-01T00:00:00Z",
          },
        }),
      );
    },
    { owner, company, seedProject },
  );
  await page.route("**/api/cotizador/chat", async (route) => {
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    await route.fulfill({
      status: reply.error ? 503 : 200,
      contentType: "application/json",
      body: JSON.stringify(reply),
    });
  });
  await page.route("**/api/whatsapp/estado", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ estado: "disponible" }),
    }),
  );
  await page.route("**/api/supabase/sync*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Sincronización automática no utilizada por este test",
      }),
    }),
  );
  await page.route("**/*.supabase.co/rest/v1/**", async (route) => {
    const url = new URL(route.request().url()),
      table = url.pathname.split("/").pop()!,
      method = route.request().method();
    db[table] ||= [];
    if (table === "pagos" && method === "POST" && failPayment && !failed) {
      failed = true;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ code: "NETWORK", message: "Falló el guardado" }),
      });
      return;
    }
    let data: any[] = db[table];
    if (method === "POST") {
      const payload = route.request().postDataJSON();
      data = Array.isArray(payload) ? payload : [payload];
      for (const row of data) {
        const match = db[table].findIndex((x) =>
          row.id
            ? x.id === row.id
            : x.proyecto_id === row.proyecto_id &&
              x.usuario_id === row.usuario_id,
        );
        if (match < 0) db[table].push(row);
        else db[table][match] = row;
      }
    } else if (method === "DELETE") {
      const filters = Array.from(url.searchParams).filter(([, v]) =>
        v.startsWith("eq."),
      );
      const removed = db[table].filter((row) =>
        filters.every(([k, v]) => row[k] === v.slice(3)),
      );
      db[table] = db[table].filter((row) => !removed.includes(row));
      data = removed;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  return db;
}
async function send(page: Page, text: string) {
  // Esperar los datos cargados por React: escribir antes de hidratar puede perder el texto.
  await expect(
    page.getByText("Contratista de prueba", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Mensaje para el asistente", exact: true })
    .fill(text);
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
}

test("cotización generada se muestra en PDF con los mismos costos, IVA y cliente", async ({
  page,
}) => {
  const quote = normalizeQuote({
    titulo_proyecto: "Terraza de prueba",
    cliente_nombre: "Cliente de prueba",
    cliente_telefono: "+56912345678",
    comuna_region: "Maipú",
    condiciones_pago: "Anticipo acordado con el cliente",
    materiales: [
      { nombre: "Cemento", cantidad: 10, precio_unitario_estimado: 5000 },
    ],
    mano_de_obra: [
      {
        rol: "Maestro",
        cantidad_personas: 1,
        dias_estimados: 2,
        valor_jornal_diario: 40000,
      },
    ],
  });
  await setup(page, {
    respuesta: "Preparé la estimación para la terraza.",
    accion: null,
    cotizacion: quote,
    sugerencias: [],
  });
  await page.goto("/cotizador");
  await send(page, "Cotiza una terraza en Maipú");
  await page.getByRole("button", { name: "Ver cotización / PDF" }).click();
  const dialog = page.getByRole("dialog", { name: "Cotización generada" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Cliente de prueba");
  await expect(dialog).toContainText("Cemento");
  await expect(dialog).toContainText(
    quote.estructura_financiera.precio_total_con_iva.toLocaleString("es-CL"),
  );
  await expect(dialog).not.toContainText("Carlos Henríquez");
  await expect(dialog).not.toContainText("720.818");
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("navigation")).toBeHidden();
  await page.pdf({
    path: "/tmp/obratrack-chat-cotizacion.pdf",
    format: "A4",
    printBackground: true,
  });
  await page.emulateMedia({ media: "screen" });
});

test("obra con varias partidas y materiales se guarda sin perder elementos", async ({
  page,
}) => {
  const db = await setup(page, {
    respuesta: "Preparé la obra con su planificación.",
    cotizacion: null,
    sugerencias: [],
    accion: {
      tipo: "crear_proyecto",
      nombre: "Terraza nueva",
      comuna: "Maipú",
      monto: 3000000,
      dias: 10,
      partidas: [
        { nombre: "Fundaciones", dias: 2 },
        { nombre: "Estructura", dias: 4 },
      ],
      materiales: [
        { nombre: "Cemento", cantidad: 10, precio_unitario: 5000 },
        { nombre: "Madera", cantidad: 8, precio_unitario: 9000 },
      ],
    },
  });
  await page.goto("/cotizador");
  await send(
    page,
    "Crea la obra Terraza nueva con todas sus partidas y materiales",
  );
  await expect(
    page.getByText("Obra Creada: Terraza nueva", { exact: true }).first(),
  ).toBeVisible();
  expect(db.proyectos).toHaveLength(1);
  expect(db.actividades).toHaveLength(2);
  expect(new Set(db.actividades.map((a) => a.id)).size).toBe(2);
  expect(db.materiales_proyecto).toHaveLength(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("main")).toHaveCSS("padding-left", "0px");
  await expect(page.locator("aside")).not.toBeInViewport();
  expect(
    await page
      .getByRole("button", { name: "Enviar", exact: true })
      .evaluate((el) => {
        const r = el.getBoundingClientRect();
        const target = document.elementFromPoint(
          r.x + r.width / 2,
          r.y + r.height / 2,
        );
        return !!target && (target === el || el.contains(target));
      }),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/obratrack-chat-movil.png",
    fullPage: true,
  });
});

test("un error de Gemini se muestra sin una confirmación ficticia ni acciones", async ({
  page,
}) => {
  const db = await setup(page, {
    error: "El asistente necesita configurar GEMINI_API_KEY en el servidor.",
    code: "AI_NOT_CONFIGURED",
  });
  await page.goto("/cotizador");
  await send(page, "Crea una obra");
  await expect(
    page.getByText(
      "El asistente necesita configurar GEMINI_API_KEY en el servidor.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(db.proyectos || []).toHaveLength(0);
});

test("reintentar un pago pendiente no duplica el ingreso", async ({ page }) => {
  const db = await setup(
    page,
    {
      respuesta: "Preparé el anticipo.",
      cotizacion: null,
      sugerencias: [],
      accion: {
        tipo: "registrar_pago",
        proyecto_id: "p-existing",
        monto: 400000,
        metodo: "transferencia",
        nota: "Anticipo",
      },
    },
    true,
    true,
  );
  await page.goto("/cotizador");
  await send(page, "Registra un anticipo de 400 mil en Terraza");
  await expect(
    page.getByText(/su guardado en la nube está pendiente/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reintentar guardado" }).click();
  await expect(
    page.getByText("Guardado en Supabase.", { exact: true }),
  ).toBeVisible();
  expect(db.pagos).toHaveLength(1);
  expect(db.pagos[0].monto).toBe(400000);
});

test("el copiloto flotante comparte la misma ejecución y los mismos errores", async ({
  page,
}) => {
  await setup(page, {
    error: "La IA alcanzó su cuota o límite de uso.",
    code: "AI_RATE_LIMIT",
  });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /Copiloto IA/ }).click();
  await page
    .getByRole("textbox", { name: "Mensaje para el copiloto global" })
    .fill("Cotiza un radier");
  await page
    .getByRole("button", { name: "Enviar mensaje", exact: true })
    .click();
  await expect(
    page.getByText("La IA alcanzó su cuota o límite de uso.", { exact: true }),
  ).toBeVisible();
});

test("el asistente de una obra ejecuta y guarda su avance", async ({
  page,
}) => {
  const db = await setup(page, {}, true);
  await page.route("**/api/proyectos/p-existing/chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        respuesta: "Preparé el avance.",
        cotizacion: null,
        sugerencias: [],
        accion: {
          tipo: "actualizar_avance",
          proyecto_id: "p-existing",
          nombre: "Radier",
          porcentaje_avance: 60,
        },
      }),
    }),
  );
  await page.goto("/proyectos/p-existing/ia");
  await page
    .getByRole("textbox", { name: "Mensaje para el asistente de la obra" })
    .fill("Actualiza Radier al 60 %");
  await page
    .getByRole("button", { name: "Enviar mensaje", exact: true })
    .click();
  await expect(
    page.getByText("Avance Actualizado", { exact: true }).first(),
  ).toBeVisible();
  expect(
    db.actividades.find((a) => a.id === "act-existing").porcentaje_avance,
  ).toBe(60);
});

test("la bandeja del jefe muestra conexión pendiente y abre una cotización recibida por WhatsApp", async ({
  page,
}) => {
  await setup(page, { respuesta: "Lista", accion: null });
  const quote = normalizeQuote({
    titulo_proyecto: "Radier por WhatsApp",
    comuna_region: "Maipú",
    materiales: [
      {
        nombre: "Hormigón",
        cantidad: 2,
        unidad: "m3",
        precio_unitario_estimado: 100000,
      },
    ],
    mano_de_obra: [
      {
        rol: "Maestro",
        cantidad_personas: 1,
        dias_estimados: 2,
        valor_jornal_diario: 45000,
      },
    ],
  });
  await page.route("**/api/webhook/whatsapp", (route) =>
    route.fulfill({ json: { ok: true, cloud_api_configurada: false } }),
  );
  await page.route("**/api/whatsapp/mensajes", (route) => {
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    return route.fulfill({
      json: {
        mensajes: [
          {
            message_id: "wamid.fixture",
            texto: "Cotiza radier",
            respuesta: "Cotización lista",
            cotizacion: quote,
          },
        ],
      },
    });
  });
  await page.goto("/reportes");
  await expect(
    page.getByRole("heading", { name: "Gestiona tu obra desde tu WhatsApp" }),
  ).toBeVisible();
  await expect(
    page.getByText("Conexión con Meta pendiente", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Abrir WhatsApp de ObraTrack" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Ver cotización / PDF" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Cotización generada" })
      .getByText("Radier por WhatsApp", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Guardar PDF", exact: true }),
  ).toBeVisible();
});

test("presupuestos en Obras permite filtrar, cambiar estado y abrir el PDF", async ({
  page,
}) => {
  await setup(page, { respuesta: "Hola", accion: null });
  const quote = normalizeQuote({
    titulo_proyecto: "Radier de producción",
    cliente_nombre: "Cliente del presupuesto",
    materiales: [
      { nombre: "Cemento", cantidad: 2, precio_unitario_estimado: 5000 },
    ],
    mano_de_obra: [],
  });
  let budget = {
    id: quote.id,
    empresa_id: company,
    creado_por: ownerId,
    estado: "borrador",
    origen: "plataforma",
    proyecto_id: null,
    cotizacion: quote,
    created_at: "2026-10-29T12:00:00Z",
    updated_at: "2026-10-29T12:00:00Z",
  };
  await page.route("**/api/presupuestos*", async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      budget = { ...budget, ...body, updated_at: "2026-10-29T12:01:00Z" };
      await route.fulfill({ json: { presupuesto: budget } });
    } else await route.fulfill({ json: { presupuestos: [budget] } });
  });
  await page.goto("/proyectos");
  await page.getByRole("tab", { name: "Presupuestos", exact: true }).click();
  await expect(
    page.getByText("Radier de producción", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Estado de Radier de producción")
    .selectOption("aprobada");
  await expect(page.getByLabel("Estado de Radier de producción")).toHaveValue(
    "aprobada",
  );
  await page.getByLabel("Filtrar por estado").selectOption("rechazada");
  await expect(
    page.getByText("No hay presupuestos con estos filtros."),
  ).toBeVisible();
  await page.getByLabel("Filtrar por estado").selectOption("todos");
  await page.getByRole("button", { name: "Ver / PDF", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Cotización generada" }),
  ).toContainText("Cliente del presupuesto");
});

test("reportes muestra el canal real y las imágenes recibidas sin herramientas de simulación", async ({
  page,
}) => {
  await setup(page, { respuesta: "Hola", accion: null });
  await page.route("**/api/webhook/whatsapp", (route) =>
    route.fulfill({
      json: { cloud_api_configurada: true, numero: "15550000000" },
    }),
  );
  await page.route("**/api/whatsapp/mensajes", (route) =>
    route.fulfill({
      json: {
        mensajes: [
          {
            message_id: "m1",
            texto: "Avance del radier",
            respuesta: "Foto guardada en la bitácora.",
            adjunto: { path: `${company}/${ownerId}/${"a".repeat(64)}.jpg` },
            created_at: "2026-10-29T12:00:00Z",
          },
        ],
      },
    }),
  );
  await page.route("**/api/whatsapp/adjuntos*", (route) =>
    route.fulfill({
      json: {
        url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY1cAAAAASUVORK5CYII=",
      },
    }),
  );
  await page.goto("/reportes");
  await expect(
    page.getByRole("link", { name: "Abrir WhatsApp de ObraTrack" }),
  ).toHaveAttribute("href", "https://wa.me/15550000000");
  await expect(
    page.getByRole("img", { name: "Foto enviada por WhatsApp" }),
  ).toBeVisible();
  await expect(
    page.getByText(/simulador|modo desarrollador|fotos de prueba/i),
  ).toHaveCount(0);
});

test("el nombre de una obra abre su Carta Gantt", async ({ page }) => {
  await setup(page, { respuesta: "Lista", accion: null }, true);
  await page.goto("/proyectos");
  const name = page.getByRole("link", { name: "Terraza", exact: true });
  await expect(name).toHaveAttribute("href", "/proyectos/p-existing/gantt");
  await name.click();
  await expect(page).toHaveURL(/\/proyectos\/p-existing\/gantt$/);
});

test("reportes permite filtrar los registros y muestra autor, obra, fecha y detalle", async ({
  page,
}) => {
  await setup(page, { respuesta: "Lista", accion: null });
  await page.route("**/api/webhook/whatsapp", (r) =>
    r.fulfill({ json: { cloud_api_configurada: true, numero: "15550000000" } }),
  );
  await page.route("**/api/whatsapp/mensajes*", (r) => {
    const filtered =
      new URL(r.request().url()).searchParams.get("tipo") === "registro";
    return r.fulfill({
      json: {
        gestion: true,
        total: filtered ? 1 : 2,
        autores: [{ id: "worker", nombre: "Ana", rol: "terreno" }],
        obras: [{ id: "p1", nombre: "Patio" }],
        mensajes: [
          {
            message_id: "m1",
            actor_id: "worker",
            categoria: "registro",
            created_at: "2026-10-29T15:00:00Z",
            sent_at: "2026-10-29T15:00:02Z",
            autor: { nombre: "Ana", rol: "terreno" },
            obras: [{ id: "p1", nombre: "Patio" }],
            texto: "Radier de Patio al 50 %",
            respuesta: "Avance registrado",
            acciones: {
              tipo: "actualizar_avance",
              titulo: "Avance actualizado",
              resultado_texto: "Radier al 50 %",
            },
          },
          ...(filtered
            ? []
            : [
                {
                  message_id: "m2",
                  categoria: "consulta",
                  created_at: "2026-10-29T16:00:00Z",
                  texto: "¿Qué obras están activas?",
                  respuesta: "Estas son tus obras",
                },
              ]),
        ],
      },
    });
  });
  await page.goto("/reportes");
  await expect(
    page.getByText("Avance actualizado", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Patio", exact: true }),
  ).toHaveAttribute("href", "/proyectos/p1/gantt");
  await page.getByLabel("Tipo de registro").selectOption("registro");
  await expect(
    page.getByText("¿Qué obras están activas?", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Ana · Terreno", { exact: false })).toBeVisible();
  await page.getByText("Ver detalle", { exact: true }).click();
  await expect(
    page.getByText("Respuesta de ObraTrack", { exact: true }),
  ).toBeVisible();
});

test("los avisos muestran el estado por destinatario y permiten reintentar solo los fallidos", async ({
  page,
}) => {
  await setup(page, { respuesta: "Lista", accion: null });
  let retried = false;
  const id = "11111111-1111-4111-a111-111111111111";
  await page.route("**/api/webhook/whatsapp", (r) =>
    r.fulfill({ json: { cloud_api_configurada: true, numero: "15550000000" } }),
  );
  await page.route("**/api/whatsapp/mensajes", (r) =>
    r.fulfill({ json: { mensajes: [], gestion: true, total: 0 } }),
  );
  await page.route("**/api/whatsapp/avisos*", (r) => {
    if (r.request().method() === "POST") {
      expect(r.request().postDataJSON().id).toBe(id);
      retried = true;
      return r.fulfill({ json: { reintentados: 1 } });
    }
    if (new URL(r.request().url()).searchParams.has("id"))
      return r.fulfill({
        json: {
          envios: [
            {
              id: "d1",
              nombre: "Ana",
              rol: "terreno",
              telefono: "56912345678",
              estado: "aceptado",
            },
            {
              id: "d2",
              nombre: "Pedro",
              rol: "supervisor",
              telefono: "56987654321",
              estado: retried ? "pendiente" : "fallido",
              error_detalle: retried ? null : "Número no habilitado en Meta",
            },
          ],
        },
      });
    return r.fulfill({
      json: {
        total: 1,
        avisos: [
          {
            id,
            destinatarios: 2,
            created_at: "2026-10-29T16:00:00Z",
            origen: "whatsapp",
            mensaje: "Mañana comenzamos a las 08:00.",
            estados: retried
              ? { aceptado: 1, pendiente: 1 }
              : { aceptado: 1, fallido: 1 },
          },
        ],
      },
    });
  });
  await page.goto("/reportes");
  await page.getByRole("tab", { name: "Avisos enviados", exact: true }).click();
  await expect(
    page.getByText("Aceptado por Meta: 1", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ver destinatarios", exact: true })
    .click();
  await expect(
    page.getByText("Número no habilitado en Meta", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reintentar fallidos", exact: true })
    .click();
  await expect(page.getByText("Pendiente: 1", { exact: true })).toBeVisible();
  expect(retried).toBe(true);
});
