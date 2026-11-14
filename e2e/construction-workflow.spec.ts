import { test, expect } from "@playwright/test";
import { setup, company, ownerId } from "./helpers/platform";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const task = (progress: number) => ({
  id: "act-existing",
  proyecto_id: "p-existing",
  nombre: "Radier",
  fecha_inicio: "2026-11-02",
  fecha_termino: "2026-11-13",
  porcentaje_avance: progress,
  estado: progress === 100 ? "terminada" : "en_curso",
  orden: 1,
});
async function noOverflow(page: any) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
}

test("Gantt móvil: terminar y corregir avance actualiza el estado sin tocar el contrato", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const db = await setup(page, {}, true);
  db.actividades = [task(80)];
  await page.goto("/proyectos/p-existing/gantt");
  await page
    .getByRole("button", { name: "Editar Radier", exact: true })
    .click();
  await page
    .getByRole("spinbutton", { name: "Avance de la partida (%)" })
    .fill("100");
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect.poll(() => db.proyectos[0].estado).toBe("terminado");
  await page
    .getByRole("button", { name: "Editar Radier", exact: true })
    .click();
  await page
    .getByRole("spinbutton", { name: "Avance de la partida (%)" })
    .fill("80");
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect.poll(() => db.proyectos[0].estado).toBe("activo");
  expect(db.proyectos[0].monto_cotizado).toBe(3000000);
  await noOverflow(page);
});

test("obra terminada no muestra entrega y recepción", async ({ page }) => {
  const db = await setup(page, {}, true);
  db.proyectos[0].estado = "terminado";
  db.actividades = [task(100)];
  await page.goto("/proyectos/p-existing/gantt");
  await expect(page.getByText("Cargando Carta Gantt...", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Bitácora", exact: true })).toBeVisible();
  await expect(page.getByText("Entrega y recepción", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Registrar recepción", exact: true })).toHaveCount(0);
  await expect(page.getByText("Saldos de la obra", { exact: true })).toHaveCount(0);
});

test("jornales desde asistencia no aparece en Cuadrilla ni en Finanzas", async ({ page }) => {
  await setup(page, {}, true);
  await page.goto("/proyectos/p-existing/asistencia");
  await expect(page.getByRole("heading", { name: "Cuadrilla de la obra", exact: true })).toBeVisible();
  await expect(page.getByText("Jornales desde asistencia", { exact: true })).toHaveCount(0);
  await page.goto("/proyectos/p-existing/finanzas");
  await expect(page.getByRole("link", { name: /Finanzas y materiales/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Jornales desde asistencia", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Registrar jornal por pagar", exact: true })).toHaveCount(0);
});

test("material fraccionado tiene entregas parciales y no se paga al recibirlo, sin desborde a 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const db = await setup(page, {}, true);
  db.materiales_proyecto = [
    {
      id: "mat-1",
      proyecto_id: "p-existing",
      nombre: "Hormigón",
      cantidad: 2.5,
      unidad: "m³",
      precio_unitario: 95000,
      subtotal: 237500,
      comprado: false,
      pagado: null,
    },
  ];
  await page.goto("/proyectos/p-existing/finanzas");
  await page.getByRole("button", { name: /^Materiales/ }).click();
  await page
    .getByRole("button", { name: "Registrar recepción", exact: true })
    .click();
  await page.getByRole("spinbutton", { name: "Cantidad recibida" }).fill("1.5");
  await page
    .getByRole("button", { name: "Confirmar recepción", exact: true })
    .click();
  await expect(
    page.getByText("Entrega parcial", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Recibido: 1.5 / 2.5 m³")).toBeVisible();
  expect(db.materiales_proyecto[0].pagado).toBe(null);
  expect(db.materiales_proyecto[0].comprado).toBe(false);
  await noOverflow(page);
  await page.screenshot({
    path: "/tmp/obratrack-materiales-320.png",
    fullPage: true,
  });
});

test("materiales se muestran en lista, aíslan compra/pago entre filas y permiten edición minimalista", async ({
  page,
}) => {
  const db = await setup(page, {}, true);
  db.materiales_proyecto = [
    {
      id: "mat-a",
      proyecto_id: "p-existing",
      nombre: "Cemento Polpaico",
      categoria: "obra_gruesa",
      cantidad: 10,
      unidad: "saco",
      precio_unitario: 5000,
      subtotal: 50000,
      proveedor: "Por confirmar",
      comprado: false,
      pagado: null,
    },
    {
      id: "mat-b",
      proyecto_id: "p-existing",
      nombre: "Fierro A630",
      categoria: "estructura",
      cantidad: 5,
      unidad: "barra",
      precio_unitario: 8000,
      subtotal: 40000,
      proveedor: "Imperial",
      comprado: false,
      pagado: null,
    },
  ];
  await page.goto("/proyectos/p-existing/finanzas");
  await page.getByRole("button", { name: /^Materiales/ }).click();

  const rows = page.locator("ul > li");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Cemento Polpaico");
  await expect(rows.nth(1)).toContainText("Fierro A630");

  await rows.nth(0).getByLabel("Pago confirmado").check();
  await expect(rows.nth(0).getByLabel("Compra registrada")).toBeChecked();
  await expect(rows.nth(1).getByLabel("Compra registrada")).not.toBeChecked();
  await expect(rows.nth(1).getByLabel("Pago confirmado")).not.toBeChecked();
  await expect(rows.nth(0)).toContainText("Cemento Polpaico");
  await expect(rows.nth(1)).toContainText("Fierro A630");
  expect(db.materiales_proyecto.find((m) => m.id === "mat-a")?.comprado).toBe(true);
  expect(db.materiales_proyecto.find((m) => m.id === "mat-a")?.pagado).toBe(true);
  expect(db.materiales_proyecto.find((m) => m.id === "mat-b")?.comprado).toBe(false);
  expect(db.materiales_proyecto.find((m) => m.id === "mat-b")?.pagado).toBe(null);

  await page.getByRole("button", { name: "Editar Cemento Polpaico", exact: true }).click();
  await page.getByLabel("Proveedor").fill("Sodimac Homecenter");
  await page.getByLabel("Precio c/u *").fill("6000");
  await page.getByRole("button", { name: "Guardar Cambios", exact: true }).click();

  await expect(rows.nth(0)).toContainText("Sodimac Homecenter");
  await expect(rows.nth(0)).toContainText("$60.000");
  expect(db.materiales_proyecto.find((m) => m.id === "mat-a")?.unidad).toBe("saco");
});

test("reprogramación muestra propuesta y pide motivo, conserva entrega si no se autoriza", async ({
  page,
}) => {
  const db = await setup(page, {}, true);
  db.actividades = [{ ...task(50), fecha_termino: "2026-11-12" }];
  await page.route("**/api/proyectos/p-existing/gestion", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.operacion).toBe("reprogramar");
    expect(body.ajustar_entrega).toBe(false);
    expect(body.motivo).toBe("Atraso por lluvia");
    expect(body.tareas[0].fecha_inicio).toBe("2026-11-02");
    db.actividades[0] = {
      ...db.actividades[0],
      fecha_termino: body.tareas[0].fecha_termino,
    };
    await route.fulfill({ json: { registro: db.proyectos[0] } });
  });
  await page.goto("/proyectos/p-existing/gantt");
  await page
    .getByRole("button", { name: "Revisar reprogramación sugerida" })
    .click();
  await page.getByLabel("Motivo", { exact: true }).fill("Atraso por lluvia");
  const request = page.waitForRequest("**/api/proyectos/p-existing/gestion");
  await page.getByRole("button", { name: "Confirmar reprogramación" }).click();
  await request;
  await expect(
    page.getByRole("button", { name: "Cerrar propuesta" }),
  ).toHaveCount(0);
  expect(db.proyectos[0].fecha_termino_estimada).toBe("2026-11-20");
  await page.screenshot({
    path: "/tmp/obratrack-gantt-desktop.png",
    fullPage: true,
  });
});

test("Documentos oculta actas de recepción anteriores y conserva los demás archivos", async ({ page }) => {
  const db = await setup(page, {}, true);
  db.documentos_obra = [
    { id: "legacy-reception", proyecto_id: "p-existing", empresa_id: company, categoria: "acta_recepcion", nombre: "Acta histórica del mandante", fecha_documento: "2026-11-13" },
    { id: "contract", proyecto_id: "p-existing", empresa_id: company, categoria: "contrato", nombre: "Contrato vigente", fecha_documento: "2026-11-13" },
  ];
  await page.goto("/proyectos/p-existing/documentos");
  await expect(page.getByText("Contrato vigente", { exact: true })).toBeVisible();
  await expect(page.getByText("Acta histórica del mandante", { exact: true })).toHaveCount(0);
  expect(db.documentos_obra).toHaveLength(2);
});

test("registro de persona natural permite omitir RUT y nombre comercial", async ({
  page,
}) => {
  let signup: any;
  await page.route("**/auth/v1/signup*", async (route) => {
    signup = route.request().postDataJSON();
    await route.fulfill({
      json: {
        user: {
          id: ownerId,
          email: "constructor@example.test",
          identities: [{ id: "test" }],
        },
        session: null,
      },
    });
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await page.locator("#signup-nombre").fill("Constructor Independiente");
  await expect(page.locator("#signup-rut")).not.toHaveAttribute("required", "");
  await page.locator("#signup-email").fill("constructor@example.test");
  await page.locator("#signup-telefono").fill("+56987654321");
  await page.locator("#signup-password").fill("PruebaSegura2026!");
  await page.locator("#signup-confirm-password").fill("PruebaSegura2026!");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: /Crear cuenta|Registrarme/ })
    .last()
    .click();
  await expect
    .poll(() => signup?.data?.empresa_nombre)
    .toBe("Constructor Independiente");
  expect(signup.data.rut || "").toBe("");
});

test("asistencia muestra acceso rápido a planilla por obra en lista sin desborde a 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await setup(page, {}, true);
  await page.goto("/asistencia");
  await expect(
    page.getByRole("heading", { name: "Acceso Rápido a Planilla por Obra" }),
  ).toBeVisible();
  const rows = page.locator("ul > li");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("presentes hoy");
  await expect(
    rows.first().getByRole("button", { name: /Pasar lista 1 clic/ }),
  ).toBeVisible();
  await expect(
    rows.first().getByRole("link", { name: "Abrir planilla" }),
  ).toHaveAttribute("href", "/proyectos/p-existing/asistencia");
  await noOverflow(page);
});
