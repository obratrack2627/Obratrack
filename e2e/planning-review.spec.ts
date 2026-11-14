import {test,expect} from '@playwright/test';
import {setup} from './helpers/platform';
import {chileToday,addCalendarDays} from '../lib/work-calendar';

test('preparación de faenas agrupa pendientes y se adapta a móvil',async({page})=>{
 test.setTimeout(120000);
 const db=await setup(page,{},true),today=chileToday();
 db.actividades=[
  {id:'floor',proyecto_id:'p-existing',nombre:'Instalación de manta y piso flotante',fecha_inicio:addCalendarDays(today,1),fecha_termino:addCalendarDays(today,2),porcentaje_avance:0,estado:'pendiente',orden:1},
  {id:'finish',proyecto_id:'p-existing',nombre:'Guardapolvos, remates y limpieza',fecha_inicio:addCalendarDays(today,2),fecha_termino:addCalendarDays(today,3),porcentaje_avance:0,estado:'pendiente',orden:2},
 ];
 db.materiales_proyecto=[
  {id:'manta',actividad_id:'floor',nombre:'Manta bajo piso compatible, sin manta integrada en laminado',cantidad:30,unidad:'m²'},
  {id:'piso',actividad_id:'floor',nombre:'Piso flotante laminado estándar, especificación por confirmar',cantidad:27.5,unidad:'m²'},
  {id:'guardapolvo',actividad_id:'finish',nombre:'Guardapolvo MDF revestido',cantidad:20,unidad:'metro lineal'},
  {id:'perfil',actividad_id:'finish',nombre:'Perfil de transición para acceso, medida por confirmar',cantidad:1,unidad:'unidad'},
  {id:'fijaciones',actividad_id:'finish',nombre:'Fijaciones y consumibles para remates',cantidad:1,unidad:'global'},
 ].map(m=>({...m,proyecto_id:'p-existing',precio_unitario:1000,subtotal:m.cantidad*1000,comprado:true,pagado:false}));
 db.bitacora_entradas=[{id:'receipt',proyecto_id:'p-existing',material_id:'manta',cantidad_recibida:2.5,tipo:'entrega_material',fecha:today,titulo:'Entrega parcial',nota:'Recepción registrada'}];
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900});await page.goto('/proyectos/p-existing/gantt');
  const panel=page.getByRole('region',{name:'Preparación de faenas'});
  await expect(panel).toBeVisible();await expect(panel.getByText('5 materiales por recibir',{exact:true})).toBeVisible();
  await expect(panel.locator('article')).toHaveCount(2);await expect(panel.locator('li')).toHaveCount(5);
  await expect(panel.getByRole('heading',{name:'Instalación de manta y piso flotante',exact:true})).toHaveCount(1);
  await expect(panel.getByText('27,5 m²',{exact:true})).toHaveCount(2);
  await expect(panel.getByText(/aunque el material ya esté comprado/)).toBeVisible();
  await expect(panel.getByText(/Registra las recepciones en Finanzas y materiales/)).toBeVisible();
  await expect(panel.locator('details')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  const cards=await panel.locator('article').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y};}));
  if(width===1440)expect(cards[0].y).toBe(cards[1].y);else expect(cards[1].y).toBeGreaterThan(cards[0].y);
  await panel.screenshot({path:`/tmp/obratrack-planning-${width}.png`});
 }
 await page.setViewportSize({width:390,height:900});await page.evaluate(()=>document.documentElement.classList.add('dark'));
 await page.getByRole('region',{name:'Preparación de faenas'}).screenshot({path:'/tmp/obratrack-planning-dark.png'});
 expect(errors).toEqual([]);
});
