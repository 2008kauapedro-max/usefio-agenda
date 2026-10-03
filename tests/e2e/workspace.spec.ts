import {test,expect} from '@playwright/test';
test('dashboard responsivo e navegação dos três perfis',async({page})=>{
 for(const [role,name] of [['owner','Lucas'],['barber','Rafael'],['client','Gabriel']]){
  await page.goto(`/demo/${role}`);await expect(page.getByRole('heading',{name:`Olá, ${name}.`})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.goto(`/demo/${role}/assistente`);await expect(page.getByRole('heading',{name:'Uma boa pergunta. Novas possibilidades.'})).toBeVisible();
  await page.getByRole('textbox',{name:'Mensagem para o Assistente'}).fill('Qual minha agenda?');await page.getByRole('button',{name:'Enviar mensagem'}).click();
  await expect(page.getByRole('alert')).toContainText('demonstração');
 }
});
test('criar agendamento de demonstração e confirmar cancelamento',async({page})=>{
 await page.goto('/demo/owner/agenda');await page.getByRole('button',{name:'Agendar horário',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 const future=new Date(Date.now()+86400000).toISOString().slice(0,10);await dialog.getByLabel('Data',{exact:true}).fill(future);
 await dialog.getByRole('button',{name:'09:00',exact:true}).click();await dialog.getByRole('button',{name:'Confirmar agendamento'}).click();await expect(dialog).not.toBeVisible();
 await page.getByLabel('Dia da agenda').fill(future);await page.getByRole('button',{name:/09:00.*Gabriel Santos/}).click();await page.getByRole('button',{name:'Confirmar cancelamento'}).click();await expect(page.getByRole('button',{name:/09:00.*Gabriel Santos/})).toContainText('Cancelado');
});
test('perfis não abrem áreas administrativas',async({page})=>{
 await page.goto('/demo/client/financeiro');await expect(page).toHaveURL(/\/demo\/client$/);await expect(page.getByRole('heading',{name:'Olá, Gabriel.'})).toBeVisible();
 await page.goto('/demo/barber/equipe');await expect(page).toHaveURL(/\/demo\/barber$/);
});
test('modal possui foco e fecha com Escape; busca filtra clientes',async({page})=>{
 await page.goto('/demo/owner/clientes');await page.getByRole('textbox',{name:'Buscar cliente'}).fill('Pedro');await expect(page.getByRole('heading',{name:'Pedro Oliveira'})).toBeVisible();await expect(page.getByRole('heading',{name:'Gabriel Santos'})).toHaveCount(0);
 await page.getByRole('button',{name:'Novo cliente'}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
});
