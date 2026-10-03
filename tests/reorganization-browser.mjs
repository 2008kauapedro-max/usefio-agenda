import {chromium} from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out='docs/reorganization-evidence';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']}),page=await browser.newPage(),results=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/public/shop/**',r=>r.fulfill({json:{shop:{id:'00000000-0000-4000-8000-000000000001',name:'Studio 011',slug:'studio-011'},services:[],team:[]}}));
async function open(role,route,width,theme='dark'){
 await page.setViewportSize({width,height:width>1000?1000:844});await page.goto(`http://127.0.0.1:4186/${role}${route}?role=${role.toUpperCase()}`);await page.locator('.app-shell').waitFor({state:'attached'});
 await page.evaluate(t=>window.dispatchEvent(new CustomEvent('fio-theme-change',{detail:t})),theme);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(500);
}
async function fits(label){const s=await page.evaluate(()=>({w:innerWidth,s:document.documentElement.scrollWidth}));assert.ok(s.s<=s.w+1,`${label} overflow ${JSON.stringify(s)}`);assert.equal(await page.locator('vite-error-overlay').count(),0);results.push(label);fs.writeFileSync(out+'/progress.json',JSON.stringify(results,null,2));}
try{
 for(const width of [360,390,430,1440]){
  for(const role of ['client','barber','owner']){
   for(const route of ['', '/agenda','/equipe','/servicos','/configuracoes','/assistente']){
    await open(role,route,width);await fits(`${role}${route||'/home'} ${width}`);
    if(route==='/assistente'){const box=await page.locator('.composer').boundingBox();assert.ok(box&&box.y+box.height<= (width>1000?1000:844),'Composer visible');}
    if(route==='/configuracoes'){
     const categories=await page.locator('.settings-nav button').allTextContents();
     assert.equal(categories.includes('Barbearia'),role==='owner');
     for(const label of categories){await page.getByRole('button',{name:label,exact:true}).click();await fits(`settings ${role}/${label} ${width}`);await page.locator('.settings-back').click();}
    }
    if([390,1440].includes(width)&&['','/agenda','/configuracoes','/assistente'].includes(route))await page.screenshot({path:`${out}/${role}-${route.slice(1)||'home'}-${width}.png`});
   }
  }
  await open('owner','/plano-fio',width);await fits(`plans ${width}`);await page.screenshot({path:`${out}/plans-${width}.png`});
  await open('client','/agenda',width);
  await page.getByRole('button',{name:'Agendar horário',exact:true}).click();await page.getByRole('button',{name:/Sem preferência/}).click();await page.getByRole('button',{name:'Continuar',exact:true}).click();
  await page.getByRole('button',{name:'Voltar',exact:true}).click();assert.equal(await page.getByRole('button',{name:/Sem preferência/}).getAttribute('aria-pressed'),'true');await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.getByRole('button',{name:'Continuar',exact:true}).click();
  const day=new Date(Date.now()+4*86400000).toISOString().slice(0,10);await page.getByLabel('Data',{exact:true}).fill(day);await page.getByRole('button',{name:'09:00',exact:true}).click();await page.getByRole('button',{name:'Continuar',exact:true}).click();
  await page.screenshot({path:`${out}/booking-review-${width}.png`});await fits(`booking ${width}`);await page.getByRole('button',{name:'Confirmar agendamento',exact:true}).click();await page.getByRole('status').filter({hasText:'Agendamento criado com'}).waitFor();
  await page.getByLabel('Dia da agenda').fill(day);await page.locator('.appointment-row').first().click();await page.getByRole('button',{name:'Remarcar',exact:true}).click();await page.getByLabel('Data',{exact:true}).fill(day);await page.getByRole('button',{name:'14:00',exact:true}).click();await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.getByRole('button',{name:'Confirmar remarcação'}).click();await page.getByRole('status').filter({hasText:'Horário remarcado'}).waitFor();
  await page.locator('.appointment-row').first().click();await page.getByRole('button',{name:'Cancelar',exact:true}).click();await page.getByRole('status').filter({hasText:'Agendamento cancelado'}).waitFor();results.push(`booking/reschedule/cancel ${width}`);
 }
 for(const width of [360,1440]){await open('owner','/assistente',width,'light');await page.getByRole('button',{name:'Histórico de conversas'}).click();await page.getByRole('button',{name:/Minha agenda — conversa/}).click();await fits(`long chat ${width}`);await page.screenshot({path:`${out}/chat-long-${width}.png`});}
 assert.deepEqual(errors,[]);fs.writeFileSync(`${out}/browser-results.json`,JSON.stringify({environment:'Edge; mocked API and session; no production',checks:results.length,results,errors},null,2));console.log(`PASS: ${results.length} checks; no page errors`);
}catch(e){await page.screenshot({path:`${out}/failure.png`});console.error('URL',page.url(),e.stack);process.exitCode=1;}finally{await Promise.race([browser.close(),new Promise(r=>setTimeout(r,5000))]);process.exit(process.exitCode??0);}


