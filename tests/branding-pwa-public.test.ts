import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

describe('branding público e PWA por barbearia',()=>{
 it('escolhe o manifest da barbearia antes do React iniciar',()=>{
  const index=readFileSync(resolve('index.html'),'utf8');
  const bootstrap=readFileSync(resolve('public/pwa-manifest-bootstrap.js'),'utf8');
  const app=readFileSync(resolve('src/App.tsx'),'utf8');
  expect(index).toContain('/pwa-manifest-bootstrap.js');
  expect(index.indexOf('/pwa-manifest-bootstrap.js')).toBeLessThan(index.indexOf('/src/main.tsx'));
  expect(bootstrap).toContain('/api/public/manifest/');
  expect(bootstrap).toContain('audience');
  expect(bootstrap).toContain('shop');
  expect(app).toContain('isPlatform||isPublicPortal');
 });

 it('não reutiliza branding público antigo depois de salvar',()=>{
  const server=readFileSync(resolve('server/app.ts'),'utf8');
  const portal=readFileSync(resolve('src/pages/PublicPortal.tsx'),'utf8');
  expect(server).toContain("res.set('Cache-Control','no-store').json({shop:");
  expect(server).toContain("set('Cache-Control','no-store').send(JSON.stringify");
  expect(server).toContain("p_setup:{customAccent:v.accentColor}");
  expect(portal).toContain("cache:'no-store'");
  expect(portal).toContain("backgroundImage:data.shop.background_url");
 });

 it('explica a marca FIO e identifica o cliente pela barbearia',()=>{
  const portal=readFileSync(resolve('src/pages/PublicPortal.tsx'),'utf8');
  const auth=readFileSync(resolve('src/pages/Auth.tsx'),'utf8');
  expect(portal).toContain("t('public.createShop')");
  expect(portal).toContain("t('public.startNow')");
  expect(auth).toContain("t('auth.headingClientSignup',{name:clientBrand})");
  expect(auth).toContain("t('auth.createMyShop')");
  const dict=readFileSync(resolve('src/i18n/dictionaries.ts'),'utf8');
  expect(dict).toContain('Crie sua barbearia com o FIO.');
  expect(dict).toContain('Começar agora');
  expect(dict).toContain('Faça parte da {{name}}.');
  expect(dict).toContain('Criar minha barbearia');
 });
});
