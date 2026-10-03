import {chromium} from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out='docs/layout-evidence';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge'});
const results=[],errors=[];
const page=await browser.newPage();
page.on('pageerror',e=>errors.push(e.message));
const base='http://127.0.0.1:4183';
async function open(path,width=390,height=844,theme='dark'){
 await page.setViewportSize({width,height});
 await page.goto(base+path);await page.locator('.app-shell').waitFor();
 await page.evaluate(t=>window.dispatchEvent(new CustomEvent('fio-theme-change',{detail:t})),theme);
 await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(300);
}
async function fits(label){
 const sizes=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
 if(sizes.scroll>sizes.width+1)console.log(await page.locator('body *').evaluateAll(els=>els.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1;}).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width})).slice(-20)));
 assert.ok(sizes.scroll<=sizes.width+1,`${label}: horizontal overflow ${JSON.stringify(sizes)}`);results.push(label);
}
try{
 if(process.argv.includes('--booking')){
  await open('/owner/agenda',390);await page.getByRole('button',{name:'Agendar horário',exact:true}).click();await page.getByLabel('Data',{exact:true}).fill('2026-10-01');await page.getByRole('button',{name:'09:00',exact:true}).click();await page.screenshot({path:`${out}/booking-390.png`});
  assert.ok((await page.getByRole('button',{name:'09:00',exact:true}).boundingBox()).height>=44);await fits('Booking touch targets');
  await page.getByRole('button',{name:'Confirmar agendamento'}).click();await page.getByText('Agendamento criado.',{exact:true}).waitFor();
 }else{
 if(!process.argv.includes('--inventory')){
 for(const width of [320,360,390,430,768,1366,1440])for(const theme of ['dark','light'])for(const route of ['agenda','configuracoes','assistente']){
  await open(`/owner/${route}`,width,844,theme);await fits(`${width}/${theme}/${route}`);
  if(route==='assistente'){
   const box=await page.locator('.composer').boundingBox();assert.ok(box.y+box.height<=844,'Composer visible');
   const nav=await page.locator('.bottom-nav').boundingBox();if(nav)assert.ok(box.y+box.height<=nav.y,'Composer above navigation');
  }
  if([390,1440].includes(width))await page.screenshot({path:`${out}/${route}-${width}-${theme}.png`});
 }
 for(const role of ['OWNER','BARBER','CLIENT']){
  await open(`/${role.toLowerCase()}/agenda?role=${role}`,360);await page.getByRole('button',{name:'Mais opções',exact:true}).click();
  await page.getByRole('link',{name:'Configurações',exact:true}).click();await page.getByRole('heading',{name:'Configurações',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Barbearia',exact:true}).count(),role==='OWNER'?1:0);results.push(`Navigation/settings/${role}`);
 }
 await open('/owner/agenda?scenario=long',320);await fits('Long names and 30 records');await page.locator('.appointment-row').first().click();await fits('Appointment dialog');await page.screenshot({path:`${out}/appointment-dialog-320.png`});await page.getByRole('button',{name:'Fechar',exact:true}).click();
 await open('/owner/agenda?scenario=empty',320);await page.getByRole('heading',{name:'Um espaço livre no seu dia'}).waitFor();await fits('Empty agenda');
 await open('/owner/agenda',390);await page.getByRole('button',{name:'Agendar horário',exact:true}).click();
 await page.getByLabel('Data',{exact:true}).fill('2026-10-01');await page.getByRole('button',{name:'09:00',exact:true}).click();await page.getByRole('heading',{name:'Confira seu horário'}).waitFor();await fits('Booking summary');await page.screenshot({path:`${out}/booking-390.png`});await page.getByRole('button',{name:'Confirmar agendamento'}).click();await page.getByText('Agendamento criado.',{exact:true}).waitFor();results.push('Booking completed with fictitious API');
 await open('/owner/assistente?scenario=error');await page.getByLabel('Mensagem para o Assistente').fill('Minha agenda');await page.getByLabel('Enviar mensagem',{exact:true}).click();await page.getByRole('button',{name:'Tentar de novo'}).waitFor();await page.screenshot({path:`${out}/chat-error-390.png`});await page.getByRole('button',{name:'Tentar de novo'}).click();await page.getByText('Resposta fictícia de teste.',{exact:false}).waitFor();assert.equal(await page.locator('.message.user').count(),1);results.push('Chat retry without duplicate user message');
 await page.getByLabel('Histórico de conversas').click();await page.getByRole('button',{name:'Minha agenda — conversa de teste'}).click();await page.locator('.message').nth(29).waitFor();
 await page.locator('.message-scroll').evaluate(el=>el.scrollTop=0);await page.waitForTimeout(100);
 await page.getByLabel('Mensagem para o Assistente').fill('Teste de rolagem');await page.getByLabel('Enviar mensagem',{exact:true}).click();
 await page.locator('.message-scroll').evaluate(el=>el.scrollTop=0);await page.waitForTimeout(700);assert.ok(await page.locator('.message-scroll').evaluate(el=>el.scrollTop<50));results.push('Incoming response preserves reading position');
 await page.getByLabel('Nova conversa',{exact:true}).click();assert.equal(await page.locator('.message').count(),0);
 for(const [width,height] of [[390,480],[740,360]]){await open('/owner/assistente',width,height);await fits(`Short/landscape ${width}x${height}`);const b=await page.locator('.composer').boundingBox();assert.ok(b.y+b.height<=height);}
 await open('/owner/configuracoes',320);await page.evaluate(()=>document.documentElement.style.fontSize='24px');await fits('150% text settings');
 await open('/owner/assistente',320);await page.evaluate(()=>document.documentElement.style.fontSize='24px');await fits('150% text chat');
 }
 for(const theme of ['dark','light'])for(const route of ['','clientes','equipe','servicos','assinaturas','feed','comunicacao','plano-fio','suporte']){
  await open('/owner/'+route,320,844,theme);await fits(`Inventory/${route||'home'}/${theme}`);
 }
 await open('/owner/configuracoes');for(const name of ['Barbearia','Plano FIO','Acessos e app','Conta e segurança']){await page.getByRole('button',{name,exact:true}).click();await fits(`Settings group/${name}`);}
 await open('/owner');await page.evaluate(()=>window.dispatchEvent(new Event('fio-tour-restart')));await page.locator('.fio-tour-card').waitFor();await page.waitForTimeout(500);
 for(let step=0;step<7;step++){
  const overlap=await page.evaluate(()=>{const card=document.querySelector('.fio-tour-card').getBoundingClientRect();const targets=['overview','nav-agenda','nav-configuracoes','nav-suporte','feedback','feedback-message','feedback-send'];const title=document.querySelector('.fio-tour-card small').textContent;const index=Number(title.match(/(\d+) \/ /)?.[1])-1;const target=document.querySelector(`[data-tour="${targets[index]}"]`)?.getBoundingClientRect();return !target||(card.top<target.bottom&&card.bottom>target.top&&card.left<target.right&&card.right>target.left);});
  assert.ok(!overlap,`Tour overlaps target at ${step}`);await page.getByRole('button',{name:step===6?'Concluir':'Próximo',exact:true}).click();await page.waitForTimeout(500);
 }results.push('All seven tour targets visible');
 for(const route of ['/login','/login?mode=signup','/login?mode=forgot','/confirm-email','/reset-password']){
  await page.setViewportSize({width:320,height:700});await page.goto(base+route);await page.waitForTimeout(300);await fits(`Auth screen ${route}`);
 }
 await page.route('**/api/public/shop/studio-teste',route=>route.fulfill({json:{shop:{id:'test',name:'Studio de Teste',slug:'studio-teste'},services:[{id:'service',name:'Corte com acabamento',duration_minutes:30,price_cents:3500}],team:[],subscriptionPlans:[]}}));
 await page.goto(base+'/b/studio-teste');await page.getByRole('heading',{name:'Studio de Teste'}).waitFor();await fits('Public shop with synthetic data');await page.screenshot({path:`${out}/public-320.png`});
 }
 assert.deepEqual(errors,[]);
 console.log(`PASS ${results.length} checks`);
}catch(e){console.error(e);await page.screenshot({path:`${out}/failure.png`,fullPage:true});process.exitCode=1;}
finally{fs.writeFileSync(`${out}/${process.argv.includes('--booking')?'booking-results':process.argv.includes('--inventory')?'inventory-results':'results'}.json`,JSON.stringify({checks:results,errors},null,2));await browser.close();}
