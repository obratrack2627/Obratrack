import { test, expect } from '@playwright/test';
import { setup } from './helpers/platform';

test('gráficos muestran montos permanentes, detalles y porcentajes sin desbordar en celular', async ({page}) => {
  const db = await setup(page, {}, true);
  db.pagos = [{id:'paid',proyecto_id:'p-existing',monto:750000,estado:'completado',fecha:'2026-11-13'}];
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/dashboard');
  const table = page.getByRole('table',{name:'Montos financieros por obra'});
  await expect(table.getByText('$3.000.000',{exact:true})).toBeVisible();
  await expect(table.getByText('$750.000',{exact:true})).toBeVisible();
  const graph = page.getByRole('region',{name:'Gráfico de flujo financiero por obra'});
  await expect(graph.locator('.recharts-label-list').first()).toContainText('$3 M');
  await expect(page.getByText('Total Cobrado (25%):',{exact:true})).toBeVisible();
  await expect(page.getByText('Por Cobrar (75%):',{exact:true})).toBeVisible();
  await graph.locator('.recharts-bar-rectangle').first().hover();
  await expect(graph.locator('.recharts-tooltip-wrapper')).toContainText('$3.000.000');
  for(const width of [390,320]){
    await page.setViewportSize({width,height:900});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(table).toBeVisible();
  }
});

test('cartera vacía muestra un estado claro sin porcentajes inválidos',async({page})=>{
  const db=await setup(page,{},true);db.proyectos[0].monto_cotizado=0;
  await page.goto('/dashboard');
  await expect(page.getByText('Sin movimientos',{exact:true})).toBeVisible();
  await expect(page.getByText('Total Cobrado (0%):',{exact:true})).toBeVisible();
  await expect(page.getByText('Por Cobrar (0%):',{exact:true})).toBeVisible();
});
