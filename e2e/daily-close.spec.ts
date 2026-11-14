import { test, expect } from "@playwright/test";
import { readFile, copyFile } from "node:fs/promises";
import { setup, company, ownerId } from "./helpers/platform";

test("cierre de jornada tiene vista previa móvil, confirmación y PDF desde su documento", async ({
  page,
}) => {
  const db = await setup(page, {}, true);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());
  db.asistencia_obreros = [
    {
      id: "attendance",
      proyecto_id: "p-existing",
      empresa_id: company,
      usuario_id: ownerId,
      trabajador_nombre: "Jefe de obra",
      fecha: date,
      estado: "presente",
      horas_trabajadas: 8,
    },
  ];
  const summary = {
    version: 1,
    fecha: date,
    proyecto_nombre: "Terraza",
    confirmado_por: "Contratista de prueba",
    confirmado_en: new Date().toISOString(),
    presentes: 1,
    horas: 8,
    personas: [{ nombre: "Jefe de obra", estado: "presente", horas: 8 }],
    avances: [
      {
        titulo: "Avance de radier",
        nota: "Se completó la preparación del terreno.",
      },
    ],
    recepciones: [{ material: "Cemento", cantidad: 4, unidad: "sacos" }],
    ingresos: 120000,
    gastos: 30000,
    mano_obra: 0,
    pendientes: ["Revisar cubierta"],
    tareas_manana: ["Hormigonado de radier"],
    nota: "Cuidar el acceso a la obra.",
  };
  let savedId = "";
  await page.route("**/api/proyectos/p-existing/cierre", async (route) => {
    const body = route.request().postDataJSON();
    savedId = body.id;
    const document = {
      id: savedId,
      empresa_id: company,
      proyecto_id: "p-existing",
      categoria: "cierre_diario",
      nombre: "Cierre de jornada " + date,
      fecha_documento: date,
      cierre_resumen: { ...summary, nota: body.nota },
      subido_por_nombre: "Contratista de prueba",
    };
    db.documentos_obra = [document];
    await route.fulfill({ json: { documento: document } });
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/proyectos/p-existing/gantt");
  await page
    .getByRole("button", { name: "Revisar jornada", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Cierre de jornada",
    exact: true,
  });
  await expect(dialog.getByText("Vista previa", { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Descargar PDF", exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByLabel("Observación de jefatura (opcional)")
    .fill(summary.nota);
  await dialog
    .getByRole("button", { name: "Confirmar cierre", exact: true })
    .click();
  await expect(
    dialog.getByText("Confirmado · revisión 1", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Avance de radier", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/obratrack-close-mobile.png" });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  const download = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Descargar PDF", exact: true })
    .click();
  const pdf = await download;
  expect(pdf.suggestedFilename()).toContain("ObraTrack_cierre_Terraza_");
  expect((await readFile((await pdf.path())!)).subarray(0, 5).toString()).toBe(
    "%PDF-",
  );
  await copyFile((await pdf.path())!, "/tmp/obratrack-cierre-jornada.pdf");
  await page.goto(`/proyectos/p-existing/documentos?documento=${savedId}`);
  await expect(
    page.getByRole("button", { name: "Descargar cierre PDF", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(summary.nota, { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 780 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});
