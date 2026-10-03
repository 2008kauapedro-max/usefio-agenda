import {chromium} from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out='docs/reorganization-evidence',results=JSON.parse(fs.readFileSync(`${out}/progress.json`,'utf8')),errors=[];
const b=await chromium.launch({channel:'msedge'}),p=await b.newPage();p.on('pageerror',e=>errors.push(e.message));
await p.route('**/api/public/shop/**',r=>r.fulfill({json:{shop:{id:'00000000-0000-4000-8000-000000000001',name:'Studio 011',slug:'studio-011'},services:[],team:[]}}));
async function open(path,width,port=4186){await p.setViewportSize({width,height:width>1000?1000:844});await p.goto(`http://127.0.0.1:${port}${path}`);await p.locator('h1,.assistant-toolbar,.pc-header').first().waitFor({state:'attached'});await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(400);}
async function fits(label){assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label);results.push(label);fs.writeFileSync(`${out}/remaining-progress.json`,JSON.stringify(results,null,2));}
try{
 for(const width of [360,390,430,1440]){
  for(const role of ['client','barber','owner']){await open(`/${role}?role=${role.toUpperCase()}`,width);await fits(`home corrected ${role} ${width}`);const n=p.locator('.install-nudge');if(await n.count()){assert.ok(await n.evaluate(e=>e.getBoundingClientRect().top>=e.previousElementSibling.getBoundingClientRect().bottom),'Install banner must not overlap content');}await p.screenshot({path:`${out}/${role}-home-${width}.png`});}
  for(const path of ['','/barbearias','/assinaturas','/suporte','/atividade','/ai','/alertas','/configuracoes']){await open('/platform'+path,width,4187);await fits(`platform${path||'/home'} ${width}`);if(['','/ai','/configuracoes'].includes(path))await p.screenshot({path:`${out}/platform-${path.slice(1)||'home'}-${width}.png`});}
 }
 await open('/owner/assistente?role=OWNER',1440);await p.getByRole('button',{name:'Histórico de conversas'}).click();await p.getByRole('button',{name:/Minha agenda — conversa/}).click();await p.getByRole('log').getByText(/Conversa fictícia/).first().waitFor({state:'attached'});await fits('long chat 1440');await p.screenshot({path:`${out}/chat-long-1440.png`});
 await open('/client/assistente?role=CLIENT&scenario=error',390);await p.getByRole('textbox',{name:'Mensagem para o Assistente'}).fill('Meus horários?');await p.getByRole('button',{name:'Enviar mensagem'}).click();await p.getByRole('button',{name:'Tentar de novo'}).click();await p.getByRole('log').getByText(/Resposta fictícia/).waitFor();await fits('chat provider error and retry');await p.screenshot({path:`${out}/chat-retry-390.png`});
 for(const category of ['Meu perfil','Equipe e horários','Notificações']){await open('/owner/configuracoes?role=OWNER',390);await p.getByRole('button',{name:category,exact:true}).click();await fits(`category screenshot ${category}`);await p.screenshot({path:`${out}/settings-${category==='Meu perfil'?'profile':category==='Notificações'?'notifications':'hours'}-390.png`});}
 assert.deepEqual(errors,[]);fs.writeFileSync(`${out}/browser-results.json`,JSON.stringify({environment:'Edge; synthetic API/session; no production',checks:results.length,results,errors},null,2));console.log(`PASS: ${results.length} checks accumulated; no page errors in remaining checks`);
}catch(e){console.error(e.stack);await p.screenshot({path:`${out}/remaining-failure.png`});process.exitCode=1;}finally{await Promise.race([b.close(),new Promise(r=>setTimeout(r,4000))]);process.exit(process.exitCode??0);}
