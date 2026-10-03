import { createClient } from '@supabase/supabase-js';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const url=process.env.SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key){console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.');process.exit(1);}
const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const rl=createInterface({input,output});
const ask=async(label,envName)=>process.env[envName]||await rl.question(label);

const ownerEmail=process.env.SEED_OWNER_EMAIL||'2008kauapedro@gmail.com';
const barberEmail=process.env.SEED_BARBER_EMAIL||'barbeiro.fio@example.com';
const clientEmail=process.env.SEED_CLIENT_EMAIL||'cliente.fio@example.com';
const ownerPassword=await ask(`Senha para ${ownerEmail}: `,'SEED_OWNER_PASSWORD');
const barberPassword=await ask(`Senha para ${barberEmail}: `,'SEED_BARBER_PASSWORD');
const clientPassword=await ask(`Senha para ${clientEmail}: `,'SEED_CLIENT_PASSWORD');
rl.close();

async function ensureUser(email,password,name){
 const listed=await admin.auth.admin.listUsers({page:1,perPage:1000});
 if(listed.error)throw listed.error;
 let user=listed.data.users.find(u=>u.email?.toLowerCase()===email.toLowerCase());
 if(!user){
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:name}});
  if(created.error)throw created.error;user=created.data.user;
 }else{
  const updated=await admin.auth.admin.updateUserById(user.id,{password,email_confirm:true,user_metadata:{...user.user_metadata,display_name:name}});
  if(updated.error)throw updated.error;user=updated.data.user;
 }
 return user;
}

const owner=await ensureUser(ownerEmail,ownerPassword,'Pedro Kauã');
const barber=await ensureUser(barberEmail,barberPassword,'Barbeiro FIO');
const client=await ensureUser(clientEmail,clientPassword,'Cliente FIO');
let shop=(await admin.from('barbershops').select('*').eq('slug','fio-teste').maybeSingle()).data;
if(!shop){
 const created=await admin.from('barbershops').insert({name:'Barbearia FIO Teste',slug:'fio-teste',timezone:'America/Sao_Paulo',public_title:'Barbearia FIO Teste',public_description:'Ambiente de testes do FIO.',accent_color:'#f2c94c'}).select().single();
 if(created.error)throw created.error;shop=created.data;
}
for(const m of [
 {user:owner,role:'OWNER',name:'Pedro Kauã',phone:'61999999999'},
 {user:barber,role:'BARBER',name:'Barbeiro FIO',phone:'61988888888'},
]){
 const r=await admin.from('memberships').upsert({barbershop_id:shop.id,user_id:m.user.id,role:m.role,display_name:m.name,phone:m.phone,active:true},{onConflict:'barbershop_id,user_id'});
 if(r.error)throw r.error;
}
let customer=(await admin.from('customers').select('*').eq('barbershop_id',shop.id).eq('user_id',client.id).maybeSingle()).data;
if(!customer){const r=await admin.from('customers').insert({barbershop_id:shop.id,user_id:client.id,name:'Cliente FIO',phone:'61977777777'}).select().single();if(r.error)throw r.error;customer=r.data;}
const cm=await admin.from('memberships').upsert({barbershop_id:shop.id,user_id:client.id,role:'CLIENT',display_name:'Cliente FIO',phone:'61977777777',active:true},{onConflict:'barbershop_id,user_id'});if(cm.error)throw cm.error;
console.log('\nAcessos criados/atualizados:');
console.log(`Dono:       ${ownerEmail}  -> /acesso/gestao`);
console.log(`Funcionário:${barberEmail} -> /acesso/equipe`);
console.log(`Cliente:    ${clientEmail}  -> /b/${shop.slug}`);
console.log('As senhas foram aplicadas no Supabase Auth e não foram gravadas em tabelas do FIO.');
