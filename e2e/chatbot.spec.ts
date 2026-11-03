import { test, expect, type Page } from "@playwright/test";
import { normalizeQuote } from "../lib/ai/protocol";
import { reviseQuote } from "../lib/quotes/revise";
import { readFile } from "node:fs/promises";

test("el Centro de Mando prioriza obras y permite recorrer los módulos de una obra sin errores", async ({ page }) => {
  test.setTimeout(120000);
  await setup(page, { respuesta: 'Consulta', accion: null }, true);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/dashboard');
  const active = page.getByRole('heading', { name: /Obras en Faena Activa/ });
  const flow = page.getByRole('heading', { name: /Flujo Financiero por Obra/ });
  const distribution = page.getByRole('heading', { name: 'Distribución de Cartera', exact: true });
  await expect(active).toBeVisible();
  const position = await active.boundingBox();
  expect(position!.y).toBeLessThan((await flow.boundingBox())!.y);
  expect(position!.y).toBeLessThan((await distribution.boundingBox())!.y);
  for (const module of ['gantt','finanzas','asistencia','cambios','documentos','presupuestos','ia']) {
    await page.goto('/proyectos/p-existing/' + module);
    await expect(page.getByRole('heading', { name: 'Terraza', exact: true }).first()).toBeVisible();
    if (module === 'finanzas') {
      await page.getByRole('button', { name: 'Emitir Estado de Pago (PDF)', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Estado de Pago de Obra', exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel('Modalidad de Cobro', { exact: true })).toHaveValue('avance');
      await expect(dialog.getByLabel('Monto Bruto EDP (CLP)', { exact: true })).toBeDisabled();
      await dialog.getByLabel('Modalidad de Cobro', { exact: true }).selectOption('personalizado');
      await dialog.getByLabel('Monto Bruto EDP (CLP)', { exact: true }).fill('125000');
      await dialog.getByLabel('Retención Garantía', { exact: true }).selectOption('5');
      await dialog.getByLabel('Glosa / Hito de Cobro', { exact: true }).fill('Avance de obra');
      await page.evaluate(() => { (window as any).__printCount = 0; window.print = () => { (window as any).__printCount++; }; });
      const downloading = page.waitForEvent('download');
      await dialog.getByRole('button', { name: 'Descargar PDF', exact: true }).click();
      await (await downloading).saveAs('/tmp/obratrack-workflow-edp.pdf');
      expect((await readFile('/tmp/obratrack-workflow-edp.pdf')).subarray(0, 5).toString()).toBe('%PDF-');
      expect(await page.evaluate(() => (window as any).__printCount)).toBe(0);
    }
  }
  expect(errors).toEqual([]);
});

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

test("administración puede activar una cuenta nueva sin mostrarla conectada antes de la confirmación", async ({ page }) => {
  await setup(page, { respuesta: 'Consulta', accion: null });
  let activations = 0;
  await page.route('**/api/webhook/whatsapp', route => route.fulfill({ json: { cloud_api_configurada: true, numero: '15556154571' } }));
  await page.route('**/api/whatsapp/mensajes*', route => route.fulfill({ json: { mensajes: [], total: 0 } }));
  await page.route('**/api/whatsapp/estado', async route => {
    if (route.request().method() === 'POST') {
      activations++;
      expect(route.request().headers().authorization).toMatch(/^Bearer /);
      await route.fulfill({ json: { estado: 'disponible', mensaje: 'Recepción activada.' } });
    } else await route.fulfill({ json: { estado: 'webhook_pendiente', mensaje: 'La cuenta nueva requiere suscripción.' } });
  });
  await page.goto('/reportes');
  await expect(page.getByText('La cuenta nueva requiere suscripción.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir WhatsApp de ObraTrack' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Activar recepción de mensajes', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Abrir WhatsApp de ObraTrack' })).toHaveAttribute('href', 'https://wa.me/15556154571');
  await expect(page.getByRole('button', { name: 'Activar recepción de mensajes', exact: true })).toHaveCount(0);
  expect(activations).toBe(1);
});
async function setup(
  page: Page,
  reply: any,
  seedProject = false,
  failPayment = false,
) {
  const db: Record<string, any[]> = {
    usuarios: [owner],
    empresas: [{ id: company, plan_id: "pro_ia" }],
    proyectos: seedProject
      ? [
          {
            id: "p-existing",
            empresa_id: company,
            nombre: "Terraza",
            estado: "activo",
            monto_cotizado: 3000000,
            fecha_inicio: "2026-10-27",
            fecha_termino_estimada: "2026-11-20",
          },
        ]
      : [],
    actividades: seedProject
      ? [
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
        ]
      : [],
  };
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
      status: route.request().method() === "POST" ? 503 : 200,
      contentType: "application/json",
      body: JSON.stringify(
        route.request().method() === "POST"
          ? { error: "Sincronización de escritura no utilizada por este test" }
          : {
              empresaId: company,
              plan_id: db.empresas[0].plan_id,
              proyectos: db.proyectos,
              usuarios: db.usuarios,
              clientes: db.clientes || [],
              actividades: db.actividades || [],
              pagos: db.pagos || [],
              materiales: db.materiales_proyecto || [],
              bitacora: db.bitacora_entradas || [],
              imprevistos: db.imprevistos || [],
              reclamos_cambios: db.reclamos_cambios_obra || [],
              documentos: db.documentos_obra || [],
              asistencias: db.asistencia_obreros || [],
              agenda: db.agenda_eventos || [],
              reportes_whatsapp: db.reportes_whatsapp || [],
            },
      ),
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

test('las ventanas móviles aparecen dentro de la pantalla y conservan el desplazamiento al cerrar', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  const db = await setup(page, { respuesta: 'Consulta', accion: null }, true);
  db.proyectos = Array.from({ length: 12 }, (_, i) => ({ ...db.proyectos[0], id: 'mobile-' + i, nombre: 'Obra ' + i }));
  await page.goto('/proyectos');
  await expect(page.getByRole('button', { name: /Nuevo Proyecto/ })).toBeVisible();
  await expect(page.getByText('Obra 11', { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 950));
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(500);
  await page.getByRole('button', { name: /Nuevo Proyecto/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Registrar Nuevo Proyecto', exact: true });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: '/tmp/obratrack-mobile-project-modal-open.png' });
  await expect(page.getByRole('link', { name: 'Abrir ObraBot' })).toBeHidden();
  const card = dialog.locator(':scope > div').first();
  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 640 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => {
      const bounds = await card.boundingBox();
      return !!bounds && bounds.y >= 0 && bounds.y + bounds.height <= viewport.height + 1 && bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1;
    }).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  // Emular la altura visible al abrir el teclado en navegadores que mantienen el layout viewport.
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 410 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect.poll(async () => { const box = await card.boundingBox(); return box!.y + box!.height; }).toBeLessThanOrEqual(411);
  await dialog.getByRole('button', { name: 'Crear Proyecto', exact: true }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('button', { name: 'Crear Proyecto', exact: true })).toBeInViewport();
  await page.evaluate(() => { delete (window.visualViewport as any).height; window.visualViewport!.dispatchEvent(new Event('resize')); });
  await page.screenshot({ path: '/tmp/obratrack-mobile-project-modal.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before);
  await expect(page.getByRole('link', { name: 'Abrir ObraBot' })).toBeVisible();
});

test('clientes, equipo, finanzas y suscripción usan ventanas accesibles en un celular pequeño', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 360, height: 640 });
  await setup(page, { respuesta: 'Consulta', accion: null }, true);
  for (const [path, button] of [['/clientes', /Nuevo Cliente/], ['/equipo', /Agregar Trabajador/], ['/proyectos/p-existing/finanzas', /Registrar Pago/]]) {
    await page.goto(path as string);
    await page.getByRole('button', { name: button as RegExp }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const bounds = await dialog.locator(':scope > div').first().boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(641);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.position)).not.toBe('fixed');
  }
  await page.getByRole('button', { name: 'Plan Pro IA', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Tu suscripción' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('ObraBot abre el asistente correcto y su nuevo nombre aparece en la navegación móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, { respuesta: 'Tienes una obra activa.', accion: null }, true);
  await page.goto('/proyectos');
  const launcher = page.getByRole('link', { name: 'Abrir ObraBot' });
  await expect(launcher).toHaveAttribute('href', '/cotizador');
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await expect(launcher).toBeHidden();
  await expect(page.getByRole('link', { name: /^ObraBot/ })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await launcher.click();
  await expect(page).toHaveURL(/\/cotizador$/);
  await expect(page.getByRole('heading', { name: 'ObraBot', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Mensaje para el asistente' })).toBeVisible();
  await expect(launcher).toHaveCount(0);
  await send(page, '¿Qué obras tengo?');
  await expect(page.getByText('Tienes una obra activa.', { exact: true })).toBeVisible();
  await page.goto('/proyectos/p-existing/finanzas');
  await expect(launcher).toHaveAttribute('href', '/proyectos/p-existing/ia');
  await page.screenshot({ path: '/tmp/obratrack-mobile-obrabot-launcher.png' });
});

test('el perfil de terreno puede abrir ObraBot conservando sus permisos de obra', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const db = await setup(page, { respuesta: 'Puedo ayudarte con los avances de tu obra asignada.', accion: null }, true);
  db.usuarios[0] = { ...db.usuarios[0], rol: 'terreno' };
  db.proyectos[0].trabajadores_ids = [ownerId];
  await page.addInitScript(({ owner }) => localStorage.setItem('obratrack_active_user_v7', JSON.stringify({ ...owner, rol: 'terreno' })), { owner });
  await page.goto('/cotizador');
  await expect(page.getByRole('heading', { name: 'ObraBot', exact: true }).first()).toBeVisible();
  await send(page, '¿Qué puedo reportar en mi obra?');
  await expect(page.getByText('Puedo ayudarte con los avances de tu obra asignada.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/cotizador$/);
});

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
  await page.evaluate(() => {
    (window as any).__printCount = 0;
    window.print = () => { (window as any).__printCount += 1; };
  });
  const downloading = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Descargar PDF", exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^ObraTrack_Cotizacion_.*\.pdf$/);
  await download.saveAs("/tmp/obratrack-downloaded-cotizacion.pdf");
  const bytes = await readFile("/tmp/obratrack-downloaded-cotizacion.pdf");
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(await page.evaluate(() => (window as any).__printCount)).toBe(0);
  await page.locator("#obratrack-cotizacion-pdf").screenshot({ path: "/tmp/obratrack-quote-preview.png" });
  await dialog.getByRole("button", { name: "Imprimir", exact: true }).click();
  expect(await page.evaluate(() => (window as any).__printCount)).toBe(1);
  await page.emulateMedia({ media: "print" });
  expect(await page.evaluate(() => getComputedStyle(document.body).position)).toBe('static');
  await expect(page.getByRole("navigation")).toBeHidden();
  await page.pdf({
    path: "/tmp/obratrack-chat-cotizacion.pdf",
    format: "A4",
    printBackground: true,
  });
  await page.emulateMedia({ media: "screen" });
  expect(await page.evaluate(() => document.body.style.position)).toBe('fixed');
  await dialog.getByRole('button', { name: 'Cerrar cotización', exact: true }).click();
  expect(await page.evaluate(() => document.body.style.position)).not.toBe('fixed');
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

test("ObraBot respeta el bloqueo del plan gratis y mantiene el botón de tema fijo", async ({
  page,
}) => {
  const db = await setup(page, {});
  db.empresas[0].plan_id = "gratis";
  await page.addInitScript((companyId) => {
    localStorage.setItem(
      `obratrack_active_plan_v7_${companyId}`,
      JSON.stringify("gratis"),
    );
  }, company);
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: /Copiloto IA/ })).toHaveCount(
    0,
  );
  const themeButtons = page.locator(
    'button[aria-label="Cambiar tema"]:visible',
  );
  await expect(themeButtons).toHaveCount(1);
  await themeButtons.first().click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole('link', { name: 'Abrir ObraBot' })).toBeVisible();
  await page.getByRole('link', { name: 'Abrir ObraBot' }).click();
  await expect(page.getByText(/Desbloquea ObraBot/)).toBeVisible();
  await expect(
    page.locator('button[aria-label="Cambiar tema"]:visible'),
  ).toHaveCount(1);
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
    page.getByRole("button", { name: "Descargar PDF", exact: true }),
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

test("editar un presupuesto conserva el registro, recalcula montos y descarga la versión guardada sin llamar a la IA", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await setup(page, { respuesta: "No se debe llamar a la IA", accion: null });
  const quote = normalizeQuote({ titulo_proyecto: "Presupuesto editable", materiales: [{ nombre: "Cemento", cantidad: 2, unidad: "saco", precio_unitario_estimado: 5000 }], mano_de_obra: [] });
  let budget = { id: quote.id, empresa_id: company, creado_por: ownerId, estado: "aprobada", origen: "whatsapp", proyecto_id: null, cotizacion: quote, created_at: "2026-10-29T12:00:00Z", updated_at: "2026-10-29T12:00:00Z" };
  let writes = 0, aiCalls = 0;
  page.on("request", (request) => { if (request.url().includes("/api/cotizador/chat")) aiCalls++; });
  await page.route("**/api/presupuestos*", async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      expect(body.id).toBe(quote.id);
      expect(body.updated_at).toBe(budget.updated_at);
      expect(body.estado).toBeUndefined();
      writes++;
      budget = { ...budget, cotizacion: body.cotizacion, updated_at: "2026-11-02T12:00:00Z" };
      await route.fulfill({ json: { presupuesto: budget } });
    } else await route.fulfill({ json: { presupuestos: [budget] } });
  });
  await page.goto("/proyectos");
  await page.getByRole("tab", { name: "Presupuestos", exact: true }).click();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Cotización generada" });
  const editor = dialog.getByRole("region", { name: "Editar cotización" });
  await expect(editor.getByLabel("Nombre del proyecto")).toHaveValue("Presupuesto editable");
  await editor.getByLabel("Precio material 1", { exact: true }).fill("6000");
  await expect(editor.getByLabel("Precio material 1", { exact: true })).toHaveValue("6.000");
  await editor.getByLabel("Cantidad material 1", { exact: true }).fill("3");
  await editor.getByLabel("Correo del cliente", { exact: true }).fill("cliente@example.test");
  await editor.getByLabel("Condiciones de pago", { exact: true }).fill("Pago del 50% al iniciar la obra.");
  await editor.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(dialog.getByRole("table")).toContainText("6.000");
  await expect(dialog).toContainText("cliente@example.test");
  const closeBounds = await dialog.getByRole("button", { name: "Cerrar cotización", exact: true }).boundingBox();
  expect(closeBounds && closeBounds.x + closeBounds.width).toBeLessThanOrEqual(375);
  expect(budget.cotizacion.id).toBe(quote.id);
  expect(budget.cotizacion.fecha_creacion).toBe(quote.fecha_creacion);
  expect(budget.estado).toBe("aprobada");
  expect(writes).toBe(1); expect(aiCalls).toBe(0);
  const downloading = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Descargar PDF", exact: true }).click();
  await (await downloading).saveAs("/tmp/obratrack-edited-cotizacion.pdf");
  await dialog.getByRole("button", { name: "Editar cotización", exact: true }).click();
  await editor.getByLabel("Cantidad material 1", { exact: true }).fill("99");
  await editor.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(writes).toBe(1);
  await dialog.getByRole("button", { name: "Cerrar cotización", exact: true }).click();
  await page.reload();
  await page.getByRole("tab", { name: "Presupuestos", exact: true }).click();
  await page.getByRole("button", { name: "Ver / PDF", exact: true }).click();
  await expect(dialog.getByRole("table")).toContainText("6.000");
  await expect(dialog).toContainText("Pago del 50% al iniciar la obra.");
  expect(budget.cotizacion.materiales[0].cantidad).toBe(3);
});

test("el chat abre la versión editada del presupuesto aunque el mensaje conserve una copia anterior", async ({ page }) => {
  const original = normalizeQuote({ titulo_proyecto: "Presupuesto vigente", materiales: [{ nombre: "Cemento", cantidad: 2, unidad: "saco", precio_unitario_estimado: 5000 }], mano_de_obra: [] });
  const revised = reviseQuote(original, { ...original, materiales: original.materiales.map((m) => ({ ...m, precio_unitario_estimado: 9000 })), condiciones_pago: "Condiciones actualizadas" });
  await setup(page, { respuesta: "Cotización preparada", accion: null, cotizacion: original });
  await page.route("**/api/presupuestos*", (route) => route.fulfill({ json: { presupuestos: [{ id: original.id, cotizacion: revised }] } }));
  await page.goto("/cotizador");
  await send(page, "Cotiza el proyecto");
  await expect(page.getByRole("region", { name: "Resumen del presupuesto" })).toContainText(revised.estructura_financiera.precio_total_con_iva.toLocaleString("es-CL"));
  await page.getByRole("button", { name: "Ver cotización / PDF", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Cotización generada" });
  await expect(dialog.getByRole("table")).toContainText("9.000");
  await expect(dialog).toContainText("Condiciones actualizadas");
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

const syncedProject = (id: string, nombre: string) => ({
  id,
  nombre,
  empresa_id: company,
  estado: "activo",
  monto_cotizado: 3000000,
  fecha_inicio: "2026-10-27",
  fecha_termino_estimada: "2026-11-20",
});
async function serveCloud(
  page: Page,
  read: () => any[],
  write: (rows: any[]) => void = () => {},
  failed = () => false,
) {
  await page.route("**/api/supabase/sync*", async (route) => {
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    if (failed())
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Sin conexión con la nube" }),
      });
    if (route.request().method() === "POST") {
      write(route.request().postDataJSON().cambios?.proyectos || []);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        empresaId: company,
        plan_id: "pro_ia",
        proyectos: read(),
        usuarios: [owner],
        clientes: [],
        actividades: [],
        pagos: [],
        materiales: [],
        bitacora: [],
        imprevistos: [],
        reclamos_cambios: [],
        documentos: [],
        asistencias: [],
        reportes_whatsapp: [],
        agenda: [],
      }),
    });
  });
}

test("el celular recupera las obras creadas desde otro navegador al volver y al recuperar conexión", async ({
  page,
  browser,
}) => {
  let cloud = [syncedProject("cloud1", "Obra inicial")];
  const mobileContext = await browser.newContext({
    baseURL: "http://localhost:3000",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const mobile = await mobileContext.newPage();
    await setup(page, {});
    await setup(mobile, {});
    const read = () => cloud;
    const write = (rows: any[]) => {
      const map = new Map(cloud.map((p) => [p.id, p]));
      rows.forEach((p) => map.set(p.id, p));
      cloud = Array.from(map.values());
    };
    await serveCloud(page, read, write);
    await serveCloud(mobile, read, write);
    await page.goto("/proyectos");
    await mobile.goto("/proyectos");
    await expect(
      mobile.getByRole("link", { name: "Obra inicial", exact: true }),
    ).toBeVisible();
    await page.evaluate(async () => {
      const session = JSON.parse(
        localStorage.getItem("sb-gaoxbkvhtdsgqxjihlrv-auth-token")!,
      );
      const response = await fetch("/api/supabase/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          cambios: {
            proyectos: [
              {
                id: "cloud2",
                nombre: "Obra creada desde PC",
                empresa_id: "fixture-company",
                estado: "activo",
                monto_cotizado: 2000000,
                fecha_inicio: "2026-10-27",
                fecha_termino_estimada: "2026-11-20",
              },
              {
                id: "cloud3",
                nombre: "Tercera obra",
                empresa_id: "fixture-company",
                estado: "activo",
                monto_cotizado: 1000000,
                fecha_inicio: "2026-10-27",
                fecha_termino_estimada: "2026-11-20",
              },
            ],
          },
        }),
      });
      if (!response.ok) throw Error("No se confirmó el guardado");
    });
    await mobile.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await expect(
      mobile.getByRole("link", { name: "Obra creada desde PC", exact: true }),
    ).toBeVisible();
    await expect(
      mobile.getByRole("link", { name: "Tercera obra", exact: true }),
    ).toBeVisible();
    await mobileContext.setOffline(true);
    await mobile.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(
      mobile.getByText("Sin conexión. Mostrando los últimos datos guardados."),
    ).toBeVisible();
    cloud.push(syncedProject("cloud4", "Obra durante desconexión"));
    await mobileContext.setOffline(false);
    await mobile.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(
      mobile.getByRole("link", {
        name: "Obra durante desconexión",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      mobile.getByText("Sin conexión. Mostrando los últimos datos guardados."),
    ).toHaveCount(0);
    expect(cloud).toHaveLength(4);
  } finally {
    await mobileContext.close();
  }
});

test("una pestaña abierta se actualiza periódicamente sin cambiar de pantalla", async ({
  page,
}) => {
  await page.clock.install();
  await setup(page, {});
  let cloud = [syncedProject("cloud1", "Obra inicial")];
  await serveCloud(page, () => cloud);
  await page.goto("/proyectos");
  await expect(
    page.getByRole("link", { name: "Obra inicial", exact: true }),
  ).toBeVisible();
  cloud.push(syncedProject("cloud2", "Nueva obra remota"));
  await page.clock.fastForward(31000);
  await expect(
    page.getByRole("link", { name: "Nueva obra remota", exact: true }),
  ).toBeVisible();
});

test("un fallo de actualización conserva las obras y ofrece reintento visible", async ({
  page,
}) => {
  await setup(page, {});
  let failing = false;
  let cloud = [syncedProject("cloud1", "Obra inicial")];
  await serveCloud(
    page,
    () => cloud,
    undefined,
    () => failing,
  );
  await page.goto("/proyectos");
  await expect(
    page.getByRole("link", { name: "Obra inicial", exact: true }),
  ).toBeVisible();
  failing = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("button", { name: "Reintentar sincronización" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Obra inicial", exact: true }),
  ).toBeVisible();
  failing = false;
  cloud.push(syncedProject("cloud2", "Obra recuperada"));
  await page.getByRole("button", { name: "Reintentar sincronización" }).click();
  await expect(
    page.getByRole("link", { name: "Obra recuperada", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reintentar sincronización" }),
  ).toHaveCount(0);
});

test("la búsqueda muestra precios publicados, cantidad y enlaces reales sin ejecutar cambios", async ({
  page,
}) => {
  const comparison = {
    consulta: { producto: "taladro", cantidad: 3, unidad_cantidad: "unidad" },
    consultado_en: "2026-11-02T14:00:00Z",
    resumen: "Encontré dos opciones publicadas en los catálogos consultados.",
    ofertas: [
      {
        id: "easy:1",
        tienda: "Easy",
        nombre: "Taladro 13mm Makita",
        marca: "Makita",
        precio: 100000,
        unidad: "un",
        multiplicador: 1,
        url: "https://www.easy.cl/taladro-makita/p",
        total_solicitado: 300000,
      },
      {
        id: "dimaco:1",
        tienda: "Dimaco",
        nombre: "Taladro 13mm Makita",
        marca: "Makita",
        precio: 90000,
        unidad: "un",
        multiplicador: 1,
        url: "https://www.dimaco.cl/taladro-makita/p",
        total_solicitado: 270000,
      },
    ],
    proveedores: [
      { nombre: "Easy", estado: "consultado", url: "https://www.easy.cl" },
      { nombre: "Dimaco", estado: "consultado", url: "https://www.dimaco.cl" },
    ],
    mejores_ids: ["dimaco:1"],
  };
  const db = await setup(page, {
    respuesta: "Texto de comparación completo",
    accion: null,
    cotizacion: null,
    comparacion_materiales: comparison,
  });
  await page.goto("/cotizador");
  await send(page, "Busca tres taladros Makita de 13mm");
  const result = page.getByRole("region", {
    name: "Precios publicados de materiales",
  });
  await expect(
    result.getByRole("link", { name: "Ver en Easy" }),
  ).toHaveAttribute("href", "https://www.easy.cl/taladro-makita/p");
  await expect(
    result.getByRole("link", { name: "Ver en Dimaco" }),
  ).toHaveAttribute("href", "https://www.dimaco.cl/taladro-makita/p");
  await expect(result.getByText("$270.000", { exact: true })).toBeVisible();
  await expect(
    result.getByText(/Menor precio del mismo producto/),
  ).toBeVisible();
  expect(db.materiales_proyecto || []).toHaveLength(0);
  expect(db.proyectos).toHaveLength(0);
});

test("seleccionar una obra en el copiloto usa su chat y separa la consulta general", async ({
  page,
}) => {
  await setup(
    page,
    {
      respuesta: "Respuesta de consulta general",
      accion: null,
      cotizacion: null,
    },
    true,
  );
  let requests = 0;
  await page.route("**/api/proyectos/p-existing/chat", async (route) => {
    requests++;
    expect(
      route
        .request()
        .postDataJSON()
        .historial.some(
          (m: any) => m.texto === "Respuesta de consulta general",
        ),
    ).toBe(false);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        respuesta: "Pendientes de Terraza",
        accion: null,
        cotizacion: null,
      }),
    });
  });
  await page.goto("/cotizador");
  await send(page, "Consulta general");
  await expect(
    page.getByText("Respuesta de consulta general", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Obra", { exact: true }).selectOption("p-existing");
  await send(page, "Resume los pendientes");
  await expect(
    page.getByText("Pendientes de Terraza", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Respuesta de consulta general", { exact: true }),
  ).toHaveCount(0);
  expect(requests).toBe(1);
});

test("el Plan Pro puede usar el cotizador sin quedar bloqueado por la interfaz de Pro IA", async ({
  page,
}) => {
  const db = await setup(page, {
    respuesta: "Indica las dimensiones del trabajo.",
    accion: null,
    cotizacion: null,
  });
  db.empresas[0].plan_id = "pro";
  await page.goto("/cotizador");
  await expect(
    page.getByRole("button", { name: "Plan Pro", exact: true }),
  ).toBeVisible();
  await send(page, "Quiero cotizar una terraza");
  await expect(
    page.getByText("Indica las dimensiones del trabajo.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Desbloquea Copiloto Obrero IA/)).toHaveCount(0);
});

test("el copiloto no aplica un pago sobre una caché que no pudo actualizarse", async ({
  page,
}) => {
  const db = await setup(
    page,
    {
      respuesta: "Preparado",
      accion: {
        tipo: "registrar_pago",
        proyecto_id: "p-existing",
        monto: 400000,
        metodo: "transferencia",
      },
      cotizacion: null,
    },
    true,
  );
  await page.route("**/api/supabase/sync*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"error":"Sin conexión"}',
    }),
  );
  await page.goto("/cotizador");
  await send(page, "Registra un abono de 400000 en Terraza");
  await expect(
    page.getByText(
      "No se pudieron actualizar los datos de la obra. Reintenta antes de aplicar cambios.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(db.pagos || []).toHaveLength(0);
});

test("el presupuesto del chat de una obra conserva el PDF al recargar desde la nube", async ({
  page,
}) => {
  const q = normalizeQuote({
    titulo_proyecto: "Adicional para Terraza",
    materiales: [
      {
        nombre: "Cemento",
        cantidad: 4,
        unidad: "saco",
        precio_unitario_estimado: 5000,
      },
    ],
    mano_de_obra: [
      {
        rol: "Maestro",
        cantidad_personas: 1,
        dias_estimados: 1,
        valor_jornal_diario: 45000,
      },
    ],
    estructura_financiera: {
      gastos_generales_porcentaje: 10,
      imprevistos_porcentaje: 5,
      margen_utilidad_porcentaje: 20,
    },
    resumen_ejecutivo: "Presupuesto adicional con supuestos indicados.",
  });
  const db = await setup(page, {}, true);
  await page.route("**/api/proyectos/p-existing/chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        respuesta: "Presupuesto calculado",
        accion: null,
        cotizacion: q,
      }),
    }),
  );
  await page.goto("/proyectos/p-existing/ia");
  await expect(
    page.getByRole("textbox", { name: "Mensaje para el asistente de la obra" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Mensaje para el asistente de la obra" })
    .fill("Cotiza el adicional");
  await page
    .getByRole("button", { name: "Enviar mensaje", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Ver cotización / PDF" }),
  ).toBeVisible();
  await expect
    .poll(
      () =>
        db.mensajes_chat_proyecto?.find((m) => m.cotizacion_generada)
          ?.cotizacion_generada?.id,
    )
    .toBe(q.id);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Ver cotización / PDF" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ver cotización / PDF" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByText("Adicional para Terraza", { exact: true }),
  ).toBeVisible();
});

test('después de cotizar se ofrece crear obra con Gantt y materiales sin crearla automáticamente', async ({ page }) => {
  const quote = normalizeQuote({ titulo_proyecto: 'Obra propuesta', cliente_nombre: 'Cliente', materiales: [{ nombre: 'Cemento', cantidad: 3, unidad: 'saco', precio_unitario_estimado: 5000 }], mano_de_obra: [], actividades_gantt: [{ nombre: 'Preparar terreno', dias: 1 }, { nombre: 'Ejecutar radier', dias: 2 }] });
  const db = await setup(page, { respuesta: 'Cotización lista', accion: null, cotizacion: quote });
  let calls = 0;
  let budget = { id: quote.id, cotizacion: quote, estado: 'borrador', proyecto_id: null as string | null, updated_at: '2026-11-02T12:00:00Z' };
  await page.route('**/api/presupuestos**', (route) => route.fulfill({ json: { presupuestos: [budget] } }));
  await page.route('**/api/presupuestos/convertir', async (route) => {
    calls++;
    const body = route.request().postDataJSON();
    expect(body.id).toBe(quote.id); expect(body.incluir_gantt).toBe(true); expect(body.incluir_materiales).toBe(true);
    const project = { id: 'p-from-quote', empresa_id: company, nombre: quote.titulo_proyecto, estado: 'activo', monto_cotizado: quote.estructura_financiera.precio_total_con_iva, fecha_inicio: '2026-11-02', fecha_termino_estimada: '2026-11-05' };
    db.proyectos.push(project);
    budget = { ...budget, proyecto_id: project.id, estado: 'aprobada' };
    await route.fulfill({ json: { presupuesto: budget, proyecto: project, actividadesCreadas: 2, materialesCargados: 1 } });
  });
  await page.goto('/cotizador');
  await send(page, 'Cotiza el radier');
  const proposal = page.getByRole('region', { name: 'Crear obra desde cotización' });
  await expect(proposal).toContainText('¿Quieres crear la obra con esta cotización?');
  await expect(proposal.getByLabel('Usar Gantt sugerido')).toBeChecked();
  await proposal.getByText('Revisar Gantt sugerido', { exact: true }).click();
  await expect(proposal).toContainText('Preparar terreno');
  expect(calls).toBe(0); expect(db.proyectos).toHaveLength(0);
  await proposal.getByRole('button', { name: 'Crear obra', exact: true }).click();
  await expect(page.getByRole('link', { name: /Abrir.*Gantt/ }).first()).toHaveAttribute('href', '/proyectos/p-from-quote/gantt');
  expect(calls).toBe(1); expect(db.proyectos).toHaveLength(1);
});

test('presupuesto con precio acordado: en celular guarda IVA, hitos y PDF sin cambiar el importe', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await setup(page, { respuesta: 'No utilizada', accion: null });
  let budget: any = null;
  let writes = 0;
  await page.route('**/api/presupuestos**', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON(); writes++;
      const quote = normalizeQuote(body.cotizacion);
      budget = { id: quote.id, cotizacion: quote, estado: 'borrador', proyecto_id: null, updated_at: '2026-11-03T12:00:00Z' };
      await route.fulfill({ json: { presupuesto: budget } });
    } else await route.fulfill({ json: { presupuestos: budget ? [budget] : [] } });
  });
  await page.goto('/proyectos?tab=presupuestos');
  await page.getByRole('button', { name: 'Precio acordado', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo presupuesto', exact: true });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox(); expect(bounds!.y).toBeGreaterThanOrEqual(0);
  await dialog.getByLabel('Nombre del proyecto', { exact: true }).fill('Obra Padre Hurtado');
  await dialog.getByLabel('Precio de venta 1', { exact: true }).fill('2247000');
  await expect(dialog.getByLabel('Precio de venta 1', { exact: true })).toHaveValue('2.247.000');
  await expect(dialog.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeDisabled();
  await dialog.getByLabel('IVA de los precios acordados').selectOption('incluido');
  await dialog.getByText('Documento y plan de cobro', { exact: true }).click();
  await dialog.getByLabel('Mostrar fecha de emisión en el PDF').uncheck();
  await dialog.getByLabel('Nombre del archivo PDF').fill('Obra Padre Hurtado.pdf');
  for (const [index,label,percentage] of [[1,'Anticipo','60'],[2,'Entrega','40']] as const) {
    await dialog.getByRole('button', { name: 'Añadir hito de cobro' }).click();
    await dialog.getByLabel(`Nombre del hito ${index}`, { exact: true }).fill(label);
    await dialog.getByLabel(`Porcentaje del hito ${index}`, { exact: true }).fill(percentage);
  }
  await expect(dialog).toContainText('1.348.200');
  await expect(dialog).toContainText('898.800');
  await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const pdf = page.getByRole('dialog', { name: 'Cotización generada' });
  await expect(pdf).toContainText('2.247.000');
  await expect(pdf.getByText(/^FECHA:/)).toHaveCount(0);
  const downloading = page.waitForEvent('download');
  await pdf.getByRole('button', { name: 'Descargar PDF', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('Obra_Padre_Hurtado.pdf');
  await download.saveAs('/tmp/obratrack-commercial-quote.pdf');
  expect((await readFile('/tmp/obratrack-commercial-quote.pdf')).subarray(0,5).toString()).toBe('%PDF-');
  expect(writes).toBe(1); expect(budget.cotizacion.estructura_financiera.precio_total_con_iva).toBe(2247000);
});

test('alternativas de una obra: compara diferencias, aplica la elegida y consulta revisiones sin sobrescribirlas', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const db = await setup(page, { respuesta: 'No utilizada', accion: null }, true);
  const make = (label: string, amount: number) => normalizeQuote({ titulo_proyecto: 'Remodelación', nombre_alternativa: label, modo_presupuesto: 'precio_acordado', tratamiento_iva: 'incluido', partidas_venta: [{ nombre: 'Alcance completo', unidad: 'gl', cantidad: 1, precio_unitario: amount }], materiales: [], mano_de_obra: [] });
  const quotes = [make('Wall panel',8811000), make('Deck WPC',8887000)];
  let group = { id: 'bg1', nombre: 'Remodelación', proyecto_id: 'p-existing', tipo: 'principal', aplicado: true, seleccionado_id: quotes[0].id, monto_aplicado: 8811000, ejecucion: {} };
  let rows: any[] = quotes.map((q,i) => ({ id:q.id, cotizacion:q, nombre_alternativa:q.nombre_alternativa, grupo_id:group.id, proyecto_id:group.proyecto_id, estado:i?'borrador':'aprobada', updated_at:'2026-11-03T12:00:00Z', grupo: group }));
  db.proyectos[0].monto_cotizado = 8811000;
  let selections = 0;
  await page.route('**/api/presupuestos**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/seleccionar')) {
      selections++;
      const body = route.request().postDataJSON();
      expect(body.id).toBe(quotes[1].id);expect(body.incluir_materiales).toBe(false);expect(body.incluir_gantt).toBe(false);
      group = {...group,seleccionado_id:quotes[1].id,monto_aplicado:8887000};
      rows = rows.map((r)=>({...r,estado:r.id===quotes[1].id?'aprobada':'no_elegida',grupo:group}));
      db.proyectos[0].monto_cotizado = 8887000;
      await route.fulfill({ json: { presupuesto: rows[1], grupo: group, proyecto: db.proyectos[0] } });
    } else {
      const id = url.searchParams.get('id');
      const filtered = id ? rows.filter(r=>r.id===id) : rows;
      const previous = { ...quotes[1], estructura_financiera: {...quotes[1].estructura_financiera,precio_total_con_iva:8800000} };
      await route.fulfill({ json: { presupuestos: filtered, revisiones: url.searchParams.has('historial') ? [{id:'rev1',version:'2026-11-01T12:00:00Z',cotizacion:previous}] : [] } });
    }
  });
  await page.goto('/proyectos/p-existing/presupuestos');
  const option = page.getByRole('article', { name: 'Opción Deck WPC' });
  await expect(option).toContainText('+'); await expect(option).toContainText('76.000');
  await option.getByRole('button', { name: 'Elegir y aplicar', exact: true }).click();
  const choose = page.getByRole('dialog', { name: 'Elegir presupuesto', exact: true });
  await expect(choose).toContainText('8.887.000');
  await choose.getByRole('button', { name: 'Elegir y actualizar obra' }).click();
  await expect(choose).toHaveCount(0);
  await expect(option).toContainText('Elegida para ejecución');
  await expect(option.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0);
  expect(db.proyectos.length).toBe(1); expect(selections).toBe(1);
  await option.getByRole('button', { name: 'Historial' }).click();
  await page.getByRole('button', { name: 'Ver revisión / PDF' }).click();
  const historyPdf=page.getByRole('dialog', {name:'Cotización generada'});
  await expect(historyPdf).toContainText('8.800.000');
  await expect(historyPdf.getByRole('button', {name:'Editar cotización'})).toHaveCount(0);
});

test('la plataforma presenta ObraBot sin marcas del proveedor ni conexiones directas de IA desde el celular', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await setup(page,{respuesta:'Soy ObraBot, el asistente de ObraTrack.',accion:null},true);
  const directRequests:string[]=[];
  page.on('request',request=>{if(/api\.openai\.com|generativelanguage\.googleapis\.com/.test(request.url()))directRequests.push(request.url());});
  for(const path of ['/cotizador','/planes','/proyectos/p-existing/ia','/proyectos/p-existing/cambios']){
    await page.goto(path);
    await expect(page.locator('body')).not.toContainText(/Gemini|OpenAI|GPT-6|Google AI/i);
  }
  await page.goto('/cotizador');
  await send(page,'¿Quién eres?');
  await expect(page.getByText('Soy ObraBot, el asistente de ObraTrack.',{exact:true})).toBeVisible();
  expect(directRequests).toEqual([]);
});

test('ObraBot recupera medidas anteriores a diez mensajes y las conserva al recargar sin mezclar otra obra',async({page})=>{
 await setup(page,{respuesta:'Conservo el radier de 6 por 4 metros y la corrección a 12 cm.',accion:null});
 await page.addInitScript(()=>{
  if(sessionStorage.getItem('context-fixture-seeded'))return;
  sessionStorage.setItem('context-fixture-seeded','true');
  const rows=[{id:'measurements',remitente:'usuario',texto:'Mi radier mide 6 por 4 metros, 10 cm de espesor y está en Maipú.',timestamp:'10:00'},
   ...Array.from({length:24},(_,i)=>({id:'context-'+i,remitente:i%2?'agente':'usuario',texto:'Consulta de seguimiento de la preparación.',timestamp:'10:01'})),
   {id:'other-work',remitente:'usuario',texto:'Medidas privadas de otra obra 99 metros.',obra_contexto_id:'otra-obra',timestamp:'10:02'},
   {id:'correction',remitente:'usuario',texto:'Corrijo: serán 12 cm de espesor.',timestamp:'10:03'}];
  localStorage.setItem('obratrack_chat_session_history_v7',JSON.stringify(rows));
 });
 let requests=0;
 await page.route('**/api/cotizador/chat',async route=>{
  const body=route.request().postDataJSON();requests++;
  expect(body.historial.some((r:any)=>r.texto.includes('6 por 4 metros'))).toBe(true);
  expect(body.historial.some((r:any)=>r.texto.includes('12 cm'))).toBe(true);
  expect(body.historial.some((r:any)=>r.texto.includes('99 metros'))).toBe(false);
  expect(JSON.stringify(body.historial).length).toBeLessThan(25000);
  await route.fulfill({json:{respuesta:'Conservo el radier de 6 por 4 metros y la corrección a 12 cm.',accion:null}});
 });
 await page.goto('/cotizador');await send(page,'Cotiza el radier con esas medidas');
 await expect(page.getByText('Conservo el radier de 6 por 4 metros y la corrección a 12 cm.',{exact:true})).toBeVisible();
 await page.reload();await expect(page.getByText('Conservo el radier de 6 por 4 metros y la corrección a 12 cm.',{exact:true})).toBeVisible();
 await send(page,'¿Qué espesor habíamos acordado?');expect(requests).toBe(2);
});
