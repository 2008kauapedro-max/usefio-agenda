import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

describe('visão geral do FIO',()=>{
 it('troca o painel de agenda por uma home de destaques para equipe',()=>{
  const workspace=readFileSync(resolve('src/pages/Workspace.tsx'),'utf8');
  expect(workspace).toContain('function StaffHome');
  expect(workspace).toContain("t('home.owner.s4e')");
  expect(workspace).toContain("t('home.owner.s4t')");
  expect(workspace).toContain('home-quick-grid');
  expect(workspace).not.toContain("title={role==='CLIENT'?'Agende seu horário':'Agenda de hoje'}");
 });
 it('mantém a agenda acessível pelos atalhos e pelo menu',()=>{
  const workspace=readFileSync(resolve('src/pages/Workspace.tsx'),'utf8');
  expect(workspace).toContain("t('home.agendaDesc')");
  expect(workspace).toContain("t('home.openMiniSite')");
  expect(workspace).toContain("t('home.customization')");
  const dict=readFileSync(resolve('src/i18n/dictionaries.ts'),'utf8');
  expect(dict).toContain('EM BREVE • FIO NFC');
  expect(dict).toContain('Sua marca também no mundo físico.');
  expect(dict).toContain('Horários e atendimentos em tempo real.');
  expect(dict).toContain('Abrir mini site');
  expect(dict).toContain('Personalização');
 });
});
