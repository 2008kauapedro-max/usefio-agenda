import { PGlite } from '@electric-sql/pglite';
import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { readFileSync,readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const uid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let db:PGlite,shop:string,shop2:string,service:string,customer:string,otherCustomer:string,booked:string;
async function asUser(n:number){await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${uid(n)}',false);`);}
async function admin(){await db.exec('reset role');}
async function scalar<T=string>(sql:string,args:unknown[]=[]):Promise<T>{const r=await db.query<Record<string,T>>(sql,args);return Object.values(r.rows[0])[0];}
async function rpcError(sql:string,args:unknown[],message:string){await expect(db.query(sql,args)).rejects.toThrow(message);}
let future:string;
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create schema auth; create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema public,auth to authenticated,anon,service_role; grant execute on function auth.uid() to authenticated,anon,service_role;`);
 for(const file of readdirSync(resolve('supabase/migrations')).sort())await db.exec(readFileSync(resolve('supabase/migrations',file),'utf8'));
 await db.query('insert into auth.users select unnest($1::uuid[])',[[1,2,3,4,5,6].map(uid)]);
 await asUser(1);shop=await scalar('select public.create_barbershop($1,$2,$3)',['Studio A','studio-a','Owner A']);
 await asUser(2);shop2=await scalar('select public.create_barbershop($1,$2,$3)',['Studio B','studio-b','Owner B']);
 await asUser(1);const invite=await scalar('select public.create_invitation($1,$2)',[shop,'BARBER']);
 await asUser(3);await db.query('select public.accept_invitation($1,$2)',[invite,'Barber A']);
 await asUser(4);await db.query('select public.join_barbershop($1,$2)',['studio-a','Client A']);
 await asUser(5);await db.query('select public.join_barbershop($1,$2)',['studio-a','Client Other']);
 await asUser(1);customer=await scalar('select id from public.customers where user_id=$1',[uid(4)]);otherCustomer=await scalar('select id from public.customers where user_id=$1',[uid(5)]);
 service=await scalar('insert into public.services(barbershop_id,name,duration_minutes,price_cents) values($1,$2,45,6500) returning id',[shop,'Corte']);
 const d=new Date(Date.now()+3*86400000);while(d.getUTCDay()===0)d.setUTCDate(d.getUTCDate()+1);d.setUTCHours(15,0,0,0);future=d.toISOString();
},60000);
afterAll(async()=>{await db?.close();});
describe('migrations reais: isolamento multi-tenant e privilégios',()=>{
 it('OWNER não lê outra barbearia e não pode se promover para PRO',async()=>{await asUser(1);expect(await scalar<number>('select count(*)::int from public.barbershops')).toBe(1);await rpcError("update public.saas_subscriptions set plan='PRO' where barbershop_id=$1",[shop],'permission denied');expect(await scalar<number>('select count(*)::int from public.services where barbershop_id=$1',[shop2])).toBe(0);});
 it('CLIENT não altera roles ou cria serviços',async()=>{await asUser(4);await rpcError("update public.memberships set role='OWNER'",[],'permission denied');await rpcError("insert into public.services(barbershop_id,name,duration_minutes,price_cents) values($1,'Fraude',30,1)",[shop],'row-level security');});
 it('CLIENT vê apenas seu cadastro e não vê assinaturas de terceiros',async()=>{await admin();await db.query("update public.saas_subscriptions set plan='PRO' where barbershop_id=$1",[shop]);await asUser(1);await db.query('select public.issue_subscription($1,$2,$3,4,$4)',[shop,otherCustomer,'Plano privado',new Date(Date.now()+30*86400000).toISOString()]);await asUser(4);expect(await scalar<number>('select count(*)::int from public.customers')).toBe(1);expect(await scalar<number>('select count(*)::int from public.client_subscriptions')).toBe(0);await admin();await db.query("update public.saas_subscriptions set plan='FREE' where barbershop_id=$1",[shop]);});
 it('BARBER não vê finanças, assinaturas ou configurações administrativas',async()=>{await asUser(3);await rpcError('select count(*) from public.payments',[],'permission denied');expect(await scalar<number>('select count(*)::int from public.client_subscriptions')).toBe(0);await rpcError('select public.weekly_revenue($1)',[shop],'does not exist');await rpcError("select public.create_invitation($1,'OWNER')",[shop],'FORBIDDEN');});
 it('OWNER não cria convite com papel OWNER; convite é de uso único',async()=>{await asUser(1);await rpcError("select public.create_invitation($1,'OWNER')",[shop],'check constraint');await admin();await db.query("update public.saas_subscriptions set plan='PRO' where barbershop_id=$1",[shop]);await asUser(1);const token=await scalar("select public.create_invitation($1,'BARBER')",[shop]);await asUser(6);await db.query('select public.accept_invitation($1,$2)',[token,'Barber Six']);await rpcError('select public.accept_invitation($1,$2)',[token,'Again'],'INVALID_INVITATION');});
 it('anon não acessa dados nem executa onboarding',async()=>{await db.exec('reset role;set role anon');await rpcError('select * from public.customers',[],'permission denied');await rpcError("select public.create_barbershop('Test','test-x','Name')",[],'permission denied');});
 it('feed some no FREE, libera no PRO para equipe e bloqueia cliente/cross-tenant',async()=>{await admin();await db.query("update public.saas_subscriptions set plan='FREE' where barbershop_id=$1",[shop]);await asUser(3);await rpcError("insert into public.feed_posts(barbershop_id,author_id,author_name,caption,image_path) values($1,$2,'Barber A','Corte novo',$3)",[shop,uid(3),`${shop}/${uid(3)}/post.jpg`],'row-level security');await admin();await db.query("update public.saas_subscriptions set plan='PRO',status='active',expires_at=now()+interval '30 days' where barbershop_id=$1",[shop]);await asUser(3);await db.query("insert into public.feed_posts(barbershop_id,author_id,author_name,caption,image_path) values($1,$2,'Barber A','Corte novo',$3)",[shop,uid(3),`${shop}/${uid(3)}/post.jpg`]);expect(await scalar<number>('select count(*)::int from public.feed_posts')).toBe(1);await asUser(4);await rpcError("insert into public.feed_posts(barbershop_id,author_id,author_name,caption,image_path) values($1,$2,'Client A','Fraude',$3)",[shop,uid(4),`${shop}/${uid(4)}/fraud.jpg`],'row-level security');await asUser(2);expect(await scalar<number>('select count(*)::int from public.feed_posts')).toBe(0);});
 it('perfil permite avatar apenas no próprio diretório',async()=>{await asUser(4);const path=`${shop}/${uid(4)}/avatar.webp`;await db.query('select public.update_own_avatar($1,$2,$3)',[shop,'https://example.com/avatar.webp',path]);expect(await scalar('select avatar_asset_path from public.memberships where barbershop_id=$1 and user_id=$2',[shop,uid(4)])).toBe(path);await rpcError('select public.update_own_avatar($1,$2,$3)',[shop,'https://example.com/avatar.webp',`${shop}/${uid(3)}/avatar.webp`],'INVALID_DATA');});
});
describe('agendamento transacional',()=>{
 it('calcula duração e preço no banco, com IDs vinculados ao tenant',async()=>{await asUser(4);booked=await scalar('select public.book_appointment($1,$2,$3,$4,$5)',[shop,customer,uid(3),service,future]);const result=await db.query<{price_cents:number;minutes:number}>('select price_cents,extract(epoch from ends_at-starts_at)/60 as minutes from public.appointments where id=$1',[booked]);expect(result.rows[0].price_cents).toBe(6500);expect(Number(result.rows[0].minutes)).toBe(45);});
 it('nega agendamento em nome de outro cliente e acesso cross-tenant',async()=>{await asUser(4);await rpcError('select public.book_appointment($1,$2,$3,$4,$5)',[shop,otherCustomer,uid(3),service,future],'FORBIDDEN');await rpcError('select public.book_appointment($1,$2,$3,$4,$5)',[shop2,customer,uid(3),service,future],'FORBIDDEN');});
 it('bloqueia sobreposição e escrita direta que ignora a validação',async()=>{await asUser(4);await rpcError('select public.book_appointment($1,$2,$3,$4,$5)',[shop,customer,uid(3),service,new Date(+new Date(future)+15*60000).toISOString()],'SLOT_UNAVAILABLE');await rpcError("update public.appointments set price_cents=1",[],'permission denied');});
 it('slots não retornam nomes ou dados pessoais e omitem horário ocupado',async()=>{await asUser(5);const r=await db.query<{starts_at:string}>('select * from public.available_slots($1,$2,$3,$4)',[shop,uid(3),service,future.slice(0,10)]);expect(r.rows.length).toBeGreaterThan(0);expect(Object.keys(r.rows[0])).toEqual(['starts_at']);expect(r.rows.some(s=>+new Date(s.starts_at)===+new Date(future))).toBe(false);expect(await scalar<number>('select count(*)::int from public.appointments')).toBe(0);});
 it('barbeiro diferente não consegue cancelar; cliente não consegue concluir',async()=>{await asUser(6);await rpcError("select public.transition_appointment($1,$2,'cancelled')",[shop,booked],'FORBIDDEN');await asUser(4);await rpcError("select public.transition_appointment($1,$2,'completed')",[shop,booked],'FORBIDDEN');});
 it('cancelamento válido é auditado e não pode se repetir',async()=>{await asUser(4);await db.query("select public.transition_appointment($1,$2,'cancelled')",[shop,booked]);await rpcError("select public.transition_appointment($1,$2,'cancelled')",[shop,booked],'INVALID_TRANSITION');await asUser(1);expect(await scalar<number>("select count(*)::int from public.audit_events where target_id=$1 and action='appointment.cancelled'",[booked])).toBe(1);});
 it('FK composta impede referências a serviço de outro tenant',async()=>{await admin();await rpcError("insert into public.appointments(barbershop_id,client_id,barber_id,service_id,starts_at,ends_at,price_cents,created_by) values($1,$2,$3,$4,now(),now()+interval '1 hour',1,$5)",[shop2,customer,uid(3),service,uid(1)],'foreign key constraint');});
 it('concluir desconta apenas um corte da assinatura e impede cobrança avulsa',async()=>{await asUser(1);const subscription=await scalar('select public.issue_subscription($1,$2,$3,4,$4)',[shop,customer,'Essencial',new Date(Date.now()+30*86400000).toISOString()]);await admin();const past=await scalar("insert into public.appointments(barbershop_id,client_id,barber_id,service_id,starts_at,ends_at,price_cents,created_by,status,subscription_id,payment_method) values($1,$2,$3,$4,now()-interval '2 hours',now()-interval '1 hour',6500,$5,'in_service',$6,'subscription') returning id",[shop,customer,uid(3),service,uid(1),subscription]);await asUser(3);await db.query("select public.transition_appointment($1,$2,'completed')",[shop,past]);await rpcError("select public.transition_appointment($1,$2,'completed')",[shop,past],'INVALID_TRANSITION');await asUser(1);expect(await scalar<number>('select remaining_cuts from public.client_subscriptions where id=$1',[subscription])).toBe(3);expect(await scalar<number>('select count(*)::int from public.subscription_usage where appointment_id=$1',[past])).toBe(1);await rpcError('select public.record_payment($1,$2)',[shop,past],'does not exist');await rpcError('select public.weekly_revenue($1)',[shop],'does not exist');});
});
describe('IA: plano, quota durável e conversas privadas',()=>{
 it('FREE nega IA no banco; tenant externo também é negado',async()=>{await admin();await db.query("update public.saas_subscriptions set plan='FREE',status='active',expires_at=null where barbershop_id=$1",[shop]);await asUser(4);await rpcError('select public.consume_assistant_quota($1)',[shop],'PLAN_REQUIRED');await rpcError('select public.consume_assistant_quota($1)',[shop2],'FORBIDDEN');});
 it('quota é por usuário, atômica e não pode ser zerada pelo cliente',async()=>{await admin();await db.query("update public.saas_subscriptions set plan='PRO' where barbershop_id=$1",[shop]);await db.exec("update public.plan_features set ai_daily_limit=3,ai_per_minute=2 where plan='PRO'");await asUser(4);await db.query('select public.consume_assistant_quota($1)',[shop]);await db.query('select public.consume_assistant_quota($1)',[shop]);await rpcError('select public.consume_assistant_quota($1)',[shop],'RATE_LIMIT');await rpcError('delete from public.assistant_usage',[],'permission denied');await admin();await db.exec("update public.assistant_usage set minute_start=now()-interval '2 minutes'");await asUser(4);await db.query('select public.consume_assistant_quota($1)',[shop]);await rpcError('select public.consume_assistant_quota($1)',[shop],'DAILY_LIMIT');});
 it('usuário não lê conversa alheia nem falsifica mensagens de IA',async()=>{await asUser(4);const conversation=await scalar('insert into public.assistant_conversations(barbershop_id,user_id,title) values($1,$2,$3) returning id',[shop,uid(4),'Privada']);await rpcError("insert into public.assistant_messages(barbershop_id,user_id,conversation_id,role,content) values($1,$2,$3,'assistant','Fake')",[shop,uid(4),conversation],'permission denied');await asUser(1);expect(await scalar<number>('select count(*)::int from public.assistant_conversations')).toBe(0);await asUser(5);expect(await scalar<number>('select count(*)::int from public.assistant_conversations')).toBe(0);});
 it('usuário desativado perde acesso ao tenant e à IA',async()=>{await admin();await db.query('update public.memberships set active=false where barbershop_id=$1 and user_id=$2',[shop,uid(4)]);await asUser(4);expect(await scalar<number>('select count(*)::int from public.appointments')).toBe(0);expect(await scalar<number>('select count(*)::int from public.assistant_conversations')).toBe(0);await rpcError('select public.consume_assistant_quota($1)',[shop],'FORBIDDEN');});
 it('mudança de papel bloqueia conversa e mensagens do escopo anterior',async()=>{
  await asUser(1);
  const conversation=await scalar("insert into public.assistant_conversations(barbershop_id,user_id,title) values($1,$2,'Financeiro privado') returning id",[shop,uid(1)]);
  expect(await scalar('select scope_role from public.assistant_conversations where id=$1',[conversation])).toBe('OWNER');
  await admin();await db.query("insert into public.assistant_messages(barbershop_id,user_id,conversation_id,role,content) values($1,$2,$3,'assistant','Faturamento administrativo')",[shop,uid(1),conversation]);
  await db.query("update public.memberships set role='BARBER' where barbershop_id=$1 and user_id=$2",[shop,uid(1)]);
  await asUser(1);expect(await scalar<number>('select count(*)::int from public.assistant_conversations where id=$1',[conversation])).toBe(0);expect(await scalar<number>('select count(*)::int from public.assistant_messages where conversation_id=$1',[conversation])).toBe(0);
  await rpcError("update public.assistant_conversations set scope_role='BARBER' where id=$1",[conversation],'permission denied');
  await admin();await db.query("update public.memberships set role='OWNER' where barbershop_id=$1 and user_id=$2",[shop,uid(1)]);
 });
 it('todas as tabelas públicas têm RLS e funções não são executáveis por anon',async()=>{
  await admin();
  const tables=await db.query<{relname:string;relrowsecurity:boolean}>("select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'");
  expect(tables.rows.length).toBeGreaterThan(0);
  expect(tables.rows.filter(t=>!t.relrowsecurity).map(t=>t.relname)).toEqual([]);
  const functions=await db.query<{proname:string}>("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('anon',p.oid,'EXECUTE')");
  expect(functions.rows).toHaveLength(0);
 });
});

describe('retirada do financeiro',()=>{
 it('nem o responsável pode consultar ou registrar recebimentos de cortes',async()=>{
  await asUser(1);
  await rpcError('select * from public.payments',[],'permission denied');
  await rpcError('select public.record_payment($1,$2)',[shop,booked],'does not exist');
  await admin();
  for(const role of ['anon','authenticated','service_role']){
   expect(await scalar<boolean>("select has_table_privilege($1,'public.payments','SELECT')",[role])).toBe(false);
   expect(await scalar<boolean>("select has_table_privilege($1,'public.payments','INSERT')",[role])).toBe(false);
  }
 });
});
