import { expect, test } from '@playwright/test';
import { setup } from './helpers/platform';
import { normalizeQuote } from '../lib/ai/protocol';

test('subir un archivo de presupuesto en una obra extrae materiales y montos al formato ObraTrack', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await setup(page, { respuesta: 'No utilizada', accion: null }, true);

  let savedBudget: any = null;
  await page.route('**/api/presupuestos**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/importar')) {
      const imported = normalizeQuote({
        titulo_proyecto: 'Terraza',
        cliente_nombre: 'Cliente Terraza',
        modo_presupuesto: 'precio_acordado',
        tratamiento_iva: 'incluido',
        partidas_venta: [
          { nombre: 'Cemento Polpaico 25 kg', unidad: 'saco', cantidad: 10, precio_unitario: 5950 },
          { nombre: 'Cerámica antideslizante', unidad: 'm2', cantidad: 12, precio_unitario: 11900 },
        ],
        materiales: [
          { nombre: 'Cemento Polpaico 25 kg', unidad: 'saco', cantidad: 10, precio_unitario_estimado: 5000 },
          { nombre: 'Cerámica antideslizante', unidad: 'm2', cantidad: 12, precio_unitario_estimado: 10000 },
        ],
        mano_de_obra: [],
      });
      return route.fulfill({
        json: {
          cotizacion: imported,
          resumen: {
            archivo: 'presupuesto_externo.csv',
            metodo: 'texto',
            partidas: 2,
            materiales: 2,
            mano_de_obra: 0,
            tratamiento_iva: 'incluido',
          },
        },
      });
    }
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      const quote = normalizeQuote(body.cotizacion);
      savedBudget = {
        id: quote.id,
        cotizacion: quote,
        estado: 'borrador',
        proyecto_id: body.proyecto_id || 'p-existing',
        updated_at: '2026-11-24T16:00:00Z',
      };
      return route.fulfill({ status: 201, json: { presupuesto: savedBudget } });
    }
    return route.fulfill({ json: { presupuestos: savedBudget ? [savedBudget] : [] } });
  });

  await page.goto('/proyectos/p-existing/presupuestos');
  await expect(page.locator('aside').getByText('Contratista', { exact: true })).toBeAttached();
  await expect(page.getByRole('heading', { name: 'Terraza', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Subir presupuesto', exact: true }).click();

  const importModal = page.getByRole('dialog', { name: 'Importar presupuesto desde archivo', exact: true });
  await expect(importModal).toBeVisible();
  await importModal.getByLabel('Archivo de presupuesto', { exact: true }).setInputFiles({
    name: 'presupuesto_externo.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Material;Unidad;Cantidad;Precio Unitario con IVA\nCemento Polpaico 25 kg;saco;10;5950\nCerámica antideslizante;m2;12;11900\n', 'utf8'),
  });
  await importModal.getByRole('button', { name: 'Extraer y traspasar', exact: true }).click();

  const editorDialog = page.getByRole('dialog', { name: 'Nuevo presupuesto', exact: true });
  await expect(editorDialog).toBeVisible();
  await expect(editorDialog).toContainText('presupuesto_externo.csv');
  await expect(editorDialog.getByLabel('Partida de venta 1', { exact: true })).toHaveValue('Cemento Polpaico 25 kg');
  await expect(editorDialog.getByLabel('Material 1', { exact: true })).toHaveValue('Cemento Polpaico 25 kg');
  await expect(editorDialog).toContainText('202.300');

  await editorDialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(editorDialog).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Cotización generada' })).toContainText('202.300');
  expect(savedBudget?.cotizacion.materiales).toHaveLength(2);
  expect(savedBudget?.cotizacion.estructura_financiera.precio_total_con_iva).toBe(202300);
});
