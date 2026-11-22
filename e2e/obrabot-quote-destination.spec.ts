import { expect, test } from '@playwright/test';
import { setup } from './helpers/platform';

test('el administrador revisa y confirma el vínculo de una cotización en el celular', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await setup(page, { respuesta: 'Consulta', accion: null }, true);
  const id = '12345678-aaaa-bbbb-cccc-123456789abc';
  await page.route('**/api/obrabot/cotizaciones', route => route.fulfill({
    json: { solicitudes: [], permiteVincular: true, aprobadas: [{ id, borrador: { titulo_proyecto: 'Piso de terraza', estructura_financiera: { precio_total_con_iva: 119000 } } }] },
  }));
  let confirmations = 0;
  await page.route(`**/api/obrabot/cotizaciones/${id}/destino*`, async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      confirmations++;
      expect(request.postDataJSON()).toEqual({ modo: 'adicional', proyecto: 'p-existing', version: '4', cabecera: 'principal' });
      return route.fulfill({ json: { modo: 'adicional', obra: 'Terraza', proyecto_id: 'p-existing', equipo: [], equipo_pendiente: [] } });
    }
    if (new URL(request.url()).searchParams.has('proyecto')) {
      return route.fulfill({ json: {
        proyecto_id: 'p-existing', obra: 'Terraza', version: '4', cabecera: 'principal', monto_anterior: 200000,
        monto_cotizacion: 119000, tiene_presupuesto: true, monto_reemplazo: 139000, monto_adicional: 319000,
      } });
    }
    return route.fulfill({ json: { opciones: [{ id: 'p-existing', nombre: 'Terraza', direccion: 'Maipú' }] } });
  });
  await page.goto('/cotizador');
  const quote = page.locator('#cotizaciones-obrabot');
  await quote.locator('summary').click();
  await quote.getByRole('button', { name: 'Vincular a obra' }).click();
  await quote.getByLabel('Obra existente').selectOption('p-existing');
  await quote.getByRole('button', { name: 'Revisar vínculo' }).click();
  await expect(quote.getByRole('button', { name: 'Confirmar vínculo' })).toBeDisabled();
  await expect(quote.getByText('Presupuesto actual · $200.000.')).toBeVisible();
  await quote.getByLabel('Cómo aplicar la cotización').selectOption('adicional');
  expect(confirmations).toBe(0);
  await quote.getByRole('button', { name: 'Confirmar vínculo' }).click();
  await expect(quote.getByText('Cotización vinculada · Terraza')).toBeVisible();
  await expect(quote.getByRole('link', { name: 'Ver obra' })).toHaveAttribute('href', '/proyectos/p-existing/presupuestos');
  expect(confirmations).toBe(1);
});
