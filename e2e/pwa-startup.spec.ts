import {test,expect} from '@playwright/test';
import {setup} from './helpers/platform';
test('el service worker es público y devuelve JavaScript sin sesión',async({request})=>{
 const response=await request.get('/sw.js');expect(response.status()).toBe(200);expect(response.headers()['content-type']).toContain('javascript');expect(await response.text()).toContain('push');
});
test('la PWA muestra su marca y tres puntos animados sin texto de preparación',async({page})=>{
 await setup(page,{},true);await page.setViewportSize({width:390,height:844});
 await page.addInitScript(()=>{const native=window.matchMedia.bind(window);window.matchMedia=(query)=>{const media=native(query);if(query.includes('display-mode'))Object.defineProperty(media,'matches',{value:true});return media;};});
 await page.clock.install();await page.goto('/dashboard',{waitUntil:'domcontentloaded'});
 const splash=page.getByRole('status',{name:'Cargando ObraTrack'});await expect(splash).toBeVisible();
 await expect(splash.locator('.pwa-splash-dots i')).toHaveCount(3);await expect(splash).not.toContainText('Preparando');
 expect(await splash.locator('i').first().evaluate(el=>getComputedStyle(el).animationName)).toBe('pwa-dot');
 await page.screenshot({path:'/tmp/obratrack-pwa-startup.png'});
 await page.clock.fastForward(1500);await expect(splash).toHaveCount(0);
});
