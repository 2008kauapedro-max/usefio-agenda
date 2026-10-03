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

describe('agendamento e push: migração nova',()=>{
 it('atribui sem preferência, respeita carga e impede reserva repetida',async()=>{
  await admin();await db.query("update public.saas_subscriptions set plan='PRO' where barbershop_id=$1",[shop]);
  await asUser(1);const invite=await scalar('select public.create_invitation($1,$2)',[shop,'BARBER']);await asUser(6);await db.query('select public.accept_invitation($1,$2)',[invite,'Barber B']);
  await asUser(1);booked=await scalar('select public.book_appointment($1,$2,null,$3,$4)',[shop,customer,service,future]);
  expect(await scalar('select barber_id from public.appointments where id=$1',[booked])).toBe(uid(3));
  const second=await scalar('select public.book_appointment($1,$2,null,$3,$4)',[shop,otherCustomer,service,future]);
  expect(await scalar('select barber_id from public.appointments where id=$1',[second])).toBe(uid(6));
  await rpcError('select public.book_appointment($1,$2,null,$3,$4)',[shop,customer,service,future],'SLOT_UNAVAILABLE');
  const later=new Date(Date.parse(future)+3600000).toISOString();
  const results=await Promise.allSettled([db.query('select public.book_appointment($1,$2,$3,$4,$5)',[shop,customer,uid(3),service,later]),db.query('select public.book_appointment($1,$2,$3,$4,$5)',[shop,otherCustomer,uid(3),service,later])]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  // PGlite queues these commands on one connection; independent-connection test is separate.
 });
 it('remarca com duração real, preserva identidade e nega outro cliente',async()=>{
  const next=new Date(Date.parse(future)+3*3600000).toISOString();await asUser(5);await rpcError('select public.reschedule_appointment($1,$2,$3)',[shop,booked,next],'FORBIDDEN');
  await asUser(4);await db.query('select public.reschedule_appointment($1,$2,$3)',[shop,booked,next]);
  expect(await scalar<number>('select extract(epoch from ends_at-starts_at)::int/60 from public.appointments where id=$1',[booked])).toBe(45);
  await rpcError('select public.reschedule_appointment($1,$2,now()-interval \'1 minute\')',[shop,booked],'INVALID_TIME');
  await db.query("select public.transition_appointment($1,$2,'cancelled')",[shop,booked]);
  await rpcError('select public.reschedule_appointment($1,$2,$3)',[shop,booked,next],'INVALID_TRANSITION');
 });
 it('filtra serviço, pausa, bloqueio e fuso de São Paulo',async()=>{
  await asUser(1);const day=future.slice(0,10),weekday=new Date(future).getUTCDay();
  await db.query('select public.configure_staff_schedule($1,$2,$3::jsonb,$4::uuid[])',[shop,uid(3),JSON.stringify([{weekday,opens_at:'09:00',closes_at:'11:00'},{weekday,opens_at:'14:00',closes_at:'18:00'}]),[]]);
  let slots=(await db.query<{starts_at:string}>('select * from public.available_slots($1,$2,$3,$4)',[shop,uid(3),service,day])).rows;
  expect(slots.some(s=>new Date(s.starts_at).getUTCHours()===15)).toBe(false); // noon local is a break
  const blocked=slots[0].starts_at;await db.query('select public.add_staff_block($1,$2,$3,$4)',[shop,uid(3),blocked,new Date(Date.parse(blocked)+3600000).toISOString()]);
  slots=(await db.query<{starts_at:string}>('select * from public.available_slots($1,$2,$3,$4)',[shop,uid(3),service,day])).rows;expect(slots.some(s=>Date.parse(s.starts_at)===Date.parse(blocked))).toBe(false);
  await db.query('select public.configure_staff_schedule($1,$2,$3::jsonb,$4::uuid[])',[shop,uid(3),'[]',[service]]);
  expect((await db.query('select * from public.available_slots($1,$2,$3,$4)',[shop,uid(3),service,day])).rows).toHaveLength(0);
  await asUser(4);await rpcError('select public.configure_staff_schedule($1,$2,$3::jsonb,$4::uuid[])',[shop,uid(3),'[]',[]],'FORBIDDEN');
 });
 it('período respeita RLS e não conclui horários por terem passado',async()=>{
  await asUser(4);const result=await scalar<{total:number;completed:number;cancelled:number;items:{client_id:string}[]}>('select public.appointment_period($1,$2,$3)',[shop,future.slice(0,10),future.slice(0,10)]);
  expect(result.total).toBe(2);expect(result.completed).toBe(0);expect(result.cancelled).toBe(1);expect(result.items.every(a=>a.client_id===customer)).toBe(true);
  await rpcError('select public.appointment_period($1,$2,$3)',[shop2,future.slice(0,10),future.slice(0,10)],'FORBIDDEN');
 });
 it('duração de 90 minutos não cabe onde um serviço de 45 minutos cabe',async()=>{
  await asUser(1);const long=await scalar("insert into public.services(barbershop_id,name,duration_minutes,price_cents) values($1,'Serviço longo',90,10000) returning id",[shop]);
  const shortSlots=(await db.query<{starts_at:string}>('select * from public.available_slots($1,$2,$3,$4)',[shop,uid(6),service,future.slice(0,10)])).rows;
  const longSlots=(await db.query<{starts_at:string}>('select * from public.available_slots($1,$2,$3,$4)',[shop,uid(6),long,future.slice(0,10)])).rows;
  const last=shortSlots.at(-1)!.starts_at;expect(longSlots.some(s=>Date.parse(s.starts_at)===Date.parse(last))).toBe(false);
  await rpcError('select public.book_appointment($1,$2,$3,$4,$5)',[shop,customer,uid(6),long,last],'SLOT_UNAVAILABLE');
 });
 it('outbox envia somente destinatários corretos, deduplica e desativa endpoint expirado',async()=>{
  await asUser(4);await rpcError('select public.claim_appointment_push()',[],'permission denied');
  const keys={p256dh:'a'.repeat(87),auth:'a'.repeat(22)},endpoint='https://fcm.googleapis.com/test-client';
  await db.query('select public.register_appointment_push($1,$2,$3,true,true)',[shop,endpoint,keys]);
  expect(await scalar<number>('select count(*)::int from public.appointment_push_devices')).toBe(1);
  await asUser(5);expect(await scalar<number>('select count(*)::int from public.appointment_push_devices')).toBe(0);
  await admin();await db.exec('set role service_role');
  const deliveries=await scalar<{queueId:string;deviceId:string;endpoint:string;url:string}[]>('select public.claim_appointment_push()');
  expect(deliveries.length).toBeGreaterThan(0);expect(deliveries.every(d=>d.endpoint===endpoint&&d.url.startsWith('/client/agenda?'))).toBe(true);
  expect(await scalar('select public.claim_appointment_push()')).toEqual([]);
  for(const d of deliveries)await db.query("select public.finish_appointment_push($1,$2,'expired')",[d.queueId,d.deviceId]);
  await asUser(4);expect(await scalar<boolean>('select enabled from public.appointment_push_devices')).toBe(false);
  await admin();expect(await scalar<number>('select count(*)::int from fio_private.appointment_push_queue where appointment_id=$1 and user_id=$2',[booked,uid(6)])).toBe(0);
 });
});
