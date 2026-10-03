import {test,expect} from '@playwright/test';

function saoPauloDayKey(date:Date){
 const parts=new Intl.DateTimeFormat('en-US',{
  timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(date);
 const get=(type:Intl.DateTimeFormatPartTypes)=>parts.find(part=>part.type===type)?.value??'';
 return `${get('year')}-${get('month')}-${get('day')}`;
}

test('agenda opens from the next appointment and booking needs no payment step',async({page})=>{
 await page.goto('/tests/fixtures/scheduling-preview.html');

 const nextAppointment=page.locator('.next-appointment-card').first();
 await expect(nextAppointment).toBeVisible();
 await nextAppointment.click();
 // O fixture usa MemoryRouter; a rota interna muda sem alterar a URL real do navegador.
 await expect(page.getByRole('heading',{name:'Agenda da barbearia',exact:true})).toBeVisible();

 const details=page.getByRole('dialog');
 if(await details.count()){
  await details.getByRole('button',{name:'Fechar',exact:true}).click();
  await expect(details).toHaveCount(0);
 }

 await page.getByRole('button',{name:'Novo agendamento',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog).toBeVisible();

 // Profissional e serviço/cliente já têm valores válidos na demonstração.
 await dialog.getByRole('button',{name:'Continuar',exact:true}).click();
 await dialog.getByRole('button',{name:'Continuar',exact:true}).click();

 const futureKey=saoPauloDayKey(new Date(Date.now()+3*86400000));
 const currentKey=saoPauloDayKey(new Date());
 if(futureKey.slice(0,7)!==currentKey.slice(0,7)){
  await dialog.getByRole('button',{name:'Próximo mês',exact:true}).click();
 }

 const futureDay=String(Number(futureKey.slice(-2)));
 await dialog.locator('.booking-calendar-grid').getByRole('button',{name:futureDay,exact:true}).click();
 await dialog.getByRole('button',{name:'09:00',exact:true}).click();
 await dialog.getByRole('button',{name:'Continuar',exact:true}).click();
 await dialog.getByRole('button',{name:'Confirmar agendamento',exact:true}).click();

 await expect(dialog).toHaveCount(0);
 await expect(page.getByRole('status')).toContainText('Agendamento criado');

 await page.getByLabel('Dia da agenda',{exact:true}).fill(futureKey);
 await expect(page.locator('.appointment-list button').filter({hasText:'Gabriel'}).first()).toBeVisible();
 await expect(page.getByText(/Gerar Pix|Confirmar recebimento/)).toHaveCount(0);
});
