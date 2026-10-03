// Read-only checks: never creates a user, booking, charge or webhook event.
const base=new URL(process.argv[2]||'http://127.0.0.1:3001');
if(!['http:','https:'].includes(base.protocol)||base.username||base.password)throw Error('Use uma URL HTTP(S) sem credenciais.');
const cases=[['/api/health',200],['/api/memberships',401],['/api/platform/me',401]];
let fail=false;
for(const [path,status] of cases){try{const r=await fetch(new URL(path,base),{signal:AbortSignal.timeout(15000),redirect:'error'});const b=await r.json();const ok=r.status===status&&(status!==200||b.status==='ok');console.log(`${ok?'OK':'FALHA'} ${path}: ${r.status}, esperado ${status}`);if(!ok)fail=true;}catch{console.log(`FALHA ${path}: resposta ausente ou inválida`);fail=true;}}
process.exitCode=fail?1:0;
