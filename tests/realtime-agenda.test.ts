import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

describe('agenda em tempo real',()=>{
 it('escuta novos agendamentos e atualizações da barbearia atual',()=>{
  const app=readFileSync(resolve('src/App.tsx'),'utf8');
  expect(app).toContain("table:'appointments'");
  expect(app).toContain("event:'INSERT'");
  expect(app).toContain("event:'UPDATE'");
  expect(app).toContain('barbershop_id=eq.${shopId}');
  expect(app).toContain("setToast(t('app.newAppointment'))");
 });
 it('sincroniza quando o app volta ao foco ou a internet retorna',()=>{
  const app=readFileSync(resolve('src/App.tsx'),'utf8');
  expect(app).toContain("window.addEventListener('focus',sync)");
  expect(app).toContain("window.addEventListener('online',sync)");
  expect(app).toContain("document.addEventListener('visibilitychange',visible)");
 });
 it('mantém botão manual de atualização na agenda',()=>{
  const workspace=readFileSync(resolve('src/pages/Workspace.tsx'),'utf8');
  expect(workspace).toContain("t('staffAgenda.refresh')");
  expect(workspace).toContain('RefreshCw');
  expect(workspace).toContain("t('staffAgenda.auto')");
  const dict=readFileSync(resolve('src/i18n/dictionaries.ts'),'utf8');
  expect(dict).toContain('Atualizar agenda');
  expect(dict).toContain('Atualização automática');
 });
 it('publica appointments no Supabase Realtime sem remover RLS',()=>{
  const sql=readFileSync(resolve('supabase/migrations/20260929134500_appointments_realtime.sql'),'utf8');
  expect(sql).toContain('supabase_realtime');
  expect(sql).toContain('public.appointments');
  expect(sql).toContain('pg_publication_tables');
 });
});
