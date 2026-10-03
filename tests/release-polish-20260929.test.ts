import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

describe('acabamento do lançamento 2026-09-29',()=>{
 it('captura cedo o prompt PWA e mantém o seletor 2x2 no mobile',()=>{
  const bootstrap=readFileSync(resolve('public/pwa-manifest-bootstrap.js'),'utf8');
  const portal=readFileSync(resolve('src/pages/PublicPortal.tsx'),'utf8');
  const css=readFileSync(resolve('src/styles.css'),'utf8');
  expect(bootstrap).toContain('__fioInstallPrompt');
  expect(bootstrap).toContain('fio-install-ready');
  expect(portal.indexOf("installPlatform('windows')")).toBeLessThan(portal.indexOf("installPlatform('android')"));
  expect(portal).toContain("t('public.chooseDevice')");
  expect(css).toContain('.booking-app-card-platforms .booking-platform-buttons button{grid-column:auto!important');
 });

 it('gera o QR localmente sem depender de imagem externa',()=>{
  const owner=readFileSync(resolve('src/pages/OwnerOnboarding.tsx'),'utf8');
  expect(owner).toContain('QRCodeSVG');
  expect(owner).toContain('downloadQr');
  expect(owner).not.toContain('quickchart.io/qr');
 });

 it('inclui carrossel na tela inicial e identidade única por telefone',()=>{
  const workspace=readFileSync(resolve('src/pages/Workspace.tsx'),'utf8');
  const server=readFileSync(resolve('server/app.ts'),'utf8');
  const auth=readFileSync(resolve('src/pages/Auth.tsx'),'utf8');
  expect(workspace).toContain('HomeCarousel');
  expect(workspace).toContain("t('home.carouselAria')");
  expect(server).toContain("rpc('claim_account_phone'");
  expect(auth).toContain('account_phone');
  expect(auth).toContain("t('auth.existingAccount')");
  const dict=readFileSync(resolve('src/i18n/dictionaries.ts'),'utf8');
  expect(dict).toContain('Escolha o modelo do seu aparelho e faça o download.');
  expect(dict).toContain('Destaques do FIO');
  expect(dict).toContain('Este e-mail já está vinculado a uma conta FIO.');
 });
});
