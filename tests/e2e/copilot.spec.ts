import {test,expect} from '@playwright/test';
for(const width of [320,360,390,430,1440]){
 test(`Platform AI, alerts and settings at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/platform/ai');await expect(page.getByRole('heading',{name:'Copiloto FIO'})).toBeVisible();
  await page.getByLabel('Sua pergunta').fill('Suspender barbearia de teste');await page.getByRole('button',{name:'Enviar pergunta'}).click();
  await expect(page.getByLabel('Proposta administrativa')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Confirmar ação'}).click();await expect(page.getByText('Ação executada e registrada.')).toBeVisible();
  for(const path of ['/platform/alertas','/platform/configuracoes']){await page.goto(path);await expect(page.getByRole('heading',{name:path.endsWith('alertas')?'Alertas':'Configurações',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  expect(errors).toEqual([]);
 });
 test(`Instagram banner, fallback and dismissal at ${width}px`,async({browser})=>{
  const context=await browser.newContext({viewport:{width,height:900},userAgent:'Mozilla/5.0 (Linux; Android 14) Chrome/122 Instagram 320'}),page=await context.newPage();
  await page.goto('/b/studio-teste?utm_source=instagram&next=%2Fagenda');await expect(page.getByRole('heading',{name:'Studio de Teste'})).toBeVisible();
  const link=page.getByRole('link',{name:'Abrir no navegador'});await expect(link).toHaveAttribute('href',/\/b\/studio-teste\?utm_source=instagram&next=%2Fagenda$/);
  await expect(page.locator('.public-install-nudge')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await link.click();await expect(page.getByRole('status')).toContainText('Abrir no Chrome');
  await page.getByRole('button',{name:'Fechar aviso do navegador'}).click();await page.reload();await expect(page.getByLabel('Abrir no navegador')).toHaveCount(0);await expect(page.locator('.public-install-nudge')).toHaveCount(0);await context.close();
 });
}
test('normal browser keeps PWA guidance and no internal-browser banner',async({page})=>{await page.goto('/b/studio-teste');await expect(page.getByRole('heading',{name:'Studio de Teste'})).toBeVisible();await expect(page.locator('.in-app-banner')).toHaveCount(0);await expect(page.locator('.public-install-nudge')).toBeVisible();});
