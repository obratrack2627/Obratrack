import { expect, type Page } from "@playwright/test";
export const ownerId = "00000000-0000-0000-0000-000000000001";
export const company = "fixture-company";
export function fixtureToken(role = "admin", dev = false) {
  return (
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ) +
    "." +
    Buffer.from(
      JSON.stringify({
        sub: ownerId,
        role: "authenticated",
        web_role: role,
        dev,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url") +
    ".fixture-signature"
  );
}
export const owner = {
  id: ownerId,
  auth_user_id: ownerId,
  empresa_id: company,
  nombre: "Contratista de prueba",
  email: "owner@example.test",
  rol: "admin",
  telefono_whatsapp: "",
};

export async function setup(
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
      value: fixtureToken("admin", developer),
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
      const encode = (value: object) =>
        btoa(JSON.stringify(value))
          .replaceAll("+", "-")
          .replaceAll("/", "_")
          .replaceAll("=", "");
      const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.fixture-signature`;
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
  await page.route("**/api/supabase/sync*", async (route) => {
    if (route.request().method() === "POST") {
      const input = route.request().postDataJSON();
      const names: Record<string, string> = {
        materiales: "materiales_proyecto",
        bitacora: "bitacora_entradas",
        asistencias: "asistencia_obreros",
        reclamos_cambios: "reclamos_cambios_obra",
        documentos: "documentos_obra",
      };
      for (const [key, rows] of Object.entries(input.cambios || {})) {
        const table = names[key] || key;
        db[table] ||= [];
        for (const row of rows as any[]) {
          const index = db[table].findIndex((old) => old.id === row.id);
          if (index < 0) db[table].push(row);
          else db[table][index] = { ...db[table][index], ...row };
        }
      }
      for (const [key, ids] of Object.entries(input.eliminados || {})) {
        const table = names[key] || key;
        db[table] = (db[table] || []).filter(
          (row) => !(ids as string[]).includes(row.id),
        );
      }
      for (const project of db.proyectos) {
        const tasks = db.actividades.filter(
          (row) => row.proyecto_id === project.id,
        );
        if (
          project.estado !== "cancelada" &&
          tasks.length &&
          tasks.every((row) => row.porcentaje_avance >= 100) &&
          project.estado !== "terminado"
        ) {
          project.estado_anterior_cierre = project.estado;
          project.estado = "terminado";
          project.finalizada_automaticamente = true;
        } else if (
          project.finalizada_automaticamente &&
          (!tasks.length || !tasks.every((row) => row.porcentaje_avance >= 100))
        ) {
          project.estado = "activo";
          project.recepcion_estado = "pendiente";
          project.finalizada_automaticamente = false;
        }
      }
      return route.fulfill({ json: { success: true } });
    }
    return route.fulfill({
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
    });
  });
  await page.route("**/rest/v1/**", async (route) => {
    const url = new URL(route.request().url()),
      table = url.pathname.split("/").pop()!,
      method = route.request().method();
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    };
    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    db[table] ||= [];
    if (table === "pagos" && method === "POST" && failPayment && !failed) {
      failed = true;
      await route.fulfill({
        status: 500,
        headers: cors,
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
      headers: cors,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  return db;
}
export async function send(page: Page, text: string) {
  // Esperar los datos cargados por React: escribir antes de hidratar puede perder el texto.
  await expect(
    page.locator("aside").getByText("Contratista", { exact: true }),
  ).toBeAttached();
  await page
    .getByRole("textbox", { name: "Mensaje para el asistente", exact: true })
    .fill(text);
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
}
