import { test, expect, type Page } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import prepararDatabase from "../tests/fixtures/database.cjs";

async function entorno(page: Page) {
  const db = new PGlite();
  await prepararDatabase(db);
  await db.exec(
    readFileSync("supabase/migrations/20261020_flujo_constructor.sql", "utf8"),
  );
  await db.exec(
    "SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)",
  );
  await page.context().addCookies([
    {
      name: "obratrack_auth_token",
      value: "browser-fixture-session",
      domain: "localhost",
      path: "/",
    },
  ]);
  await page.addInitScript(() =>
    localStorage.setItem(
      "obratrack_active_user_v7",
      JSON.stringify({
        id: "u-a",
        empresa_id: "empresa-a",
        nombre: "Contratista",
        empresa_nombre: "Constructora de prueba",
        rol: "admin",
        email: "contratista@example.test",
      }),
    ),
  );
  await page.route("**/*.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.split("/").pop()!;
    try {
      let body: unknown = [];
      if (
        url.pathname.includes("/storage/v1/object/sign/") &&
        route.request().method() === "GET"
      ) {
        await route.fulfill({
          status: 200,
          contentType: "image/png",
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/VsAAAAASUVORK5CYII=",
            "base64",
          ),
        });
        return;
      } else if (url.pathname.includes("/storage/v1/object/sign/"))
        body = {
          signedURL:
            "/object/sign/documentos-obras/empresa-a/test.png?token=test",
        };
      else if (url.pathname.includes("/storage/v1/object/"))
        body = { Key: "documentos-obras/empresa-a/test.png" };
      else if (url.pathname.includes("/rpc/")) {
        const args = route.request().postDataJSON();
        if (endpoint === "convertir_cotizacion")
          body = (
            await db.query<{ id: string }>(
              "SELECT public.convertir_cotizacion($1,$2) id",
              [args.cotizacion_id, args.version],
            )
          ).rows[0].id;
        else if (["guardar_cotizacion", "guardar_gestion"].includes(endpoint))
          body = [
            (
              await db.query<{ row: unknown }>(
                `SELECT to_jsonb(public.${endpoint}($1::jsonb,$2)) AS row`,
                [JSON.stringify(args.d), args.version],
              )
            ).rows[0].row,
          ];
        else throw new Error("RPC no prevista");
      } else if (endpoint === "proyectos") {
        body = await Promise.all(
          (
            await db.query<Record<string, unknown>>("SELECT * FROM proyectos")
          ).rows.map(async (p) => ({
            ...p,
            cliente: {
              id: "c-a",
              nombre: "Cliente de prueba",
              telefono: "+56912345678",
            },
            actividades: (
              await db.query("SELECT * FROM actividades WHERE proyecto_id=$1", [
                p.id,
              ])
            ).rows,
            pagos: [],
            materiales: [],
            imprevistos: [],
            bitacora: [],
          })),
        );
      } else if (endpoint === "clientes")
        body = [
          {
            id: "c-a",
            empresa_id: "empresa-a",
            nombre: "Cliente de prueba",
            direccion: "Santiago",
            telefono: "+56912345678",
            email: "cliente@example.test",
          },
        ];
      else if (endpoint === "usuarios") {
        if (route.request().method() === "POST") {
          const u = route.request().postDataJSON();
          body = (
            await db.query(
              `INSERT INTO usuarios(id,auth_user_id,empresa_id,rut,nombre,email,rol,telefono_whatsapp,is_dev)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre RETURNING *`,
              [
                u.id,
                u.auth_user_id,
                u.empresa_id,
                u.rut,
                u.nombre,
                u.email,
                u.rol,
                u.telefono_whatsapp,
                u.is_dev,
              ],
            )
          ).rows;
        } else
          body = (await db.query("SELECT * FROM usuarios ORDER BY nombre"))
            .rows;
      } else if (["cotizaciones_obra", "gestion_obras"].includes(endpoint))
        body = (await db.query(`SELECT * FROM ${endpoint}`)).rows;
      else throw new Error(`Ruta no prevista: ${endpoint}`);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    } catch (e) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ message: (e as Error).message, code: "P0001" }),
      });
    }
  });
  return db;
}

test("cotización → obra → gastos y jornadas → cobro → cierre; vista móvil y PDF", async ({
  page,
}) => {
  const db = await entorno(page);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/cotizaciones");
    await page.getByRole("button", { name: "Nueva", exact: true }).click();
    await page.getByLabel("Nombre del trabajo").fill("Terraza de prueba");
    await page.getByLabel("Cliente", { exact: true }).selectOption("c-a");
    await page.getByLabel("Partida", { exact: true }).fill("Terraza");
    await page
      .getByLabel("Descripción", { exact: true })
      .fill("Construcción de radier");
    await page.getByLabel("Costo unitario (CLP)").fill("1000000");
    await page.getByLabel("Estado", { exact: true }).selectOption("Aprobada");
    await page.getByRole("button", { name: "Guardar cotización" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Ver", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("1.190.000");
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".op-print")).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Navegación principal" }),
    ).toBeHidden();
    await page.pdf({
      path: "/tmp/obratrack-cotizacion-prueba.pdf",
      format: "A4",
      printBackground: true,
    });
    await page.emulateMedia({ media: "screen" });
    await page.getByRole("button", { name: "Cerrar", exact: true }).click();
    await page.getByRole("button", { name: "Convertir en obra" }).click();
    await expect(
      page.getByRole("heading", { name: "Terraza de prueba", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Esperando anticipo", { exact: true }).first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Gasto", exact: true }).click();
    await page.getByLabel("Proveedor", { exact: true }).fill("Ferretería");
    await page.getByLabel("Monto (CLP)", { exact: true }).fill("200000");
    await page.getByLabel("Descripción", { exact: true }).fill("Cemento");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.locator(".op-card").filter({ hasText: "Costos reales" }),
    ).toContainText("200.000");
    await page.getByRole("button", { name: "Jornada", exact: true }).click();
    await page.getByLabel("Trabajador", { exact: true }).selectOption("u-a");
    await page.getByLabel("Valor diario (CLP)").fill("40000");
    await page.getByLabel("Actividad realizada").fill("Radier");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.locator(".op-card").filter({ hasText: "Costos reales" }),
    ).toContainText("240.000");
    await page.getByRole("button", { name: "Adicional", exact: true }).click();
    await page
      .getByLabel("Descripción", { exact: true })
      .fill("Escalón adicional");
    await page.getByLabel("Materiales (CLP)").fill("100000");
    await page.getByLabel("Mano de obra (CLP)").fill("50000");
    await page.getByLabel("Estado", { exact: true }).selectOption("Aprobado");
    await page
      .getByLabel("Aprobación del cliente")
      .fill("Cliente de prueba, conforme por escrito");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.locator(".op-card").filter({ hasText: "Valor actualizado" }).first(),
    ).toContainText("1.340.000");
    await page
      .getByRole("button", { name: "Adicionales", exact: true })
      .click();
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await page.getByLabel("Estado", { exact: true }).selectOption("Cobrado");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Fotografías", exact: true })
      .click();
    await page.getByLabel("Sector o partida").fill("Terraza");
    await page
      .getByLabel("Descripción", { exact: true })
      .fill("Radier terminado");
    await page.getByLabel("Subir fotografías").setInputFiles({
      name: "avance.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/VsAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await expect(
      page.getByRole("button", { name: "Guardar", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Bitácora", exact: true }).click();
    await expect(
      page.getByRole("img", { name: "Radier terminado · foto 1" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Resumen", exact: true }).click();
    // El cierre incompleto debe fallar y mantener el formulario abierto.
    await page
      .getByRole("button", { name: "Cerrar obra", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirmar cierre" }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "100 %",
    );
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await page
      .getByRole("button", { name: "Actividades", exact: true })
      .click();
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await page.getByLabel("Estado", { exact: true }).selectOption("Terminada");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Pago", exact: true }).click();
    await page.getByLabel("Monto (CLP)", { exact: true }).fill("1340000");
    await page.getByLabel("Motivo", { exact: true }).fill("Contrato");
    await page.getByLabel("Estado", { exact: true }).selectOption("Pagado");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Resumen", exact: true }).click();
    await page
      .getByRole("button", { name: "Cerrar obra", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirmar cierre" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Finalizada", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Utilidad final", { exact: true }).locator(".."),
    ).toContainText("1.100.000");
    await expect(
      page.getByRole("button", { name: "Gasto", exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("Finalizada", { exact: true })).toBeVisible();
    await page.screenshot({
      path: "/tmp/obratrack-obra-movil.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Resumen", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("alert").filter({ hasText: "Error" }),
    ).toHaveCount(0);
    await page.screenshot({
      path: "/tmp/obratrack-resumen-escritorio.png",
      fullPage: true,
    });
    await page.goto("/clientes/c-a");
    await expect(
      page.getByRole("heading", { name: "Cliente de prueba" }),
    ).toBeVisible();
    await expect(
      page.getByText("Pagos recibidos", { exact: true }).locator(".."),
    ).toContainText("1.340.000");
    await page.goto("/equipo");
    await page.getByRole("button", { name: "Trabajador", exact: true }).click();
    await page.getByLabel("Nombre completo").fill("Ayudante nuevo");
    await expect(page.getByLabel("Contraseña")).toHaveCount(0);
    await page.getByRole("button", { name: "Guardar trabajador" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Ayudante nuevo" }),
    ).toBeVisible();
    const creado = (
      await db.query<{ auth_user_id: string | null }>(
        "SELECT auth_user_id FROM usuarios WHERE nombre='Ayudante nuevo'",
      )
    ).rows[0];
    expect(creado.auth_user_id).toBeNull();
  } finally {
    await db.close();
  }
});

test("error de migración visible y sin guardados aparentes", async ({
  page,
}) => {
  await page.context().addCookies([
    {
      name: "obratrack_auth_token",
      value: "browser-fixture-session",
      domain: "localhost",
      path: "/",
    },
  ]);
  await page.addInitScript(() =>
    localStorage.setItem(
      "obratrack_active_user_v7",
      JSON.stringify({ id: "u", empresa_id: "e" }),
    ),
  );
  await page.route("**/*.supabase.co/**", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ code: "PGRST205", message: "Missing table" }),
    }),
  );
  await page.goto("/cotizaciones");
  await expect(
    page.getByRole("alert").filter({ hasText: "Falta habilitar" }),
  ).toContainText("Falta habilitar");
  await expect(
    page.getByRole("button", { name: "Nueva", exact: true }),
  ).toBeDisabled();
});
