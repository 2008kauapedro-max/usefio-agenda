// Dedicated disposable local PostgreSQL only. Never accepts a production connection string.
import pg from '../work/pg-test/node_modules/pg/lib/index.js';
import fs from 'node:fs';import assert from 'node:assert/strict';
const {Client}=pg,options={host:'127.0.0.1',port:55439,user:'fio_test',database:'fio_concurrency_test'};
const control=new Client({...options,database:'postgres'});await control.connect();await control.query('create database fio_concurrency_test');await control.end();
const admin=new Client(options),a=new Client(options),b=new Client(options);await Promise.all([admin.connect(),a.connect(),b.connect()]);
const uid=n=>`50000000-0000-4000-8000-${String(n).padStart(12,'0')}`,scalar=async(c,sql,args=[])=>Object.values((await c.query(sql,args)).rows[0])[0];
try{
 await admin.query(`create schema auth;create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;`);
 for(const file of fs.readdirSync('supabase/migrations').sort())await admin.query(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 await admin.query('insert into auth.users select unnest($1::uuid[])',[[1,2,3,4,5].map(uid)]);
 await admin.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(1)]);const shop=await scalar(admin,"select public.create_barbershop('Concurrency','concurrency-test','Owner')");
 await admin.query("update public.saas_subscriptions set plan='PRO' where barbershop_id=$1",[shop]);
 await admin.query("insert into public.memberships(barbershop_id,user_id,role,display_name,active) values($1,$2,'BARBER','Barber A',true),($1,$3,'BARBER','Barber B',true)",[shop,uid(2),uid(3)]);
 const customers=[];for(const n of [4,5]){await admin.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(n)]);await admin.query("select public.join_barbershop('concurrency-test','Test client')");customers.push(await scalar(admin,'select id from public.customers where user_id=$1',[uid(n)]));}
 const service=await scalar(admin,"insert into public.services(barbershop_id,name,duration_minutes,price_cents) values($1,'Corte',45,6500) returning id",[shop]);
 for(const c of [a,b]){await c.query('set role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(1)]);}
 const day=new Date(Date.now()+3*86400000);while(day.getUTCDay()===0)day.setUTCDate(day.getUTCDate()+1);day.setUTCHours(15,0,0,0);
 const sql='select public.book_appointment($1,$2,$3,$4,$5)',args=(client,barber,date)=>[shop,client,barber,service,date.toISOString()];
 await a.query('begin');await a.query(sql,args(customers[0],uid(2),day));
 const pending=b.query(sql,args(customers[1],uid(2),day)).then(()=>({ok:true}),e=>({ok:false,error:e.message}));
 await new Promise(r=>setTimeout(r,200));
 const lock=await scalar(admin,"select wait_event_type from pg_stat_activity where pid=$1",[b.processID]);assert.equal(lock,'Lock');await a.query('commit');assert.match((await pending).error,/SLOT_UNAVAILABLE/);
 day.setUTCHours(17);const assigned=await Promise.all([a.query(sql,args(customers[0],null,day)),b.query(sql,args(customers[1],null,day))]);
 const ids=assigned.map(r=>r.rows[0].book_appointment);const rows=(await admin.query('select barber_id from public.appointments where id=any($1::uuid[])',[ids])).rows;assert.equal(new Set(rows.map(r=>r.barber_id)).size,2);
 day.setUTCHours(19);const overlap=await Promise.allSettled([a.query(sql,args(customers[0],uid(2),day)),b.query(sql,args(customers[0],uid(3),day))]);assert.equal(overlap.filter(r=>r.status==='fulfilled').length,1);assert.match(overlap.find(r=>r.status==='rejected').reason.message,/CLIENT_ALREADY_BOOKED/);
 const report={engine:await scalar(admin,'select version()'),connections:2,tests:['Second connection waits on PostgreSQL lock and loses conflicting slot','Two automatic bookings assign different eligible professionals','Same customer cannot book overlapping times on different professionals'],passed:3};fs.writeFileSync('docs/reorganization-evidence/postgres-concurrency.json',JSON.stringify(report,null,2));console.log(report);
}finally{await Promise.all([admin.end(),a.end(),b.end()]);}
