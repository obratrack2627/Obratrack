import { test, expect, type Page } from '@playwright/test';
import { normalizeQuote } from '../lib/ai/protocol';

const ownerId = '00000000-0000-0000-0000-000000000001';
const company = 'fixture-company';
const owner = {
  id: ownerId,
  auth_user_id: ownerId,
  empresa_id: company,
  nombre: 'Contratista de prueba',
  email: 'owner@example.test',
  rol: 'admin',
  telefono_whatsapp: '',
};
async function setup(
  page: Page,
  reply: any,
  seedProject = false,
  failPayment = false,
) {
  const db: Record<string, any[]> = {};
  let failed = false;
  await page
    .context()
    .addCookies([
      {
        name: 'obratrack_auth_token',
        value: ownerId,
        domain: 'localhost',
        path: '/',
      },
    ]);
  await page.addInitScript(
    ({ owner, company, seedProject }) => {
      localStorage.clear();
      localStorage.setItem('obratrack_active_user_v7', JSON.stringify(owner));
      localStorage.setItem(
        `obratrack_active_plan_v7_${company}`,
        JSON.stringify('pro_ia'),
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
              id: 'act-existing',
              proyecto_id: 'p-existing',
              nombre: 'Radier',
              fecha_inicio: '2026-10-27',
              fecha_termino: '2026-11-10',
              porcentaje_avance: 0,
              estado: 'pendiente',
              orden: 1,
            },
          ]),
        );
      if (seedProject)
        localStorage.setItem(
          `obratrack_proyectos_v7_${company}`,
          JSON.stringify([
            {
              id: 'p-existing',
              empresa_id: company,
              nombre: 'Terraza',
              fecha_inicio: '2026-10-27',
              fecha_termino_estimada: '2026-11-20',
              estado: 'activo',
              monto_cotizado: 3000000,
            },
          ]),
        );
      const payload = {
        sub: owner.id,
        role: 'authenticated',
        aud: 'authenticated',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      const token = `${btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${btoa(JSON.stringify(payload))}.fixture`;
      localStorage.setItem(
        'sb-gaoxbkvhtdsgqxjihlrv-auth-token',
        JSON.stringify({
          access_token: token,
          refresh_token: 'fixture-refresh',
          expires_at: payload.exp,
          expires_in: 3600,
          token_type: 'bearer',
          user: {
            id: owner.id,
            email: owner.email,
            aud: 'authenticated',
            role: 'authenticated',
            app_metadata: {},
            user_metadata: {},
            created_at: '2026-01-01T00:00:00Z',
          },
        }),
      );
    },
    { owner, company, seedProject },
  );
  await page.route('**/api/cotizador/chat', async (route) => {
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    await route.fulfill({
      status: reply.error ? 503 : 200,
      contentType: 'application/json',
      body: JSON.stringify(reply),
    });
  });
  await page.route('**/api/supabase/sync*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Sincronización automática no utilizada por este test',
      }),
    }),
  );
  await page.route('**/*.supabase.co/rest/v1/**', async (route) => {
    const url = new URL(route.request().url()),
      table = url.pathname.split('/').pop()!,
      method = route.request().method();
    db[table] ||= [];
    if (table === 'pagos' && method === 'POST' && failPayment && !failed) {
      failed = true;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'NETWORK', message: 'Falló el guardado' }),
      });
      return;
    }
    let data: any[] = db[table];
    if (method === 'POST') {
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
    } else if (method === 'DELETE') {
      const filters = Array.from(url.searchParams).filter(([, v]) =>
        v.startsWith('eq.'),
      );
      const removed = db[table].filter((row) =>
        filters.every(([k, v]) => row[k] === v.slice(3)),
      );
      db[table] = db[table].filter((row) => !removed.includes(row));
      data = removed;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data),
    });
  });
  return db;
}
async function send(page: Page, text: string) {
  await page
    .getByRole('textbox', { name: 'Mensaje para el asistente', exact: true })
    .fill(text);
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
}

test('cotización generada se muestra en PDF con los mismos costos, IVA y cliente', async ({
  page,
}) => {
  const quote = normalizeQuote({
    titulo_proyecto: 'Terraza de prueba',
    cliente_nombre: 'Cliente de prueba',
    cliente_telefono: '+56912345678',
    comuna_region: 'Maipú',
    condiciones_pago: 'Anticipo acordado con el cliente',
    materiales: [
      { nombre: 'Cemento', cantidad: 10, precio_unitario_estimado: 5000 },
    ],
    mano_de_obra: [
      {
        rol: 'Maestro',
        cantidad_personas: 1,
        dias_estimados: 2,
        valor_jornal_diario: 40000,
      },
    ],
  });
  await setup(page, {
    respuesta: 'Preparé la estimación para la terraza.',
    accion: null,
    cotizacion: quote,
    sugerencias: [],
  });
  await page.goto('/cotizador');
  await send(page, 'Cotiza una terraza en Maipú');
  await page.getByRole('button', { name: 'Ver cotización / PDF' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cotización generada' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Cliente de prueba');
  await expect(dialog).toContainText('Cemento');
  await expect(dialog).toContainText(
    quote.estructura_financiera.precio_total_con_iva.toLocaleString('es-CL'),
  );
  await expect(dialog).not.toContainText('Carlos Henríquez');
  await expect(dialog).not.toContainText('720.818');
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('navigation')).toBeHidden();
  await page.pdf({
    path: '/tmp/obratrack-chat-cotizacion.pdf',
    format: 'A4',
    printBackground: true,
  });
  await page.emulateMedia({ media: 'screen' });
});

test('obra con varias partidas y materiales se guarda sin perder elementos', async ({
  page,
}) => {
  const db = await setup(page, {
    respuesta: 'Preparé la obra con su planificación.',
    cotizacion: null,
    sugerencias: [],
    accion: {
      tipo: 'crear_proyecto',
      nombre: 'Terraza nueva',
      comuna: 'Maipú',
      monto: 3000000,
      dias: 10,
      partidas: [
        { nombre: 'Fundaciones', dias: 2 },
        { nombre: 'Estructura', dias: 4 },
      ],
      materiales: [
        { nombre: 'Cemento', cantidad: 10, precio_unitario: 5000 },
        { nombre: 'Madera', cantidad: 8, precio_unitario: 9000 },
      ],
    },
  });
  await page.goto('/cotizador');
  await send(
    page,
    'Crea la obra Terraza nueva con todas sus partidas y materiales',
  );
  await expect(
    page.getByText('Obra Creada: Terraza nueva', { exact: true }).first(),
  ).toBeVisible();
  expect(db.proyectos).toHaveLength(1);
  expect(db.actividades).toHaveLength(2);
  expect(new Set(db.actividades.map((a) => a.id)).size).toBe(2);
  expect(db.materiales_proyecto).toHaveLength(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('main')).toHaveCSS('padding-left', '0px');
  await expect(page.locator('aside')).not.toBeInViewport();
  expect(await page.getByRole('button', { name: 'Enviar', exact: true }).evaluate(el => { const r = el.getBoundingClientRect(); const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!target && (target === el || el.contains(target)); })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: '/tmp/obratrack-chat-movil.png',
    fullPage: true,
  });
});

test('un error de Gemini se muestra sin una confirmación ficticia ni acciones', async ({
  page,
}) => {
  const db = await setup(page, {
    error: 'El asistente necesita configurar GEMINI_API_KEY en el servidor.',
    code: 'AI_NOT_CONFIGURED',
  });
  await page.goto('/cotizador');
  await send(page, 'Crea una obra');
  await expect(
    page.getByText(
      'El asistente necesita configurar GEMINI_API_KEY en el servidor.',
      { exact: true },
    ),
  ).toBeVisible();
  expect(db.proyectos || []).toHaveLength(0);
});

test('reintentar un pago pendiente no duplica el ingreso', async ({ page }) => {
  const db = await setup(
    page,
    {
      respuesta: 'Preparé el anticipo.',
      cotizacion: null,
      sugerencias: [],
      accion: {
        tipo: 'registrar_pago',
        proyecto_id: 'p-existing',
        monto: 400000,
        metodo: 'transferencia',
        nota: 'Anticipo',
      },
    },
    true,
    true,
  );
  await page.goto('/cotizador');
  await send(page, 'Registra un anticipo de 400 mil en Terraza');
  await expect(
    page.getByText(/su guardado en la nube está pendiente/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar guardado' }).click();
  await expect(
    page.getByText('Guardado en Supabase.', { exact: true }),
  ).toBeVisible();
  expect(db.pagos).toHaveLength(1);
  expect(db.pagos[0].monto).toBe(400000);
});

test('el copiloto flotante comparte la misma ejecución y los mismos errores', async ({
  page,
}) => {
  await setup(page, {
    error: 'La IA alcanzó su cuota o límite de uso.',
    code: 'AI_RATE_LIMIT',
  });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /Copiloto IA/ }).click();
  await page
    .getByRole('textbox', { name: 'Mensaje para el copiloto global' })
    .fill('Cotiza un radier');
  await page
    .getByRole('button', { name: 'Enviar mensaje', exact: true })
    .click();
  await expect(
    page.getByText('La IA alcanzó su cuota o límite de uso.', { exact: true }),
  ).toBeVisible();
});

test('el asistente de una obra ejecuta y guarda su avance', async ({
  page,
}) => {
  const db = await setup(page, {}, true);
  await page.route('**/api/proyectos/p-existing/chat', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        respuesta: 'Preparé el avance.',
        cotizacion: null,
        sugerencias: [],
        accion: {
          tipo: 'actualizar_avance',
          proyecto_id: 'p-existing',
          nombre: 'Radier',
          porcentaje_avance: 60,
        },
      }),
    }),
  );
  await page.goto('/proyectos/p-existing/ia');
  await page
    .getByRole('textbox', { name: 'Mensaje para el asistente de la obra' })
    .fill('Actualiza Radier al 60 %');
  await page
    .getByRole('button', { name: 'Enviar mensaje', exact: true })
    .click();
  await expect(
    page.getByText('Avance Actualizado', { exact: true }).first(),
  ).toBeVisible();
  expect(
    db.actividades.find((a) => a.id === 'act-existing').porcentaje_avance,
  ).toBe(60);
});
