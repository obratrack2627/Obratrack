import { test, expect } from "@playwright/test";
import { setup, company } from "./helpers/platform";

test("Cuadrilla adapta el diseño, ordena la pestaña y confirma las acciones rápidas", async ({
  page,
}) => {
  const db = await setup(page, {}, true);
  db.usuarios.push({
    id: "worker-design",
    empresa_id: company,
    nombre: "Felipe Poblete",
    rol: "terreno",
    especialidades: [],
  });
  db.proyectos[0].trabajadores_ids = ["worker-design"];
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/proyectos/p-existing/asistencia");
  const card = page.locator('[data-crew-member="worker-design"]');
  await expect(card).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Trabajadores asignados (1)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Resumen del día" }),
  ).toBeVisible();
  const finance = page.getByRole("link", { name: /Finanzas y materiales/ });
  const crew = page.getByRole("link", { name: "Cuadrilla", exact: true });
  expect(
    await finance.evaluate((el) => el.nextElementSibling?.textContent),
  ).toContain("Cuadrilla");
  await expect(crew).toBeVisible();
  await page.screenshot({
    path: "/tmp/obratrack-crew-redesign-desktop.png",
    fullPage: true,
  });
  await card
    .getByRole("button", { name: "Ausente: Felipe Poblete", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "Registrar asistencia",
    exact: true,
  });
  await expect(editor.getByLabel("Estado", { exact: true })).toHaveValue(
    "ausente",
  );
  expect(db.asistencia_obreros || []).toHaveLength(0);
  await editor
    .getByRole("button", { name: "Guardar asistencia", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await expect.poll(() => db.asistencia_obreros?.[0]?.estado).toBe("ausente");
  await page
    .getByLabel("Filtrar asistencia", { exact: true })
    .selectOption("none");
  await expect(card).toHaveCount(0);
  await page
    .getByLabel("Filtrar asistencia", { exact: true })
    .selectOption("all");
  await expect(card).toBeVisible();
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => {
      const tab = await crew.boundingBox();
      return !!tab && tab.x >= 0 && tab.x + tab.width <= width;
    }).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    const box = await card.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await expect(
      card.getByRole("button", { name: "Editar asistencia", exact: true }),
    ).toBeVisible();
    if (width === 390)
      await page.screenshot({
        path: "/tmp/obratrack-crew-redesign-mobile.png",
        fullPage: true,
      });
  }
  await page
    .getByRole("button", { name: "Ver historial", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Historial", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});
