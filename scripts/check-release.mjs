import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {parseEnv} from 'node:util';
import {execFileSync} from 'node:child_process';
const strict=process.argv.includes('--strict');
const env={};
for(const file of ['.env','.env.local'])if(existsSync(file))Object.assign(env,parseEnv(readFileSync(file,'utf8')));
Object.assign(env,process.env);
let failed=false;
function report(ok,label,required=true){console.log(`${ok?'OK':required?'FALHA':'PENDENTE'}: ${label}`);if(!ok&&required)failed=true;}
const [major,minor]=process.versions.node.split('.').map(Number);
report(major>22||(major===22&&minor>=12),'Node >=22.12');
for(const key of ['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'])report(Boolean(env[key]),`${key} configurada`,strict);
report(Boolean(env.VITE_TURNSTILE_SITE_KEY),'Site key pública Turnstile configurada (habilitar também no Supabase)',strict);
report(Boolean(env.SYNCPAY_CLIENT_ID&&env.SYNCPAY_CLIENT_SECRET),'SyncPay Client ID e Secret configurados',strict);
report(Object.entries(env).some(([k,v])=>k.startsWith('SYNCPAY_WEBHOOK_SECRET')&&String(v).length>=8),'Segredo de webhook SyncPay configurado',strict);
report(Boolean(env.AI_API_URL&&env.AI_API_KEY&&env.AI_MODEL),'Provedor de IA configurado',strict);
function role(value){try{return JSON.parse(Buffer.from(value.split('.')[1],'base64url').toString()).role;}catch{return '';}}
for(const [key,value] of Object.entries(env))if(key.startsWith('VITE_'))report(!/SECRET|SERVICE_ROLE|PRIVATE|PASSWORD/.test(key)&&role(String(value))!=='service_role'&&!String(value).startsWith('sb_secret_'),`${key} não contém chave privada`);
const secretValues=Object.entries(env).filter(([k,v])=>!k.startsWith('VITE_')&&/(SECRET|SERVICE_ROLE_KEY|AI_API_KEY|OIDC_TOKEN|PRIVATE_KEY)/.test(k)&&String(v).length>20).map(([,v])=>String(v));
let tracked=[];
try{tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).split('\0').filter(Boolean);}catch{console.log('PENDENTE: pasta ainda não vinculada ao Git; a verificação continua nos arquivos locais.');}
report(!tracked.some(p=>/(^|\/)\.env(?:\.|$)/.test(p)&&!p.endsWith('.example')),'Git não rastreia arquivos de ambiente privados');
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
const files=[...tracked.filter(p=>existsSync(p)&&/\.(?:ts|tsx|js|mjs|json|md|html|sql|yml|yaml)$/.test(p)),...(existsSync('dist')?walk('dist'):[])];
const leaks=files.filter(p=>{const data=readFileSync(p).toString();return secretValues.some(v=>data.includes(v));});
report(leaks.length===0,'Segredos locais ausentes dos arquivos rastreados e do build');
if(leaks.length)console.log('Arquivos a revisar: '+leaks.join(', '));
report(existsSync('dist/index.html'),'Build de frontend existente',strict);
console.log('Este diagnóstico não valida painéis externos, rotação de chaves, pagamento real nem configuração de CAPTCHA no provedor. Nenhum segredo foi exibido.');
process.exitCode=failed?1:0;
