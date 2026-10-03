import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

describe('agenda premium',()=>{

 const booking=
  readFileSync(
   resolve('src/components/BookingFlow.tsx'),
   'utf8'
  );

 const calendar=
  readFileSync(
   resolve('src/components/BookingCalendar.tsx'),
   'utf8'
  );

 const workspace=
  readFileSync(
   resolve('src/pages/Workspace.tsx'),
   'utf8'
  );

 const dict=readFileSync(resolve('src/i18n/dictionaries.ts'),'utf8');

 const sql=
  readFileSync(
   resolve(
    'supabase/migrations/20261001193000_agenda_calendar_availability.sql'
   ),
   'utf8'
  );

 it('cliente pode escolher profissional',()=>{

  expect(booking)
   .toContain("const lockedProvider=role==='BARBER'");

  expect(booking)
   .toContain("t('booking.chooseProfessional')");
  expect(dict).toContain('Escolha o profissional');

 });

 it('usa calendário mensal',()=>{

  expect(calendar)
   .toContain("t('calendar.dateEyebrow')");

  expect(calendar)
   .toContain("morning:'calendar.morning'");

  expect(calendar)
   .toContain("afternoon:'calendar.afternoon'");

  expect(calendar)
   .toContain("night:'calendar.night'");
  expect(dict).toContain('DATA DO AGENDAMENTO');
  expect(dict).toContain('Manhã');
  expect(dict).toContain('Tarde');
  expect(dict).toContain('Noite');

  expect(calendar)
   .toContain('/slots/month?');

 });

 it('cliente vê alterações e status',()=>{

  expect(workspace)
   .toContain('t(`status.${');
  expect(dict).toContain('\"status.scheduled\":\"Agendado\"');

  expect(workspace)
   .toContain("t('clientAgenda.recent')");

  expect(workspace)
   .toContain("t('clientAgenda.bookAnother')");
  expect(dict).toContain('Alterações recentes');
  expect(dict).toContain('Agendar outro horário');

 });

 it('equipe separa cancelados e confirma atendimento',()=>{

  expect(workspace)
   .toContain("t('staffAgenda.history')");

  expect(workspace)
   .not.toContain('Confirmar horário');

  expect(workspace)
   .not.toContain('Iniciar atendimento');

  expect(workspace)
   .toContain("t('staffAgenda.finish')");
  expect(dict).toContain('Histórico do dia');
  expect(dict).toContain('Finalizar atendimento');

 });

 it('novos horários começam em hora cheia',()=>{

  expect(sql)
   .toContain("interval '1 hour'");

  expect(sql)
   .toContain('FULL_HOUR_REQUIRED');

  expect(sql)
   .toContain('available_days');

 });

});