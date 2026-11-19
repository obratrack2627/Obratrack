import { test, expect } from '@playwright/test';
import { setup } from './helpers/platform';

test('gráficos enmascaran montos por defecto, omiten la tabla inferior y revelan al consultar sin desbordar en celular', async ({page}) => {
  const db = await setup(page, {}, true);
  db.pagos = [{id:'paid',proyecto_id:'p-existing',monto:750000,estado:'completado',fecha:'2026-11-13'}];
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/dashboard');

  await expect(page.getByRole('table',{name:'Montos financieros por obra'})).toHaveCount(0);

  const graph = page.getByRole('region',{name:'Gráfico de flujo financiero por obra'});
  await expect(graph.locator('.recharts-label-list').first()).toContainText('$ ***');
  await expect(page.getByText('Total Cobrado (25%):',{exact:true})).toBeVisible();
  await expect(page.getByText('Por Cobrar (75%):',{exact:true})).toBeVisible();

  await page.getByRole('button', { name: 'Mostrar montos de Flujo Financiero' }).click();
  await expect(graph.locator('.recharts-label-list').first()).toContainText('$3 M');
  await graph.locator('.recharts-bar-rectangle').first().hover();
  await expect(graph.locator('.recharts-tooltip-wrapper')).toContainText('$3.000.000');

  await page.getByRole('button', { name: 'Mostrar montos de Distribución de Cartera' }).click();
  await expect(page.getByText('$750.000', { exact: true }).first()).toBeVisible();

  for(const width of [390,320]){
    await page.setViewportSize({width,height:900});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(graph).toBeVisible();
  }
});

test('cartera vacía muestra un estado claro sin porcentajes inválidos',async({page})=>{
  const db=await setup(page,{},true);db.proyectos[0].monto_cotizado=0;
  await page.goto('/dashboard');
  await expect(page.getByText('Sin movimientos',{exact:true})).toBeVisible();
  await expect(page.getByText('Total Cobrado (0%):',{exact:true})).toBeVisible();
  await expect(page.getByText('Por Cobrar (0%):',{exact:true})).toBeVisible();
});

test('reportes permite eliminar un registro con confirmación explícita', async ({ page }) => {
  await setup(page, {}, true);
  let deletedId = '';
  const initialMessages = [
    {
      message_id: 'msg-rep-1',
      texto: 'Avance diario de losa',
      respuesta: 'Registrado en bitácora',
      categoria: 'registro',
      created_at: '2026-11-16T15:00:00Z',
      sent_at: '2026-11-16T15:00:01Z',
      autor: { nombre: 'Supervisor Demo', rol: 'supervisor' },
      obras: [{ id: 'p-existing', nombre: 'Terraza' }],
      acciones: { titulo: 'Avance de losa', resultado_texto: 'Guardado' },
    },
  ];
  await page.route('**/api/whatsapp/mensajes*', async (route) => {
    if (route.request().method() === 'DELETE') {
      deletedId = new URL(route.request().url()).searchParams.get('id') || '';
      await route.fulfill({ json: { deleted: true, message_id: deletedId } });
      return;
    }
    await route.fulfill({
      json: {
        gestion: true,
        total: deletedId ? 0 : 1,
        autores: [{ id: 'sup', nombre: 'Supervisor Demo' }],
        obras: [{ id: 'p-existing', nombre: 'Terraza' }],
        mensajes: deletedId ? [] : initialMessages,
      },
    });
  });

  await page.goto('/reportes');
  await expect(page.getByRole('heading', { name: 'Avance de losa' })).toBeVisible();
  await page.getByRole('button', { name: 'Eliminar reporte Avance de losa' }).click();

  const dialog = page.getByRole('dialog', { name: 'Confirmar eliminación de reporte' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Eliminar' }).click();

  await expect.poll(() => deletedId).toBe('msg-rep-1');
  await expect(page.getByRole('heading', { name: 'Avance de losa' })).toHaveCount(0);
});

test('avisos enviados permite eliminar un registro con confirmación explícita', async ({ page }) => {
  await setup(page, {}, true);
  let deletedAvisoId = '';
  const initialAvisos = [
    {
      id: '11111111-1111-4111-a111-111111111111',
      destinatarios: 2,
      mensaje: 'Mañana hormigonamos a las 08:00',
      origen: 'plataforma',
      created_at: '2026-11-16T15:00:00Z',
      estados: { entregado: 2 },
    },
  ];
  await page.route('**/api/whatsapp/mensajes*', (r) => r.fulfill({ json: { gestion: true, total: 0, autores: [], obras: [], mensajes: [] } }));
  await page.route('**/api/whatsapp/avisos*', async (route) => {
    if (route.request().method() === 'DELETE') {
      deletedAvisoId = new URL(route.request().url()).searchParams.get('id') || '';
      await route.fulfill({ json: { deleted: true, id: deletedAvisoId } });
      return;
    }
    await route.fulfill({
      json: {
        total: deletedAvisoId ? 0 : 1,
        pagina: 0,
        avisos: deletedAvisoId ? [] : initialAvisos,
      },
    });
  });

  await page.goto('/reportes');
  await page.getByRole('tab', { name: 'Avisos enviados', exact: true }).click();
  await expect(page.getByText('Mañana hormigonamos a las 08:00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Eliminar aviso/ }).click();

  const dialog = page.getByRole('dialog', { name: 'Confirmar eliminación de aviso' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Eliminar', exact: true }).click();

  await expect.poll(() => deletedAvisoId).toBe('11111111-1111-4111-a111-111111111111');
  await expect(page.getByText('Mañana hormigonamos a las 08:00', { exact: true })).toHaveCount(0);
});
