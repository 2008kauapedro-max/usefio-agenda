import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

describe('experiência diária da equipe',()=>{

 const workspace=
  readFileSync(
   'src/pages/Workspace.tsx',
   'utf8'
  );

 const period=
  readFileSync(
   'src/components/AppointmentPeriod.tsx',
   'utf8'
  );

 const css=
  readFileSync(
   'src/styles.css',
   'utf8'
  );

 it('mostra próximo atendimento na visão geral',()=>{
  expect(workspace)
   .toContain("t('home.nextService')");

  expect(workspace)
   .toContain('next-appointment-card');
 });

 it('usa primeiro nome e perfil do cliente',()=>{
  expect(workspace)
   .toContain("firstName(customer?.name,t('ws.client'))");

  expect(workspace)
   .toContain("t('staffAgenda.customerProfile')");

  expect(workspace)
   .toContain("t('staffAgenda.whatsapp')");
 });

 it('remove etapa manual de iniciar',()=>{
  expect(workspace)
   .not.toContain('Iniciar atendimento');

  expect(workspace)
   .toContain("t('staffAgenda.finish')");
 });

 it('histórico possui avatar e cards próprios',()=>{
  expect(period)
   .toContain('period-client-avatar');

  expect(period)
   .toContain("t('period.history')");

  const dict=readFileSync('src/i18n/dictionaries.ts','utf8');
  expect(dict).toContain('PRÓXIMO ATENDIMENTO');
  expect(dict).toContain('Perfil do cliente');
  expect(dict).toContain('Chamar no WhatsApp');
  expect(dict).toContain('Finalizar atendimento');
  expect(dict).toContain('Ver histórico do mês');
 });

 it('remove textura e corrige fundos',()=>{
  expect(css)
   .toContain('.sidebar:after');

  expect(css)
   .toContain('display:none!important');

  expect(css)
   .toContain('#root:has(.workspace)');
 });

});
