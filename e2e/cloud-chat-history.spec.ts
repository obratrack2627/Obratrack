import {test,expect,type Page} from '@playwright/test';
import {setup,send} from './helpers/platform';
test('el chat general continúa desde otro dispositivo móvil y conserva un reset en la nube',async({page,browser})=>{
 test.setTimeout(120000);
 const messages=new Map<string,any>();let version=0;
 const install=async(target:Page)=>{
  await setup(target,{respuesta:'Podemos continuar con el radier de 20 m2.',accion:null,cotizacion:null});
  await target.route('**/api/cotizador/historial',async route=>{
   const request=route.request();let conflict=false;
   if(request.method()==='POST'){
    const body=request.postDataJSON();conflict=body.version!==version;
    if(!conflict){if(body.reset){version++;messages.clear();}else for(const message of body.messages)if(!messages.has(message.id))messages.set(message.id,message);}
   }
   await route.fulfill({json:{version,messages:Array.from(messages.values()),conflict}});
  });
 };
 await install(page);await page.goto('/cotizador');await expect(page.getByText('Historial sincronizado',{exact:true})).toBeVisible();
 await send(page,'El radier mide 20 m2');await expect(page.getByText('Podemos continuar con el radier de 20 m2.',{exact:true})).toBeVisible();
 await expect.poll(()=>messages.size).toBe(2);
 const mobileContext=await browser.newContext({viewport:{width:390,height:844}});const mobile=await mobileContext.newPage();
 try{
  await install(mobile);await mobile.goto('/cotizador');await expect(mobile.getByText('El radier mide 20 m2',{exact:true})).toBeVisible();
  await expect(mobile.getByText('Historial sincronizado',{exact:true})).toBeVisible();
  await mobile.getByTitle('Iniciar nueva conversación limpia').click();await expect.poll(()=>version).toBe(1);await expect.poll(()=>messages.size).toBe(0);
  await page.reload();await expect(page.getByText('Historial sincronizado',{exact:true})).toBeVisible();await expect(page.getByText('El radier mide 20 m2',{exact:true})).toHaveCount(0);
  expect(await mobile.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 }finally{await mobileContext.close();}
});
