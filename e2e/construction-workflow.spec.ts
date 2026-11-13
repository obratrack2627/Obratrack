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

test("recepción conforme registra acta y mantiene cuentas pendientes", async ({
  page,
}) => {
  const db = await setup(page, {}, true);
  db.proyectos[0] = {
    ...db.proyectos[0],
    estado: "terminado",
    finalizada_automaticamente: true,
  };
  db.actividades = [task(100)];
  await page.route("**/api/proyectos/p-existing/gestion", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.operacion).toBe("recepcion");
    expect(body.datos.recibido_por).toBe("Juan Pérez");
    const doc = {
      id: body.id,
      proyecto_id: "p-existing",
      categoria: "acta_recepcion",
      nombre: "Recepción · Terraza",
      fecha_documento: body.datos.fecha,
      recepcion_resumen: {
        ...body.datos,
        registrado_por: "Jefe",
        registrado_en: new Date().toISOString(),
      },
    };
    db.documentos_obra = [doc];
    db.proyectos[0].recepcion_estado = "conforme";
    await route.fulfill({ json: { registro: doc } });
  });
  await page.goto("/proyectos/p-existing/gantt");
  await page
    .getByRole("button", { name: "Registrar recepción", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Resultado", exact: true })
    .selectOption("conforme");
  await page
    .getByLabel("Nombre del mandante o representante")
    .fill("Juan Pérez");
  await page
    .getByRole("button", { name: "Confirmar recepción registrada" })
    .click();
  await expect(
    page.getByText("Recibida conforme", { exact: true }).first(),
  ).toBeVisible();
  await page.getByText("Saldos de la obra", { exact: true }).click();
  await expect(
    page.getByText("Por cobrar al cliente", { exact: true }),
  ).toBeVisible();
  expect(db.proyectos[0].monto_cotizado).toBe(3000000);
  expect(db.pagos || []).toHaveLength(0);
  await page.getByText("Historial de recepciones (1)").click();
  await expect(
    page.getByText("Mandante o representante: Juan Pérez"),
  ).toBeVisible();
});

test("jornal desde asistencia propone medio día y extras y queda por pagar", async ({
  page,
}) => {
  const db = await setup(page, {}, true);
  db.asistencia_obreros = [
    {
      id: "attendance-1",
      proyecto_id: "p-existing",
      empresa_id: company,
      trabajador_nombre: "Pedro Soto",
      fecha: today(),
      estado: "presente",
      horas_trabajadas: 4,
      origen: "web",
      registrado_por: ownerId,
    },
  ];
  await page.route("**/api/proyectos/p-existing/gestion", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.operacion).toBe("jornal");
    expect(body.asistencia_id).toBe("attendance-1");
    expect(body.jornada).toBe(0.5);
    expect(body.valor_diario).toBe(45000);
    const expense = {
      id: body.id,
      proyecto_id: "p-existing",
      asistencia_id: body.asistencia_id,
      descripcion: "Jornal · Pedro Soto",
      monto: 27500,
      monto_adicional: 27500,
      fecha: today(),
      fecha_reporte: today(),
      categoria_gasto: "mano_obra",
      pagado: false,
    };
    db.imprevistos = [expense];
    await route.fulfill({ json: { registro: expense } });
  });
  await page.goto("/proyectos/p-existing/finanzas");
  await page.getByText("Jornales desde asistencia", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Asistencia", exact: true })
    .selectOption("attendance-1");
  await page.getByLabel("Valor del jornal diario").fill("45000");
  await page
    .getByRole("combobox", { name: "Jornada a pagar", exact: true })
    .selectOption("0.5");
  await page.getByLabel("Horas extra autorizadas").fill("1");
  await page.getByLabel("Valor acordado por hora extra").fill("5000");
  await expect(page.getByText("Costo propuesto:")).toContainText("27.500");
  await page
    .getByRole("button", { name: "Registrar jornal por pagar" })
    .click();
  await expect.poll(() => db.imprevistos?.length).toBe(1);
  expect(db.imprevistos[0].pagado).toBe(false);
  await expect(
    page.getByText(
      "No hay asistencias presentes o con atraso sin jornal para esta fecha.",
    ),
  ).toBeVisible();
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

test("un rechazo del servidor conserva recepción sin anunciar guardado", async ({
  page,
}) => {
  const db = await setup(page, {}, true);
  db.proyectos[0].estado = "terminado";
  db.actividades = [task(100)];
  await page.route("**/api/proyectos/p-existing/gestion", (route) =>
    route.fulfill({
      status: 409,
      json: { error: "La obra cambió; revisa las partidas." },
    }),
  );
  await page.goto("/proyectos/p-existing/gantt");
  await page
    .getByRole("button", { name: "Registrar recepción", exact: true })
    .click();
  await page
    .getByLabel("Nombre del mandante o representante")
    .fill("Juan Pérez");
  await page
    .getByLabel("Observaciones", { exact: true })
    .fill("Falta rematar la puerta");
  await page
    .getByRole("button", { name: "Confirmar recepción registrada" })
    .click();
  await expect(
    page.getByText("La obra cambió; revisa las partidas.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Observaciones", exact: true }),
  ).toHaveValue("Falta rematar la puerta");
  expect(db.documentos_obra || []).toHaveLength(0);
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
