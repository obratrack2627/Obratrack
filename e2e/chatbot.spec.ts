import { contactNameCommand, contactTurns, withNameEditContext } from '../lib/ai/contact-name-command';
import { personIntake } from '../lib/whatsapp/person-intake';
import { pendingPerson, withPersonContext } from '../lib/ai/person-context';
import { conversationHistory } from '../lib/ai/conversation';
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
  const active = page.getByRole('heading', { name: /Obras en curso/ });
  const flow = page.getByRole('heading', { name: /Flujo Financiero por Obra/ });
  const distribution = page.getByRole('heading', { name: 'Distribución de Cartera', exact: true });
  await expect(active).toBeVisible();
  await expect(page.locator('[data-project-status="activo"]').first()).toHaveText('En curso');
  const position = await active.boundingBox();
  expect(position!.y).toBeLessThan((await flow.boundingBox())!.y);
  expect(position!.y).toBeLessThan((await distribution.boundingBox())!.y);
  for (const module of ['gantt','finanzas','asistencia','cambios','documentos','presupuestos','ia']) {
    await page.goto('/proyectos/p-existing/' + module);
    await expect(page.getByRole('heading', { name: 'Terraza', exact: true }).first()).toBeVisible();
    if (module === 'finanzas') {
      await page.getByLabel('Exportaciones de la obra').click();
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
function fixtureToken(role='admin',dev=false) {
  return Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:ownerId,role:'authenticated',web_role:role,dev,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture-signature';
}
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
  developer = false,
) {
  const activeOwner = { ...owner, is_dev: developer };
  const db: Record<string, any[]> = {
    usuarios: [activeOwner],
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
      value: fixtureToken('admin',developer),
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
        dev: owner.is_dev === true,
        aud: "authenticated",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      const encode = (value: object) => btoa(JSON.stringify(value)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
      const token = `${encode({alg:'HS256',typ:'JWT'})}.${encode(payload)}.fixture-signature`;
      localStorage.setItem(
        "sb-localhost-auth-token",
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
    { owner: activeOwner, company, seedProject },
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
  await page.route("**/rest/v1/**", async (route) => {
    const url = new URL(route.request().url()),
      table = url.pathname.split("/").pop()!,
      method = route.request().method();
    const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS'};
    if(method==='OPTIONS'){await route.fulfill({status:204,headers:cors});return;}
    db[table] ||= [];
    if (table === "pagos" && method === "POST" && failPayment && !failed) {
      failed = true;
      await route.fulfill({
        status: 500, headers: cors,
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
      status: 200, headers: cors,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  return db;
}
async function send(page: Page, text: string) {
  // Esperar los datos cargados por React: escribir antes de hidratar puede perder el texto.
  await expect(
    page.locator("aside").getByText("Contratista", { exact: true }),
  ).toBeAttached();
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
  await expect(page.getByRole('button', { name: /Nueva obra/ })).toBeVisible();
  await expect(page.getByText('Obra 11', { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 950));
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(500);
  await page.getByRole('button', { name: /Nueva obra/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Crear obra', exact: true });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: '/tmp/obratrack-mobile-project-modal-open.png' });
  await expect(page.getByRole('button', { name: 'Abrir ObraBot' })).toBeHidden();
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
  await expect(page.getByRole('button', { name: 'Abrir ObraBot' })).toBeVisible();
});

test('clientes, equipo, finanzas y suscripción usan ventanas accesibles en un celular pequeño', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 360, height: 640 });
  await setup(page, { respuesta: 'Consulta', accion: null }, true);
  for (const [path, button] of [['/clientes', /Nuevo Cliente/], ['/equipo', /Agregar Trabajador/], ['/proyectos/p-existing/finanzas', /Registrar Pago/]]) {
    await page.goto(path as string);
    if (String(path).endsWith('/finanzas')) await page.getByRole('navigation', {name:'Secciones de finanzas'}).getByRole('button', { name: /^Cobros\b/ }).click();
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
  await page.getByRole('button', { name: 'Ver mi cuenta', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Tu suscripción' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('ObraBot abre un chat flotante contextual sin abandonar el módulo en celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const db = await setup(page, { respuesta: 'Tienes una obra activa.', accion: null }, true);
  db.mensajes_chat_proyecto=[{id:'native-context',proyecto_id:'p-existing',empresa_id:company,remitente:'usuario',texto:'El radier tiene 12 cm de espesor.',created_at:'2026-11-04T12:00:00Z'}];
  await page.route('**/api/proyectos/p-existing/chat', async route => { expect(route.request().postDataJSON().historial.some((m:any)=>m.texto.includes('12 cm'))).toBe(true);await route.fulfill({json:{respuesta:'Conservo los 12 cm de espesor.',accion:null}}); });
  await page.goto('/proyectos');
  const launcher = page.getByRole('button', { name: 'Abrir ObraBot' });
  await expect(launcher).toBeVisible();
  await page.getByRole('button', { name: 'Abrir menú' }).click();await expect(launcher).toBeHidden();
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await launcher.click();
  const panel=page.getByRole('dialog',{name:'Chat con ObraBot'});
  await expect(panel).toBeVisible();await expect(page).toHaveURL(/\/proyectos$/);
  await panel.getByLabel('Mensaje a ObraBot').fill('¿Qué obras tengo?');await panel.getByRole('button',{name:'Enviar mensaje'}).click();
  await expect(panel.getByText('Tienes una obra activa.',{exact:true})).toBeVisible();
  const rect=await panel.boundingBox();expect(rect!.y).toBeGreaterThanOrEqual(0);expect(rect!.y+rect!.height).toBeLessThanOrEqual(844);
  await page.screenshot({path:'/tmp/obratrack-floating-chat-mobile.png'});
  await page.keyboard.press('Escape');await expect(panel).toHaveCount(0);
  await page.goto('/proyectos/p-existing/finanzas');await launcher.click();
  await expect(panel.getByLabel('Obra de la conversación')).toHaveValue('p-existing');
  await expect(panel.getByText('Tienes una obra activa.',{exact:true})).toHaveCount(0);
  await expect(panel.getByText('El radier tiene 12 cm de espesor.',{exact:true})).toBeVisible();
  await panel.getByLabel('Mensaje a ObraBot').fill('¿Qué espesor acordamos?');await panel.getByRole('button',{name:'Enviar mensaje'}).click();
  await expect(panel.getByText('Conservo los 12 cm de espesor.',{exact:true})).toBeVisible();
  await panel.getByRole('link',{name:'Abrir chat completo'}).click();
  await expect(page).toHaveURL(/\/proyectos\/p-existing\/ia$/);
  await expect(page.getByText('Conservo los 12 cm de espesor.',{exact:true})).toBeVisible();
});

test('el perfil de terreno y supervisor sin Dev no pueden abrir páginas protegidas con JWT', async ({ page }) => {
  await setup(page, {respuesta:'No debe consultarse',accion:null},true);
  for(const role of ['terreno','supervisor']){
    await page.context().addCookies([{name:'obratrack_auth_token',value:fixtureToken(role),domain:'localhost',path:'/'}]);
    await page.goto('/cotizador');await expect(page).toHaveURL(/\/login\?error=acceso_whatsapp/);
    await expect(page.getByText('Tu perfil trabaja por WhatsApp.',{exact:false})).toBeVisible();
    await expect(page.getByRole('button',{name:'Abrir ObraBot'})).toHaveCount(0);
  }
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
  await expect(page.getByRole('button', { name: 'Abrir ObraBot' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir ObraBot' }).click();
  await expect(page.getByRole('dialog',{name:'Chat con ObraBot'}).getByText('Disponible con Pro o Pro IA.',{exact:false})).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
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
    page.getByRole("heading", { name: "Canal de WhatsApp" }),
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
        localStorage.getItem("sb-localhost-auth-token")!,
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
    page.getByRole("textbox", { name: "Mensaje para el asistente", exact: true }),
  ).toBeEnabled();
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
  await page.getByLabel('Crear presupuesto', { exact: true }).click();
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

test('Equipo muestra las obras con poco texto y registra trabajadores sin contraseñas ni duplicados',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const db=await setup(page,{respuesta:'Consulta',accion:null},true);
 db.usuarios.push({id:'worker-old',empresa_id:company,nombre:'Maestro Existente',email:'maestro@example.test',rut:'20000002-1',telefono_whatsapp:'+56911112222',rol:'terreno'});
 db.proyectos[0].trabajadores_ids=['worker-old'];
 await page.route('**/api/equipo/crear-usuario',async route=>{
  const input=route.request().postDataJSON();
  expect(input.proyecto_id).toBe('p-existing');expect(input.password).toBeUndefined();expect(input.empresa_id).toBeUndefined();
  const user={id:'worker-new',empresa_id:company,nombre:input.nombre,email:input.email,rut:input.rut,telefono_whatsapp:input.telefono,rol:input.rol};
  db.usuarios.push(user);db.proyectos[0].trabajadores_ids.push(user.id);
  await route.fulfill({json:{success:true,user}});
 });
 await page.goto('/equipo');
 await expect(page.getByLabel('Obras de Maestro Existente').getByRole('link',{name:'Terraza'})).toBeVisible();
 const add=page.getByRole('button',{name:'Agregar Trabajador',exact:true});
 await expect(add).not.toContainText('+');expect(await add.locator('svg.lucide-plus').count()).toBe(1);
 await add.click();const dialog=page.getByRole('dialog',{name:'Agregar trabajador',exact:true});
 await expect(dialog.getByText(/contraseña|Clave de Acceso/)).toHaveCount(0);
 await dialog.locator('#equipo-nombre').fill('Pedro Morales');await dialog.locator('#equipo-rut').fill('12345678-5');
 await dialog.getByLabel('Correo de contacto').fill('pedro@example.test');await dialog.locator('#equipo-telefono').fill('+56987654321');await dialog.getByLabel(/^Obra/).selectOption('p-existing');
 await dialog.getByRole('button',{name:'Registrar trabajador',exact:true}).click();
 await expect(dialog).toHaveCount(0);await expect(page.getByText('Pedro Morales',{exact:true})).toBeVisible();
 expect(db.usuarios.filter(user=>user.nombre==='Pedro Morales')).toHaveLength(1);
 await expect(page.getByLabel('Obras de Pedro Morales').getByRole('link',{name:'Terraza'})).toBeVisible();
 await page.screenshot({path:'/tmp/obratrack-team-mobile.png',fullPage:true});
});

test('solo Developer ve el selector de planes y confirma el cambio antes de actualizar la interfaz',async({page})=>{
 await setup(page,{respuesta:'Consulta',accion:null},true);
 await page.goto('/planes');await expect(page.getByRole('button',{name:'Cambiar plan de desarrollo'})).toHaveCount(0);
 const context=await page.context().browser()!.newContext();
 try {
  const developer=await context.newPage();
  const db=await setup(developer,{respuesta:'Consulta',accion:null},true,false,true);
  await developer.route('**/api/dev/plan',async route=>{const input=route.request().postDataJSON();expect(input.plan).toBe('pro');db.empresas[0].plan_id=input.plan;await route.fulfill({json:{plan_id:input.plan}})});
  await developer.goto('/planes');await developer.getByRole('button',{name:'Cambiar plan de desarrollo'}).click();
  await developer.getByLabel('Plan de desarrollo',{exact:true}).selectOption('pro');
  await expect(developer.getByRole('dialog',{name:'Tu suscripción'})).toHaveCount(0);
  await developer.getByRole('button',{name:'Cambiar plan de desarrollo'}).click();
  await expect(developer.getByRole('dialog',{name:'Tu suscripción'}).getByText('Plan Pro',{exact:true})).toBeVisible();
  expect(db.empresas[0].plan_id).toBe('pro');
 } finally { await context.close(); }
});

test('estado de obra se confirma, persiste al navegar y conserva el valor ante un error', async ({ page }) => {
  const db = await setup(page, { respuesta: 'Consulta', accion: null }, true);
  db.proyectos.push({ ...db.proyectos[0], id: 'p-other', nombre: 'Galpón' });
  let fail = false;
  await page.route('**/rest/v1/rpc/cambiar_estado_proyecto', async route => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    if (fail) { await route.fulfill({ status: 500, headers, json: { message: 'Falló el guardado' } }); return; }
    const { p_id, p_estado } = route.request().postDataJSON();
    const row = db.proyectos.find((p:any) => p.id === p_id);
    row.estado = p_estado;
    await route.fulfill({ headers, json: row });
  });
  await page.goto('/proyectos/p-existing/gantt');
  const state = page.getByRole('combobox', { name: 'Estado de la obra', exact: true });
  await expect(state).toHaveAttribute('data-project-status', 'activo');
  await expect(state).toContainText('En curso');
  for (const value of ['pendiente', 'cancelada', 'terminado', 'activo']) {
    await state.click();
    await page.getByRole('option', { name: ({pendiente:'Pendiente',cancelada:'Cancelada',terminado:'Terminada',activo:'En curso'} as Record<string,string>)[value], exact: true }).click();
    await expect(state).toBeEnabled();
    await expect(state).toHaveAttribute('data-project-status', value);
    expect(db.proyectos[0].estado).toBe(value);
    await page.getByRole('link', { name: 'Obras & Proyectos', exact: true }).click();
    await page.getByRole('tablist', {name:'Filtrar obras por estado'}).getByRole('tab', {name:/^Todas/}).click();
    await expect(page.locator('[data-project-id="p-existing"] [data-project-status]')).toHaveAttribute('data-project-status', value);
    await expect(page.locator('[data-project-id="p-other"] [data-project-status]')).toHaveAttribute('data-project-status', 'activo');
    await page.getByRole('link', { name: 'Terraza', exact: true }).click();
    await expect(state).toHaveAttribute('data-project-status', value);
  }
  await state.focus();
  await state.press('ArrowDown');
  await state.press('Home');
  await state.press('Enter');
  await expect(state).toBeEnabled();
  await page.getByRole('link', { name: /Finanzas y materiales/ }).click();
  await expect(state).toHaveAttribute('data-project-status', 'pendiente');
  fail = true;
  await state.click();
  await page.getByRole('option', { name: 'Cancelada', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No se pudo guardar' })).toBeVisible();
  await expect(state).toHaveAttribute('data-project-status', 'pendiente');
  expect(db.proyectos[0].estado).toBe('pendiente');
});

test('editar una obra conserva el formulario ante un fallo y solo confirma después de guardar', async ({ page }) => {
  const db = await setup(page, {}, true);
  let fail = true;
  await page.route('**/api/supabase/sync*', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    if (fail) return route.fulfill({ status: 503, json: { error: 'No se pudo guardar la obra' } });
    const row = route.request().postDataJSON().cambios.proyectos[0];
    db.proyectos[0] = row;
    await route.fulfill({ json: { success: true } });
  });
  await page.goto('/proyectos');
  await page.getByLabel('Acciones de Terraza', { exact: true }).click();
  await page.getByRole('button', { name: 'Editar obra', exact: true }).click();
  const dialog = page.getByRole('dialog').filter({ has: page.getByLabel('Nombre de la Obra *', { exact: true }) });
  await dialog.getByLabel('Nombre de la Obra *', { exact: true }).fill('Terraza actualizada');
  await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(dialog.getByRole('alert')).toContainText('No se pudo confirmar');
  expect(db.proyectos[0].nombre).toBe('Terraza');
  await expect(page.getByRole('link', { name: 'Terraza', exact: true })).toBeVisible();
  fail = false;
  await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Terraza actualizada', exact: true })).toBeVisible();
  expect(db.proyectos[0].nombre).toBe('Terraza actualizada');
});

test('la Carta Gantt incorpora cambios remotos sin recargar la página', async ({ page }) => {
  await page.clock.install();
  const db = await setup(page, {}, true);
  await page.goto('/proyectos/p-existing/gantt');
  await expect(page.getByRole('heading', { name: 'Terraza', exact: true }).first()).toBeVisible();
  db.proyectos[0].nombre = 'Terraza desde WhatsApp';
  await page.clock.fastForward(31000);
  await expect(page.getByRole('heading', { name: 'Terraza desde WhatsApp', exact: true }).first()).toBeVisible();
});

test('la asistencia de cuadrilla respeta licencias existentes y usa el horario elegido', async ({ page }) => {
  const db = await setup(page, {}, true);
  db.usuarios.push(...['uno', 'dos'].map((id, index) => ({ id, empresa_id: company, nombre: `Maestro ${index + 1}`, rol: 'terreno' })));
  db.proyectos[0].trabajadores_ids = ['uno', 'dos'];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
  db.asistencia_obreros = [{ id: 'leave', empresa_id: company, proyecto_id: 'p-existing', usuario_id: 'uno', trabajador_nombre: 'Maestro 1', fecha: today, estado: 'licencia', origen: 'web' }];
  let saved: any[] = [];
  await page.route('**/api/supabase/sync*', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    saved = route.request().postDataJSON().cambios.asistencias || [];
    await route.fulfill({ json: { success: true } });
  });
  await page.goto('/proyectos/p-existing/asistencia');
  await page.getByRole('tab', { name: 'Asistencia diaria', exact: true }).click();
  await expect(page.locator('[data-crew-member="uno"]')).toContainText('Licencia');
  await page.getByRole('button', { name: 'Marcar cuadrilla', exact: true }).click();
  await page.getByLabel('Entrada de cuadrilla', { exact: true }).fill('09:00');
  await page.getByLabel('Salida de cuadrilla', { exact: true }).fill('17:00');
  await page.getByRole('button', { name: 'Confirmar presencia', exact: true }).click();
  await expect(page.getByText('Asistencia guardada para 1 persona.', { exact: true })).toBeVisible();
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ usuario_id: 'dos', hora_entrada: '09:00', hora_salida: '17:00', estado: 'presente' });
  await expect(page.locator('[data-crew-member="uno"]')).toContainText('Licencia');
});

test('ObraBot flotante cancela la obra recién consultada y confirma el estado guardado sin cambiar su presupuesto', async ({ page }) => {
  const {projectStatusCommand} = await import('../lib/ai/project-status-command');
  const {conversationProjectId} = await import('../lib/ai/project-reference');
  const {conversationHistory} = await import('../lib/ai/conversation');
  const {projectDeadlineAnswer} = await import('../lib/ai/project-deadlines');
  const db = await setup(page, {}, true);
  db.proyectos[0].fecha_termino_estimada = '2000-01-01';
  db.proyectos.push({ ...db.proyectos[0], id:'p-other', nombre:'Ampliación PAC', fecha_termino_estimada:'2999-01-01', monto_cotizado:12000000 });
  await page.route('**/api/cotizador/chat', async route => {
    const body = route.request().postDataJSON();
    const history = conversationHistory(body.historial, body.mensaje);
    const result = projectDeadlineAnswer(body.mensaje, db.proyectos) || projectStatusCommand(body.mensaje, db.proyectos, conversationProjectId(db.proyectos, body.mensaje, history), history);
    expect(result).toBeTruthy();
    await route.fulfill({json:result});
  });
  await page.goto('/dashboard');
  await page.getByRole('button', { name:'Abrir ObraBot', exact:true }).click();
  const chat = page.getByRole('dialog', { name:'Chat con ObraBot', exact:true });
  await chat.getByRole('textbox').fill('hay obras con plazo vencido?');
  await chat.getByRole('button', { name:'Enviar mensaje', exact:true }).click();
  await expect(chat.getByText(/Tienes 1 obra con el plazo vencido/)).toBeVisible();
  await chat.getByRole('textbox').fill('quiero que la dejes como cancelada');
  await chat.getByRole('button', { name:'Enviar mensaje', exact:true }).click();
  await expect(chat.getByText(/Terraza quedó como cancelada/)).toBeVisible();
  expect(db.proyectos[0].estado).toBe('cancelada');
  expect(db.proyectos[0].monto_cotizado).toBe(3000000);
  expect(db.proyectos[1].estado).toBe('activo');
  expect(db.proyectos[1].monto_cotizado).toBe(12000000);
  await page.screenshot({path:'/tmp/obrabot-logica-contexto.png',fullPage:true});
});

async function expectMobileWidth(page: Page) {
  const overflow = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport);
}

test('WhatsApp mantiene el ancho móvil al elegir nombres largos y abrir registros y destinatarios', async ({page}) => {
  await page.setViewportSize({width:320,height:780});
  await setup(page,{},true);
  const longProject='Ampliación y remodelación de espacios de servicios e instalaciones de la comunidad de propietarios del sector norte';
  const longAuthor='Supervisor de instalaciones y terminaciones de la cuadrilla de obra del sector norte';
  const longToken='https://documentos.example.test/'+ 'comprobante'.repeat(45);
  await page.route('**/api/webhook/whatsapp',route=>route.fulfill({json:{cloud_api_configurada:true,numero:'15556154571'}}));
  await page.route('**/api/whatsapp/mensajes*',route=>route.fulfill({json:{gestion:true,total:1,autores:[{id:'supervisor',nombre:longAuthor}],obras:[{id:'p-existing',nombre:longProject}],mensajes:[{message_id:'long-report',texto:'Revisión del avance y del comprobante '+longToken,respuesta:'## Avance de obra\n**'+longProject+'**\n- Archivo: `'+longToken+'`\n- Comprobante: *"'+longToken+'"*',categoria:'registro',created_at:'2026-11-09T14:00:00Z',sent_at:'2026-11-09T14:00:01Z',autor:{nombre:longAuthor,rol:'supervisor'},obras:[{id:'p-existing',nombre:longProject}],acciones:{titulo:'Avance registrado',resultado_texto:longToken}}]}}));
  await page.route('**/api/whatsapp/avisos*',route=>route.fulfill({json:new URL(route.request().url()).searchParams.has('id')?{envios:[{id:'recipient',nombre:longAuthor,rol:'supervisor',telefono:'56912345678',estado:'fallido',error_detalle:longToken}]}:{total:1,avisos:[{id:'notice',destinatarios:1,created_at:'2026-11-09T14:00:00Z',mensaje:'Avance para '+longProject,estados:{fallido:1}}]}}));
  await page.goto('/reportes');
  await expect(page.getByText('Avance registrado',{exact:true}).first()).toBeVisible();
  await expectMobileWidth(page);
  for(const [label,value] of [['Tipo de registro','registro'],['Filtrar registros por obra','p-existing'],['Autor del registro','supervisor']]){
    await page.getByLabel(label,{exact:true}).selectOption(value);
    await expectMobileWidth(page);
  }
  await page.getByText('Ver detalle',{exact:true}).click();
  await expect(page.getByText('Respuesta de ObraTrack',{exact:true})).toBeVisible();
  await expectMobileWidth(page);
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:'/tmp/obratrack-whatsapp-mobile-details.png',fullPage:true});
  await page.getByRole('tab',{name:'Avisos enviados',exact:true}).click();
  await page.getByRole('button',{name:'Ver destinatarios',exact:true}).click();
  await expect(page.locator('td').filter({hasText:longAuthor})).toBeVisible();
  await expectMobileWidth(page);
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:'/tmp/obratrack-whatsapp-mobile-recipients.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await expect(page.getByRole('main')).toHaveCSS('padding-left','256px');
  await page.getByRole('tab',{name:'Registros',exact:true}).click();
  await expect(page.getByText('Avance registrado',{exact:true}).first()).toBeVisible();
  await page.screenshot({path:'/tmp/obratrack-whatsapp-desktop.png',fullPage:true});
});

test('los indicadores móviles permanecen visibles y ajustan los importes completos sin desbordarse',async({page})=>{
 await page.setViewportSize({width:320,height:780});
 const db=await setup(page,{},true);
 db.proyectos[0].monto_cotizado=987654321000;
 db.pagos=[{id:'large-payment',proyecto_id:'p-existing',monto:123456789000,estado:'completado',fecha:'2026-11-09'}];
 for(const path of ['/dashboard','/proyectos','/clientes','/equipo','/asistencia','/proyectos/p-existing/finanzas','/proyectos/p-existing/documentos','/proyectos/p-existing/cambios','/proyectos/p-existing/asistencia','/proyectos/p-existing/ia']){
  await page.goto(path);
  await expect(page.locator('.summary-overview')).toBeVisible();
  await expect(page.getByText('Ver resumen',{exact:true})).toHaveCount(0);
  await expectMobileWidth(page);
  expect(await page.locator('.workspace-metrics > div').evaluateAll(nodes=>Math.max(...nodes.map(node=>node.getBoundingClientRect().height)))).toBeLessThan(350);
  if(await page.locator('.money-amount').count())await expect.poll(()=>page.locator('.money-amount').evaluateAll(nodes=>nodes.every(node=>(node.firstElementChild?.scrollWidth||0)<=node.clientWidth+1))).toBe(true);
 }
 await page.goto('/dashboard');
 await expect(page.locator('.money-amount').first()).toContainText('987.654.321.000');
 await page.screenshot({path:'/tmp/obratrack-summaries-mobile.png',fullPage:true});
 const size=await page.locator('.money-amount > span').first().evaluate(el=>Number.parseFloat(getComputedStyle(el).fontSize));
 await page.setViewportSize({width:1440,height:1000});
 await expect.poll(()=>page.locator('.money-amount > span').first().evaluate(el=>Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(size);
});

test('Obras abre En curso y Todas mantiene las obras en curso al principio',async({page})=>{
 const db=await setup(page,{},true);
 db.proyectos.unshift({...db.proyectos[0],id:'ended',nombre:'Obra terminada',estado:'terminado'});
 db.proyectos.push({...db.proyectos[0],id:'pending',nombre:'Obra pendiente',estado:'pendiente'});
 await page.goto('/proyectos');
 const tabs=page.getByRole('tablist',{name:'Filtrar obras por estado'});
 await expect(tabs.getByRole('tab',{name:/^En curso/})).toHaveAttribute('aria-selected','true');
 await expect(page.locator('[data-project-id]')).toHaveCount(1);
 await expect(page.locator('[data-project-id]').first()).toHaveAttribute('data-project-id','p-existing');
 await tabs.getByRole('tab',{name:/^Todas/}).click();
 await expect(page.locator('[data-project-id]')).toHaveCount(3);
 await expect(page.locator('[data-project-id]').first()).toHaveAttribute('data-project-id','p-existing');
});

test('los presupuestos usan tarjetas adaptables y el teléfono no recibe un color de barra impuesto',async({page})=>{
 await page.setViewportSize({width:320,height:780});
 const db=await setup(page,{},true);
 db.proyectos[0].nombre='Obra de ampliación y mejoramiento del conjunto habitacional y sus espacios comunitarios';
 const quote=normalizeQuote({titulo_proyecto:'Terminaciones e instalaciones para espacios comunitarios',cliente_nombre:'Comunidad de propietarios del conjunto habitacional del sector norte',modo_presupuesto:'precio_acordado',tratamiento_iva:'incluido',partidas_venta:[{nombre:'Construcción acordada',cantidad:1,unidad:'gl',precio_unitario:987654321000}],materiales:[],mano_de_obra:[]});
 let budget:any={id:quote.id,cotizacion:quote,estado:'borrador',origen:'whatsapp',proyecto_id:null,created_at:'2026-11-09T14:00:00Z',updated_at:'2026-11-09T14:00:00Z'};
 await page.route('**/api/presupuestos*',route=>{if(route.request().method()==='PATCH'){budget={...budget,...route.request().postDataJSON()};return route.fulfill({json:{presupuesto:budget}});}return route.fulfill({json:{presupuestos:[budget]}});});
 await page.goto('/proyectos?tab=presupuestos');
 const card=page.getByRole('article',{name:`Presupuesto ${quote.titulo_proyecto}`,exact:true});
 await expect(card).toBeVisible();await expectMobileWidth(page);
 await expect(card.getByRole('button',{name:'Ver / PDF',exact:true})).toBeVisible();
 await expect.poll(()=>card.locator('.money-amount').evaluateAll(nodes=>nodes.every(node=>(node.firstElementChild?.scrollWidth||0)<=node.clientWidth+1))).toBe(true);
 await expect(page.locator('meta[name="theme-color"]')).toHaveCount(0);
 const manifest=await(await page.request.get('/manifest.webmanifest')).json();expect(manifest.theme_color).toBeUndefined();
 await card.getByLabel(`Obra de ${quote.titulo_proyecto}`,{exact:true}).selectOption('p-existing');
 await expectMobileWidth(page);
 await expect(card).toBeVisible();
 await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:'/tmp/obratrack-budgets-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 await expect(page.getByRole('main')).toHaveCSS('padding-left','256px');
 await expectMobileWidth(page);
 await page.screenshot({path:'/tmp/obratrack-budgets-desktop.png',fullPage:true});
});

test('la app instalada desde Chrome no impone colores a las barras del sistema', async ({page}) => {
 await page.setViewportSize({width:390,height:844});
 await setup(page,{},true);
 await page.addInitScript(()=>{
  const original=window.matchMedia.bind(window);
  window.matchMedia=(query:string)=>{const media=original(query);if(query==='(display-mode: standalone)')Object.defineProperty(media,'matches',{value:true});return media;};
  // Representa los metadatos de una instalación anterior a la actualización.
  document.addEventListener('DOMContentLoaded',()=>{const meta=document.createElement('meta');meta.name='theme-color';meta.content='#FF6A00';document.head.appendChild(meta);},{once:true});
 });
 await page.goto('/dashboard');
 await expect(page.locator('meta[name="theme-color"]')).toHaveCount(0);
 const manifest=await(await page.request.get('/manifest.webmanifest')).json();
 expect(manifest.theme_color).toBeUndefined();expect(manifest.background_color).toBeUndefined();expect(manifest.id).toBe('/proyectos');expect(manifest.scope).toBe('/');expect(manifest.start_url).toBe('/dashboard');
 await page.getByRole('button',{name:'Abrir menú',exact:true}).click();
 await page.locator('aside').getByRole('link',{name:'Obras y proyectos',exact:true}).click();
 await page.getByRole('link',{name:'Terraza',exact:true}).click();
 await expect(page).toHaveURL(/\/proyectos\/p-existing\/gantt/);
 await expect(page.locator('meta[name="theme-color"]')).toHaveCount(0);
});

async function setupGantt(page: Page) {
  const db = await setup(page, { respuesta: "Consulta", accion: null }, true);
  const names = [
    "Trazo, excavaciones y construcción de muros",
    "Fabricación y montaje de estructura metálica",
    "Estructura y cubierta de cobertizo",
    "Instalación de Metalsiding y revestimientos",
  ];
  const dates = [
    ["2026-11-02", "2026-11-09"],
    ["2026-11-09", "2026-11-16"],
    ["2026-11-16", "2026-11-24"],
    ["2026-11-24", "2026-12-02"],
  ];
  db.actividades = names.map((nombre, i) => ({
    id: "gantt-" + i,
    proyecto_id: "p-existing",
    nombre,
    fecha_inicio: dates[i][0],
    fecha_termino: dates[i][1],
    porcentaje_avance: i === 0 ? 100 : i === 1 ? 50 : 0,
    estado: i === 0 ? "terminada" : i === 1 ? "en_curso" : "pendiente",
    orden: i + 1,
  }));
  db.usuarios.push({
    id: "worker-gantt",
    empresa_id: company,
    nombre: "Miguel Soto",
    rol: "terreno",
  });
  db.proyectos[0].trabajadores_ids = ["worker-gantt"];
  // Cargar el mismo conjunto tanto desde caché como desde la sincronización simulada.
  await page.addInitScript(
    ({ activities, users }) => {
      localStorage.setItem(
        "obratrack_actividades_v7_fixture-company",
        JSON.stringify(activities),
      );
      localStorage.setItem(
        "obratrack_usuarios_v7_fixture-company",
        JSON.stringify(users),
      );
    },
    { activities: db.actividades, users: db.usuarios },
  );
  return db;
}

test("Gantt usa un calendario común, mantiene la escala al filtrar y permite navegar sin alterar datos", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1536, height: 1050 });
  const db = await setupGantt(page);
  const before = JSON.stringify(db.actividades);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/proyectos/p-existing/gantt");
  const module = page.getByRole("region", {
    name: "Planificación de obra",
    exact: true,
  });
  await expect(
    module.getByRole("button", { name: "Gantt gráfico", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const calendar = module.getByRole("region", {
    name: "Calendario de partidas",
  });
  await expect(calendar.locator("[data-activity-bar]")).toHaveCount(4);
  const positions = await calendar
    .locator("[data-activity-bar]")
    .evaluateAll((elements) =>
      elements.map((el) => Number.parseFloat((el as HTMLElement).style.left)),
    );
  expect(positions[0]).toBeLessThan(positions[1]);
  expect(positions[1]).toBeLessThan(positions[2]);
  await module
    .getByRole("button", { name: "Pendientes (2)", exact: true })
    .click();
  await expect(calendar.locator("[data-activity-bar]")).toHaveCount(2);
  expect(
    await calendar
      .locator("[data-activity-bar]")
      .first()
      .evaluate((el) => Number.parseFloat((el as HTMLElement).style.left)),
  ).toBe(positions[2]);
  await module.getByRole("button", { name: "Todas (4)", exact: true }).click();
  await module.screenshot({ path: "/tmp/obratrack-gantt-desktop.png" });
  await module.getByRole("button", { name: "Periodo siguiente" }).click();
  await expect(calendar.locator("[data-activity-bar]")).toHaveCount(0);
  await module.getByRole("button", { name: "Inicio", exact: true }).click();
  await expect(calendar.locator("[data-activity-bar]")).toHaveCount(4);
  await module.getByLabel("Escala del calendario").selectOption("meses");
  await expect(
    calendar.getByText("enero de 2027", { exact: true }),
  ).toBeVisible();
  expect(JSON.stringify(db.actividades)).toBe(before);
  expect(errors).toEqual([]);
});

test("Gantt móvil prioriza tarjetas y conserva responsables, avances, fechas y edición", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const db = await setupGantt(page);
  await page.goto("/proyectos/p-existing/gantt");
  const module = page.getByRole("region", {
    name: "Planificación de obra",
    exact: true,
  });
  await expect(
    module.getByRole("button", { name: "Tarjetas de faena", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    module.getByRole("region", { name: "Calendario de partidas" }),
  ).toBeHidden();
  const card = module.getByRole("article", {
    name: "Partida Fabricación y montaje de estructura metálica",
    exact: true,
  });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "+25%", exact: true }).click();
  await expect(card.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "75",
  );
  await expect.poll(() => db.actividades[1].porcentaje_avance).toBe(75);
  await card.getByRole("button", { name: /Editar Fabricación/ }).click();
  const dialog = page.getByRole("dialog", {
    name: "Editar Partida de Faena",
    exact: true,
  });
  await dialog
    .getByRole("combobox", { name: "Responsable", exact: true })
    .selectOption("worker-gantt");
  await dialog
    .getByLabel("Fecha de término", { exact: true })
    .fill("2026-11-18");
  await dialog
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    card.getByRole("button", { name: /Cambiar responsable/ }),
  ).toHaveText("Miguel Soto");
  await expect.poll(() => db.actividades[1].fecha_termino).toBe("2026-11-18");
  await card.getByRole("button", { name: "100%", exact: true }).click();
  await expect(card.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "100",
  );
  await expect(card.getByText("Terminada", { exact: true })).toBeVisible();
  await expect.poll(() => db.actividades[1].estado).toBe("terminada");
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: "/tmp/obratrack-gantt-mobile-cards.png",
    fullPage: true,
  });
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await module
    .getByRole("button", { name: "Gantt gráfico", exact: true })
    .click();
  const calendar = module.getByRole("region", {
    name: "Calendario de partidas",
  });
  await expect(calendar).toBeVisible();
  expect(await calendar.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    true,
  );
  await calendar.evaluate((el) => (el.scrollLeft = 250));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/obratrack-gantt-mobile-calendar.png",
    fullPage: true,
  });
  await expect(
    calendar.getByRole("button", {
      name: "Trazo, excavaciones y construcción de muros",
      exact: true,
    }),
  ).toBeInViewport();
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await module.screenshot({ path: "/tmp/obratrack-gantt-mobile-dark.png" });
  await module
    .getByRole("button", { name: "En curso (0)", exact: true })
    .click();
  await expect(
    module.getByText("No hay partidas con este estado.", { exact: true }),
  ).toBeVisible();
  await module
    .getByRole("button", { name: "Ver todas las partidas", exact: true })
    .click();
  await expect(calendar).toBeVisible();
});

test("Gantt permite agregar y eliminar partidas desde un teléfono y bloquea fechas invertidas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const db = await setupGantt(page);
  await page.goto("/proyectos/p-existing/gantt");
  const module = page.getByRole("region", {
    name: "Planificación de obra",
    exact: true,
  });
  await module
    .getByRole("button", { name: "Nueva partida", exact: true })
    .click();
  const add = page.getByRole("dialog", { name: "Nueva partida", exact: true });
  await add
    .getByLabel("Nombre de la partida", { exact: true })
    .fill("Revisión final");
  await add.getByLabel("Fecha de inicio", { exact: true }).fill("2026-12-03");
  await add.getByLabel("Fecha de término", { exact: true }).fill("2026-12-02");
  await add
    .getByRole("button", { name: "Guardar Partida", exact: true })
    .click();
  await expect(add).toBeVisible();
  expect(db.actividades).toHaveLength(4);
  expect(
    await add
      .getByLabel("Fecha de término", { exact: true })
      .evaluate((el: HTMLInputElement) => el.validity.rangeUnderflow),
  ).toBe(true);
  await add.getByLabel("Fecha de término", { exact: true }).fill("2026-12-04");
  await add
    .getByRole("button", { name: "Guardar Partida", exact: true })
    .click();
  await expect(add).toBeHidden();
  const card = module.getByRole("article", {
    name: "Partida Revisión final",
    exact: true,
  });
  await expect(card).toBeVisible();
  await expect.poll(() => db.actividades.length).toBe(5);
  await card
    .getByRole("button", { name: "Editar Revisión final", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "Editar Partida de Faena",
    exact: true,
  });
  const box = await editor.locator("form").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(321);
  await editor
    .getByLabel("Nombre de la actividad", { exact: true })
    .fill("Revisión de entrega");
  await editor
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await module
    .getByRole("button", { name: "Editar Revisión de entrega", exact: true })
    .click();
  await editor.getByRole("button", { name: "Eliminar", exact: true }).click();
  const confirm = page.getByRole("dialog", {
    name: "Eliminar partida",
    exact: true,
  });
  await confirm.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(
    module.getByRole("article", {
      name: "Partida Revisión de entrega",
      exact: true,
    }),
  ).toBeVisible();
  await module
    .getByRole("button", { name: "Editar Revisión de entrega", exact: true })
    .click();
  await editor.getByRole("button", { name: "Eliminar", exact: true }).click();
  await confirm
    .getByRole("button", { name: "Sí, eliminar", exact: true })
    .click();
  await expect(
    module.getByRole("article", {
      name: "Partida Revisión de entrega",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect.poll(() => db.actividades.length).toBe(4);
});

test("sincronización móvil muestra el registro rechazado y conserva el pendiente hasta confirmar el reintento", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, {}, true);
  const pending = {
    usuarios: { [ownerId]: { ...owner, nombre: "Nombre pendiente" } },
  };
  await page.addInitScript(
    (value) =>
      localStorage.setItem(
        "obratrack_dirty_v1_fixture-company",
        JSON.stringify(value),
      ),
    pending,
  );
  let fail = true,
    posts = 0;
  await page.route("**/api/supabase/sync*", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    posts++;
    expect(route.request().postDataJSON().cambios.usuarios[0].nombre).toBe(
      "Nombre pendiente",
    );
    await route.fulfill({
      status: fail ? 503 : 200,
      json: fail
        ? {
            code: "SYNC_SAVE",
            error:
              "No se pudo guardar la ficha de «Nombre pendiente». Los cambios siguen pendientes en este dispositivo.",
          }
        : { success: true },
    });
  });
  await page.goto("/proyectos");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "No se pudo guardar la ficha de «Nombre pendiente»" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem("obratrack_dirty_v1_fixture-company") || "{}",
        ).usuarios,
    ),
  ).toEqual(pending.usuarios);
  fail = false;
  await page
    .getByRole("button", { name: "Reintentar sincronización", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Reintentar sincronización",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(posts).toBeGreaterThanOrEqual(2);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem("obratrack_dirty_v1_fixture-company") || "{}",
        ).usuarios,
    ),
  ).toEqual({});
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test('ObraBot móvil conserva el alta tras consultar obras y registra teléfono local y asignación después de corregir solo el RUT', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  const db=await setup(page,{},true);db.proyectos[0].nombre='Baño';
  let requests=0,registrations=0;
  await page.route('**/api/cotizador/chat',async route=>{
    requests++;const body=route.request().postDataJSON();
    const draft=pendingPerson(body.historial,conversationHistory(body.historial,body.mensaje),db.proyectos);
    if (body.mensaje==='¿Qué obras tengo?') {
      expect(draft?.items[0].nombre).toBe('Ramón Escobar');
      await route.fulfill({json:withPersonContext({respuesta:'Tienes la obra Baño en curso.',accion:null,cotizacion:null},draft)});return;
    }
    const step=personIntake([],null,draft,body.mensaje,db.proyectos,undefined,db.usuarios);
    await route.fulfill({json:withPersonContext({respuesta:step.question || 'Voy a registrar la ficha y su asignación.',accion:step.actions.length?{tipo:'lote_acciones',acciones:step.actions}:null,cotizacion:null},step.draft)});
  });
  await page.route('**/rest/v1/rpc/crear_integrante_equipo',async route=>{
    registrations++;const body=route.request().postDataJSON();
    expect(body.p_datos.telefono_whatsapp).toBe('+56967345678');expect(body.p_proyecto).toBe('p-existing');
    const worker={...body.p_datos,empresa_id:company,auth_user_id:null,is_dev:false};db.usuarios.push(worker);
    await route.fulfill({json:worker,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'}});
  });
  await page.goto('/cotizador');
  await send(page,'Necesito agregar un trabajador');
  await expect(page.getByText(/Para registrar al trabajador falta:/).last()).toBeVisible();
  await send(page,'Ramón Escobar, terreno, 67345678, rut 200635468, correo ramon@example.test, asignalo a la obra Baño');
  await expect(page.getByText(/Para registrar Ramón Escobar falta:/).last()).toBeVisible();
  expect(registrations).toBe(0);
  await page.getByRole('link',{name:'ObraTrack',exact:true}).click();
  await page.getByRole('button',{name:'Abrir ObraBot',exact:true}).click();
  const widget=page.getByRole('dialog',{name:'Chat con ObraBot',exact:true});
  await expect(widget.getByText(/Para registrar Ramón Escobar falta:/)).toBeVisible();
  const widgetSend=async(text:string)=>{await widget.getByRole('textbox').fill(text);await widget.getByRole('button',{name:'Enviar mensaje',exact:true}).click();};
  await widgetSend('¿Qué obras tengo?');
  await expect(widget.getByText('Tienes la obra Baño en curso.',{exact:true})).toBeVisible();
  await widgetSend('12.345.678-5');
  await expect(page.getByText(/Registré el trabajador Ramón Escobar/).first()).toBeVisible();
  expect(registrations).toBe(1);expect(requests).toBe(4);
  await expect.poll(()=>db.proyecto_trabajadores?.some(row=>row.proyecto_id==='p-existing' && row.usuario_id===db.usuarios.find(user=>user.nombre==='Ramón Escobar')?.id)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('ObraBot móvil mantiene el cambio de nombre mientras identifica por RUT y actualiza la misma ficha',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const db=await setup(page,{},true);
 const worker={id:'bad-name-worker',empresa_id:company,nombre:'Ya te di todos los datos',rut:'12345678-5',rol:'terreno',telefono_whatsapp:'+56967345678',email:'worker@example.test',auth_user_id:null,is_dev:false};
 db.usuarios.push(worker);db.proyectos[0].trabajadores_ids=[worker.id];
 let updates=0;
 await page.route('**/api/cotizador/chat',async route=>{
  const body=route.request().postDataJSON();
  const result=contactNameCommand(body.mensaje,db.usuarios,contactTurns(body.historial),ownerId);
  expect(result.handled).toBe(true);
  await route.fulfill({json:withNameEditContext({respuesta:result.question || 'Voy a corregir el nombre de la ficha.',accion:result.action || null,cotizacion:null},result.pending || null,true)});
 });
 await page.route('**/rest/v1/rpc/actualizar_contacto_equipo',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'}});
  updates++;const body=route.request().postDataJSON();
  expect(body.p_usuario).toBe(worker.id);expect(body.p_datos.rut).toBe(worker.rut);expect(body.p_datos.nombre).toBe('Felipe Melo');
  Object.assign(worker,body.p_datos);
  await route.fulfill({json:worker,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'}});
 });
 await page.goto('/cotizador');
 await send(page,'Ok pero cámbiale el nombre, se llama Felipe Melo');
 await expect(page.getByText(/¿A qué trabajador le cambio el nombre?/)).toBeVisible();
 expect(updates).toBe(0);
 await send(page,'Su rut es 123456785');
 await expect(page.getByText(/Actualicé los datos de Felipe Melo/).first()).toBeVisible();
 expect(updates).toBe(1);expect(db.usuarios).toHaveLength(2);
 expect(worker.id).toBe('bad-name-worker');expect(worker.rut).toBe('12345678-5');expect(worker.telefono_whatsapp).toBe('+56967345678');
 expect(db.proyectos[0].trabajadores_ids).toEqual([worker.id]);
});

test('ObraBot móvil conserva y permite olvidar preferencias al recargar sin mostrar un registro de obra falso',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await setup(page,{respuesta:'Consulta',accion:null});
 const {conversationPreferences,withPreferences}=await import('../lib/ai/preferences');
 let queries=0;
 await page.route('**/api/cotizador/chat',async route=>{
  const body=route.request().postDataJSON();const memory=conversationPreferences(body.historial,owner,undefined,body.mensaje);
  if(!memory.respuesta){queries++;expect(memory.state.valores.detalle).toBe('breve');}
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(withPreferences({respuesta:memory.respuesta || 'Puedo ayudarte con partidas y novedades.',accion:null,cotizacion:null,sugerencias:[]},memory.state))});
 });
 await page.goto('/cotizador');
 await send(page,'Recuerda que prefiero respuestas cortas');
 await expect(page.getByText('Lo tendré en cuenta como preferencia en esta conversación. Puedes pedirme que la cambie o la olvide.',{exact:true})).toBeVisible();
 await page.reload();await send(page,'¿Qué puedo gestionar en terreno?');
 await expect(page.getByText('Puedo ayudarte con partidas y novedades.',{exact:true})).toBeVisible();expect(queries).toBe(1);
 await send(page,'Olvida todas mis preferencias');
 await expect(page.getByText('Dejaré de usar esa preferencia en esta conversación. Los registros de tus obras se conservan.',{exact:true})).toBeVisible();
 await page.reload();await send(page,'¿Qué recuerdas de mis preferencias?');
 await expect(page.getByText('No tengo preferencias guardadas en esta conversación.',{exact:true})).toBeVisible();
 await expect(page.getByText('Preferencias de conversación',{exact:true})).toHaveCount(0);
});

for (const width of [390,1280]) test(`Equipo permite especialidades múltiples opcionales y las conserva al recargar (${width}px)`, async ({page})=>{
 test.setTimeout(120000);
 await page.setViewportSize({width,height:900});
 const db=await setup(page,{respuesta:'Consulta',accion:null},true);
 await page.route('**/api/supabase/sync*',async route=>{
  if(route.request().method()==='POST'){
   const payload=route.request().postDataJSON();
   for(const row of payload.cambios?.usuarios || []){
    const target=db.usuarios.find(u=>u.id===row.id); if(target) Object.assign(target,row);
   }
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true})});return;
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({empresaId:company,plan_id:'pro_ia',usuarios:db.usuarios,proyectos:db.proyectos,clientes:[],actividades:[],pagos:[],materiales:[],bitacora:[],imprevistos:[],asistencias:[],documentos:[],agenda:[],reportes_whatsapp:[]})});
 });
 await page.route('**/api/equipo/crear-usuario',async route=>{
  const input=route.request().postDataJSON();
  expect(input.especialidades).toEqual(['Carpintería','Gasfitería']);
  const user={...input,id:'skills-worker',empresa_id:company,telefono_whatsapp:input.telefono};db.usuarios.push(user);
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,user})});
 });
 await page.goto('/equipo');
 await page.getByRole('button',{name:'Agregar Trabajador',exact:true}).click();
 const specialties=page.locator('#equipo-especialidades');
 await expect(specialties).not.toHaveAttribute('required');
 await page.locator('#equipo-nombre').fill('Pedro Morales');
 await specialties.fill('Carpintería, Gasfitería, CARPINTERIA');
 await page.locator('#equipo-rut').fill('123456785');
 await page.locator('#worker-email').fill('pedro@example.test');
 await page.locator('#equipo-telefono').fill('912345678');
 await page.locator('#equipo-rol').selectOption('supervisor');
 await page.getByRole('button',{name:'Registrar trabajador',exact:true}).click();
 const card=page.locator('[data-team-member="skills-worker"]');
 await expect(card.getByText('Gasfitería',{exact:true})).toBeVisible();
 await page.reload();
 await expect(card.getByText('Carpintería',{exact:true})).toBeVisible();
 await page.getByPlaceholder('Buscar nombre, especialidad, teléfono o correo...').fill('gasfiteria');
 await expect(card).toBeVisible();
 await expect(page.locator('[data-team-member]')).toHaveCount(1);
 await card.getByTitle('Editar datos',{exact:true}).click();
 await page.locator('#equipo-editEspecialidades').fill('Pintura');
 const saved=page.waitForResponse(r=>r.url().includes('/api/supabase/sync')&&r.request().method()==='POST'&&r.status()===200);
 await page.getByRole('button',{name:'Guardar Cambios',exact:true}).click();await saved;
 await page.reload();
 await expect(card.getByText('Pintura',{exact:true})).toBeVisible();
 expect(db.usuarios.find(u=>u.id==='skills-worker')?.rol).toBe('supervisor');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('Cuadrilla asigna solo integrantes elegidos, persiste y conserva historial al retirar', async ({ page }) => {
  const db = await setup(page, {}, true);
  db.usuarios.push(
    { id:'welder', empresa_id:company, nombre:'Felipe Melo', rol:'terreno', especialidades:['Soldadura'] },
    { id:'painter', empresa_id:company, nombre:'Ana Pérez', rol:'terreno', especialidades:['Pintura'] },
  );
  db.proyectos[0].trabajadores_ids=[];
  db.actividades=[{id:'metal',proyecto_id:'p-existing',nombre:'Montaje de estructura metálica',estado:'pendiente',porcentaje_avance:0,fecha_inicio:'2026-11-15',fecha_termino:'2026-11-20',orden:1}];
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago'}).format(new Date());
  db.asistencia_obreros=[{id:'old',empresa_id:company,proyecto_id:'p-existing',usuario_id:'welder',trabajador_nombre:'Felipe Melo',fecha:today,estado:'presente',hora_entrada:'09:00',hora_salida:'17:00',horas_trabajadas:7,origen:'web'}];
  let failing=true;
  const requests: string[]=[];
  await page.route('**/api/proyectos/p-existing/cuadrilla', async route => {
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    requests.push(route.request().method());
    if(failing)return route.fulfill({status:503,json:{error:'No se pudo confirmar la asignación.'}});
    const id=route.request().postDataJSON().usuario_id;
    db.proyectos[0].trabajadores_ids=route.request().method()==='DELETE' ? db.proyectos[0].trabajadores_ids.filter((value:string)=>value!==id) : Array.from(new Set([...db.proyectos[0].trabajadores_ids,id]));
    await route.fulfill({json:{proyecto_id:'p-existing',trabajadores_ids:db.proyectos[0].trabajadores_ids}});
  });
  await page.goto('/proyectos/p-existing/asistencia');
  await expect(page.getByRole('heading',{name:'Cuadrilla de la obra'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Cuadrilla',exact:true})).toBeVisible();
  await expect(page.getByText('Esta obra todavía no tiene cuadrilla',{exact:true})).toBeVisible();
  await expect(page.locator('[data-crew-member]')).toHaveCount(0);
  await expect(page.getByText('Coincide con «Montaje de estructura metálica».',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Ana Pérez',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Revisar asignación',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Asignar trabajadores',exact:true});
  await expect(dialog.getByRole('checkbox',{name:/Felipe Melo/})).toBeChecked();
  await dialog.getByRole('button',{name:'Asignar seleccionados (1)',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('No se pudo confirmar');
  await expect(page.locator('[data-crew-member]')).toHaveCount(0);
  failing=false;
  await dialog.getByRole('button',{name:'Asignar seleccionados (1)',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-crew-member="welder"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-crew-member]')).toHaveCount(1);
  await page.getByLabel('Buscar trabajador o especialidad',{exact:true}).fill('soldadura');
  await expect(page.locator('[data-crew-member="welder"]')).toBeVisible();
  await page.screenshot({path:'/tmp/obratrack-crew-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Retirar a Felipe Melo',exact:true}).click();
  await page.getByRole('button',{name:'Confirmar retiro',exact:true}).click();
  await expect(page.locator('[data-crew-member]')).toHaveCount(0);
  await page.getByRole('tab',{name:'Asistencia diaria',exact:true}).click();
  await expect(page.locator('[data-crew-member]')).toHaveCount(0);
  await page.getByRole('tab',{name:'Historial',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Felipe Melo',exact:true})).toBeVisible();
  await expect(page.getByText('Fuera de la cuadrilla actual',{exact:true})).toBeVisible();
  expect(db.asistencia_obreros).toHaveLength(1);
  expect(requests).toEqual(['POST','POST','DELETE']);
});

test('Cuadrilla móvil registra sin inventar horarios y permite reintentar un guardado fallido', async ({ page }) => {
  await page.setViewportSize({width:320,height:780});
  const db=await setup(page,{},true);
  db.usuarios.push({id:'worker',empresa_id:company,nombre:'Ramón Escobar',rol:'terreno',especialidades:['Carpintería','Techumbre']});
  db.proyectos[0].trabajadores_ids=['worker'];
  let failing=true;let saved:any[]=[];
  await page.route('**/api/supabase/sync*',async route=>{
    if(route.request().method()!=='POST')return route.fallback();
    if(failing)return route.fulfill({status:503,json:{error:'Sin conexión'}});
    saved=route.request().postDataJSON().cambios.asistencias || [];
    db.asistencia_obreros=saved;
    return route.fulfill({json:{success:true}});
  });
  await page.goto('/proyectos/p-existing/asistencia');
  await page.getByRole('tab',{name:'Asistencia diaria',exact:true}).click();
  await expectMobileWidth(page);
  await page.screenshot({path:'/tmp/obratrack-crew-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Registrar asistencia',exact:true}).click();
  let dialog=page.getByRole('dialog',{name:'Registrar asistencia',exact:true});
  await expect(dialog.getByLabel('Entrada',{exact:true})).toHaveValue('');
  await expect(dialog.getByLabel('Salida',{exact:true})).toHaveValue('');
  await dialog.getByRole('button',{name:'Guardar asistencia',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('pendiente de sincronización');
  failing=false;
  await dialog.getByRole('button',{name:'Guardar asistencia',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({usuario_id:'worker',estado:'presente',hora_entrada:'',hora_salida:'',horas_trabajadas:0});
  await expect(page.getByText('Horas pendientes de confirmar',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Editar asistencia',exact:true}).click();
  dialog=page.getByRole('dialog',{name:'Registrar asistencia',exact:true});
  await dialog.getByLabel('Entrada',{exact:true}).fill('09:00');
  await dialog.getByLabel('Salida',{exact:true}).fill('17:00');
  await dialog.getByLabel('Colación (minutos)',{exact:true}).fill('60');
  const box=await dialog.locator('form').boundingBox();
  expect(box!.width).toBeLessThanOrEqual(320);
  await page.screenshot({path:'/tmp/obratrack-crew-mobile-editor.png',fullPage:true});
  await dialog.getByRole('button',{name:'Guardar asistencia',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({hora_entrada:'09:00',hora_salida:'17:00',horas_trabajadas:7});
  await expect(page.getByText('7 h registradas',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Editar asistencia',exact:true}).click();
  await expect(page.getByLabel('Colación (minutos)',{exact:true})).toHaveValue('60');
});

async function installedMode(page: Page) {
  await page.addInitScript(() => {
    const original=window.matchMedia.bind(window);
    window.matchMedia=(query:string)=>{
      const media=original(query);
      if(query==='(display-mode: standalone)')Object.defineProperty(media,'matches',{value:true});
      return media;
    };
  });
}

async function expectPageAtStart(page: Page) {
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  expect(await page.evaluate(()=>window.scrollY)).toBe(0);
}

test('la app instalada inicia en Centro de Mando y los módulos móviles abren al principio', async ({page}) => {
  test.setTimeout(120000);
  await page.setViewportSize({width:390,height:844});
  const db=await setup(page,{},true);
  db.proyectos.push(...Array.from({length:12},(_,index)=>({...db.proyectos[0],id:`p-${index}`,nombre:`Obra ${index+1}`})));
  await installedMode(page);
  const manifest=await(await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.start_url).toBe('/dashboard');
  expect(manifest.id).toBe('/proyectos');
  await page.goto(manifest.start_url);
  await expect(page.getByRole('heading',{name:'Centro de Mando',exact:true})).toBeVisible();
  await expectPageAtStart(page);
  await page.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
  expect(await page.evaluate(()=>scrollY)).toBeGreaterThan(300);
  for(const [label,path] of [['Obras y proyectos','/proyectos'],['WhatsApp','/reportes'],['Equipo','/equipo'],['Clientes','/clientes'],['Asistencia','/asistencia'],['Centro de Mando','/dashboard']]) {
    await page.getByRole('button',{name:'Abrir menú',exact:true}).click();
    await page.locator('aside').getByRole('link',{name:label,exact:true}).click();
    await expect(page).toHaveURL(new RegExp(path+'$'));
    await expectPageAtStart(page);
    await page.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
  }
  await page.goBack();
  await expect(page).toHaveURL(/\/asistencia$/);
  await expectPageAtStart(page);
  await page.goForward();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expectPageAtStart(page);
  await page.getByRole('button',{name:'Abrir menú',exact:true}).click();
  await page.locator('aside').getByRole('link',{name:'Obras y proyectos',exact:true}).click();
  await page.getByRole('link',{name:'Terraza',exact:true}).click();
  await expect(page).toHaveURL(/\/proyectos\/p-existing\/gantt$/);
  await expectPageAtStart(page);
  await page.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
  await page.getByRole('link',{name:/Finanzas y materiales/}).click();
  await expect(page).toHaveURL(/\/proyectos\/p-existing\/finanzas$/);
  await expectPageAtStart(page);
  await page.screenshot({path:'/tmp/obratrack-installed-navigation-mobile.png'});
});

test('instalaciones antiguas abren Centro de Mando sin impedir entrar luego a Obras', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await setup(page,{},true);
  await installedMode(page);
  await page.goto('/proyectos');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading',{name:'Centro de Mando',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Abrir menú',exact:true}).click();
  await page.locator('aside').getByRole('link',{name:'Obras y proyectos',exact:true}).click();
  await expect(page).toHaveURL(/\/proyectos$/);
  await expect(page.getByRole('link',{name:'Terraza',exact:true})).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/proyectos$/);
});

test('la app instalada respeta accesos directos explícitos y obras enlazadas', async ({page}) => {
  await setup(page,{},true);
  await installedMode(page);
  const manifest=await(await page.request.get('/manifest.webmanifest')).json();
  await page.goto(manifest.shortcuts.find((item:any)=>item.short_name==='Obras').url);
  await expect(page).toHaveURL(/\/proyectos\?entrada=acceso-directo$/);
  await expect(page.getByRole('heading',{name:'Obras y proyectos',exact:true})).toBeVisible();
  await page.goto('/proyectos/p-existing/gantt');
  await expect(page.getByRole('heading',{name:'Terraza',exact:true}).first()).toBeVisible();
  await expect(page).toHaveURL(/\/proyectos\/p-existing\/gantt$/);
});
