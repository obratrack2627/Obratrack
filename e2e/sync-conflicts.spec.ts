import {test,expect} from '@playwright/test';
import {setup} from './helpers/platform';

for(const keep of ['remote','local'] as const){
 test(`conflicto móvil permite conservar la versión ${keep==='remote'?'de la nube':'local'} sin sobrescritura silenciosa`,async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const db=await setup(page,{},true);db.proyectos[0].nombre='Cambio remoto';db.proyectos[0].sync_version=2;
  await page.addInitScript(()=>{
   const original=JSON.parse(localStorage.getItem('obratrack_proyectos_v7_fixture-company')||'[]')[0];
   localStorage.setItem('obratrack_dirty_v1_fixture-company',JSON.stringify({proyectos:{'p-existing':{...original,nombre:'Cambio local',sync_version:1}}}));
   localStorage.setItem('obratrack_sync_versions_v1_fixture-company',JSON.stringify({proyectos:{'p-existing':1}}));
  });
  let applied=0;
  await page.route('**/api/supabase/sync*',async route=>{
   if(route.request().method()!=='POST')return route.fallback();
   const input=route.request().postDataJSON();
   if(input.versiones?.proyectos?.['p-existing']!==2)return route.fulfill({status:409,json:{code:'SYNC_CONFLICT',error:'Hay cambios más recientes en la nube. Revisa el conflicto antes de guardar; tus cambios siguen en este dispositivo.'}});
   applied++;db.proyectos[0]={...db.proyectos[0],...input.cambios.proyectos[0],sync_version:3};
   return route.fulfill({json:{success:true,versiones:{proyectos:{'p-existing':3}}}});
  });
  await page.goto('/proyectos');
  await page.getByRole('button',{name:'Revisar cambios',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Revisar cambios pendientes'});
  await expect(dialog.getByText('Cambio local',{exact:true}).last()).toBeVisible();await expect(dialog.getByText('Cambio remoto',{exact:false})).toBeVisible();
  await dialog.getByRole('button',{name:keep==='remote'?'Conservar datos de la nube':'Guardar mis cambios',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('link',{name:keep==='remote'?'Cambio remoto':'Cambio local',exact:true})).toBeVisible();
  expect(applied).toBe(keep==='local'?1:0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('obratrack_dirty_v1_fixture-company')||'{}').proyectos||{})).toEqual({});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 });
}

test('una respuesta perdida reintenta el mismo lote sin volver a aplicar sus cambios',async({page})=>{
 const db=await setup(page,{},true);const ids:string[]=[];let applied=0,fail=true;
 await page.addInitScript(()=>{
  const original=JSON.parse(localStorage.getItem('obratrack_proyectos_v7_fixture-company')||'[]')[0];
  localStorage.setItem('obratrack_dirty_v1_fixture-company',JSON.stringify({proyectos:{'p-existing':{...original,nombre:'Cambio confirmado'}}}));
 });
 await page.route('**/api/supabase/sync*',async route=>{
  if(route.request().method()!=='POST')return route.fallback();
  const input=route.request().postDataJSON();ids.push(input.request_id);
  if(applied===0){applied++;db.proyectos[0]={...input.cambios.proyectos[0],sync_version:2};}
  if(fail)return route.fulfill({status:503,json:{code:'SYNC_SAVE',error:'La confirmación se perdió. Los cambios siguen pendientes.'}});
  return route.fulfill({json:{success:true,versiones:{proyectos:{'p-existing':2}}}});
 });
 await page.goto('/proyectos');await expect(page.getByRole('status').filter({hasText:'La confirmación se perdió'})).toBeVisible();
 fail=false;await page.getByRole('button',{name:'Reintentar sincronización',exact:true}).click();
 await expect(page.getByRole('button',{name:'Reintentar sincronización',exact:true})).toHaveCount(0);
 expect(applied).toBe(1);expect(ids.length).toBeGreaterThanOrEqual(2);expect(new Set(ids).size).toBe(1);
});
