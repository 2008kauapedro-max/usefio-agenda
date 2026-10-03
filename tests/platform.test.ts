import { PGlite } from '@electric-sql/pglite';
import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { readFileSync,readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createApp } from '../server/app';
import { platformPlanUpdate,platformShopUpdate } from '../shared/platform';
const uid=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let db:PGlite,shop:string,other:string,pro:string,free:string;
async function asUser(n:number){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${uid(n)}',false);`);}
async function scalar<T=string>(sql:string,args:unknown[]=[]):Promise<T>{const r=await db.query<Record<string,T>>(sql,args);return Object.values(r.rows[0])[0];}
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create schema auth;create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;`);
 const migrations=readdirSync(resolve('supabase/migrations')).sort();
 const platformMigration=migrations.find(f=>f.endsWith('_platform_admin.sql'))!;
 for(const f of migrations.filter(f=>f<platformMigration))await db.exec(readFileSync(resolve('supabase/migrations',f),'utf8'));
 await db.query('insert into auth.users select unnest($1::uuid[])',[[1,2,3,4,5,6,99].map(uid)]);
 await asUser(1);shop=await scalar("select public.create_barbershop('Shop A','platform-a','Owner A')");
 await asUser(2);other=await scalar("select public.create_barbershop('Shop B','platform-b','Owner B')");
 await asUser(1);const invitation=await scalar("select public.create_invitation($1,'BARBER')",[shop]);
 await asUser(3);await db.query("select public.accept_invitation($1,'Barber A')",[invitation]);
 await asUser(4);await db.query("select public.join_barbershop('platform-a','Client A')");
 await db.exec('reset role');
 await db.exec(readFileSync(resolve('supabase/migrations',migrations.find(f=>f.endsWith('_platform_admin.sql'))!),'utf8'));
 for(const f of migrations.filter(f=>f>platformMigration))await db.exec(readFileSync(resolve('supabase/migrations',f),'utf8'));
 await db.query("insert into public.platform_admins(user_id,display_name) values($1,'Platform Operator')",[uid(99)]);
 await asUser(99);pro=await scalar("select id from public.saas_plans where code='PRO'");free=await scalar("select id from public.saas_plans where code='FREE'");
},60000);
afterAll(async()=>{await db?.close();});
const update=(status='active',plan=pro,confirmed=true)=>db.query("select public.platform_update_shop($1,'Shop A',$2,$3,'active',null,$4)",[shop,status,plan,confirmed]);
describe('platform migration: roles globais, atualização e isolamento',()=>{
 it('migra dados existentes sem inventar início ou preço pago',async()=>{await asUser(99);expect(await scalar<number>('select count(*)::int from public.saas_subscriptions where plan_id is not null')).toBe(2);expect(await scalar<number>('select count(*)::int from public.saas_subscriptions where starts_at is not null')).toBe(0);expect(await scalar<number>("select count(*)::int from public.saas_plans where code<>'FREE' and price_cents is null")).toBe(1);expect(await scalar('select actor_role from public.audit_events limit 1')).toBe('UNKNOWN');});
 it('PLATFORM_ADMIN lê tenants sem membership e não vira OWNER',async()=>{await asUser(99);expect(await scalar<boolean>('select fio_private.is_platform_admin()')).toBe(true);expect(await scalar<number>('select count(*)::int from public.barbershops')).toBe(2);expect(await scalar<number>('select count(*)::int from public.platform_shop_directory')).toBe(2);expect(await scalar<number>('select count(*)::int from public.memberships where user_id=$1',[uid(99)])).toBe(0);expect(await scalar('select public.member_role($1)',[shop])).toBe(null);});
 it.each([1,3,4])('papel tenant %s não ganha leitura global nem pode se promover',async n=>{await asUser(n);expect(await scalar<boolean>('select fio_private.is_platform_admin()')).toBe(false);expect(await scalar<number>('select count(*)::int from public.barbershops where id=$1',[other])).toBe(0);expect(await scalar<number>('select count(*)::int from public.platform_shop_directory')).toBe(0);await expect(update()).rejects.toThrow('FORBIDDEN');await expect(db.query("insert into public.platform_admins(user_id,display_name) values($1,'Fraude')",[uid(n)])).rejects.toThrow('permission denied');});
 it('recusa alteração sem confirmação e não registra sucesso',async()=>{await asUser(99);const before=await scalar<number>('select count(*)::int from public.audit_events');await expect(update('active',pro,false)).rejects.toThrow('CONFIRMATION_REQUIRED');expect(await scalar<number>('select count(*)::int from public.audit_events')).toBe(before);});
 it('troca plano atomicamente com compatibilidade do core e audit de identidade',async()=>{await asUser(99);await update();expect(await scalar('select plan from public.saas_subscriptions where barbershop_id=$1',[shop])).toBe('PRO');expect(await scalar('select plan_id from public.saas_subscriptions where barbershop_id=$1',[shop])).toBe(pro);const r=await db.query<{actor_role:string;actor_user_id:string;metadata:object}>("select actor_role,actor_user_id,metadata from public.audit_events where event_type='platform.shop.updated'");expect(r.rows[0].actor_role).toBe('PLATFORM_ADMIN');expect(r.rows[0].actor_user_id).toBe(uid(99));expect(JSON.stringify(r.rows[0].metadata)).not.toMatch(/password|token|api_key|secret/i);});
 it('suspender bloqueia operação e novos vínculos; reativar restaura',async()=>{await asUser(99);await update('suspended');await asUser(1);expect(await scalar('select public.member_role($1)',[shop])).toBe(null);expect(await scalar<number>('select count(*)::int from public.barbershops')).toBe(0);await expect(db.query("insert into public.services(barbershop_id,name,duration_minutes,price_cents) values($1,'Corte',30,1000)",[shop])).rejects.toThrow('row-level security');await asUser(5);await expect(db.query("select public.join_barbershop('platform-a','New Client')")).rejects.toThrow('FORBIDDEN');await asUser(99);expect(await scalar<number>('select count(*)::int from public.barbershops')).toBe(2);await update('active');await asUser(1);expect(await scalar('select public.member_role($1)',[shop])).toBe('OWNER');});
 it('planos inativos não são atribuídos e falhas revertem a alteração',async()=>{await asUser(99);await db.query("select public.platform_update_plan($1,'FIO FREE',0,false,true)",[free]);await expect(update('suspended',free)).rejects.toThrow('INVALID_DATA');expect(await scalar('select platform_status from public.barbershops where id=$1',[shop])).toBe('active');await db.query("select public.platform_update_plan($1,'FIO FREE',0,true,true)",[free]);expect(await scalar<number>("select count(*)::int from public.audit_events where event_type='platform.plan.updated' and barbershop_id is null")).toBe(2);});
 it('CRUD OWNER tem papel e usuário registrados e não aceita falsificação do audit',async()=>{await asUser(1);const id=await scalar("insert into public.services(barbershop_id,name,duration_minutes,price_cents) values($1,'Corte',30,1000) returning id",[shop]);expect(await scalar("select actor_role from public.audit_events where target_id=$1",[id])).toBe('OWNER');await expect(db.query("update public.audit_events set actor_role='PLATFORM_ADMIN'")).rejects.toThrow('permission denied');});
 it('criação de funcionário registra o OWNER, sem acesso direto à RPC privilegiada',async()=>{await asUser(1);await expect(db.query("select public.platform_attach_provisioned_staff($1,$2,'Staff Six','11999999999',$3)",[shop,uid(6),uid(1)])).rejects.toThrow('permission denied');await db.exec('reset role;set role service_role');await db.query("select public.platform_attach_provisioned_staff($1,$2,'Staff Six','11999999999',$3)",[shop,uid(6),uid(1)]);await asUser(99);const r=await db.query<{actor_user_id:string;actor_role:string}>("select actor_user_id,actor_role from public.audit_events where target_id=$1 and event_type='memberships.insert'",[uid(6)]);expect(r.rows[0]).toEqual({actor_user_id:uid(1),actor_role:'OWNER'});});
 it('revogação global entra em vigor sem trocar JWT',async()=>{await db.exec('reset role');await db.query('update public.platform_admins set active=false where user_id=$1',[uid(99)]);await asUser(99);expect(await scalar<boolean>('select fio_private.is_platform_admin()')).toBe(false);expect(await scalar<number>('select count(*)::int from public.barbershops')).toBe(0);await expect(update()).rejects.toThrow('FORBIDDEN');await db.exec('reset role');await db.query('update public.platform_admins set active=true where user_id=$1',[uid(99)]);});
 it('anon não executa funções globais; admin não lê conversas nem convites privados',async()=>{await db.exec('reset role;set role anon');await expect(db.query('select * from public.platform_admins')).rejects.toThrow('permission denied');await expect(update()).rejects.toThrow('permission denied');await asUser(99);expect(await scalar<number>('select count(*)::int from public.invitations')).toBe(0);expect(await scalar<number>('select count(*)::int from public.assistant_conversations')).toBe(0);});
 it('consulta de atores é global apenas para admin e respeita RLS da view',async()=>{await asUser(99);expect(await scalar<number>('select count(*)::int from public.platform_actor_directory')).toBeGreaterThan(3);await asUser(1);expect(await scalar<number>('select count(*)::int from public.platform_actor_directory')).toBe(0);});
 it('ações de BARBER e CLIENT preservam identidade e descrição no audit',async()=>{
  await db.exec('reset role');
  const service=await scalar('select id from public.services where barbershop_id=$1 limit 1',[shop]);
  const customer=await scalar('select id from public.customers where user_id=$1',[uid(4)]);
  const insert="insert into public.appointments(barbershop_id,client_id,barber_id,service_id,starts_at,ends_at,price_cents,created_by,status) values($1,$2,$3,$4,$5::timestamptz,$5::timestamptz+interval '30 minutes',1000,$6,$7) returning id";
  const past=await scalar(insert,[shop,customer,uid(3),service,new Date(Date.now()-7200000).toISOString(),uid(1),'in_service']);
  const future=await scalar(insert,[shop,customer,uid(3),service,new Date(Date.now()+86400000).toISOString(),uid(1),'scheduled']);
  await asUser(3);await db.query("select public.transition_appointment($1,$2,'completed')",[shop,past]);
  await asUser(4);await db.query("select public.transition_appointment($1,$2,'cancelled')",[shop,future]);
  await asUser(99);
  expect(await scalar('select actor_role from public.audit_events where target_id=$1',[past])).toBe('BARBER');
  expect(await scalar('select actor_role from public.audit_events where target_id=$1',[future])).toBe('CLIENT');
  expect(await scalar('select description from public.audit_events where target_id=$1',[past])).toBe('Atendimento concluído');
 });
});

function fakeApp(admin:boolean){
 const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:admin?{user_id:uid(99),display_name:'Operator'}:null,error:null})};
 return createApp(async()=>({userId:uid(99),db:{from:()=>chain} as unknown as SupabaseClient}));
}
describe('API PLATFORM_ADMIN',()=>{
 it('anon recebe 401 sem passar pelo middleware tenant',async()=>{expect((await request(createApp()).get('/api/platform/me')).status).toBe(401);expect((await request(createApp()).patch(`/api/platform/shops/${uid(1)}`).send({})).status).toBe(401);});
 it.each(['OWNER','BARBER','CLIENT'])('%s recebe 403 em todas as rotas da plataforma',async()=>{const app=fakeApp(false);for(const p of ['/me','/overview','/shops','/plans','/subscriptions','/activity'])expect((await request(app).get('/api/platform'+p)).status).toBe(403);expect((await request(app).patch(`/api/platform/shops/${uid(1)}`).send({})).status).toBe(403);});
 it('admin autorizado não precisa de X-Barbershop-Id',async()=>{const r=await request(fakeApp(true)).get('/api/platform/me');expect(r.status).toBe(200);expect(r.body.role).toBe('PLATFORM_ADMIN');expect(r.headers['cache-control']).toContain('no-store');});
 it('inputs inválidos e confirmação ausente são 400',async()=>{const app=fakeApp(true);expect((await request(app).get('/api/platform/shops?limit=999')).status).toBe(400);expect((await request(app).get('/api/platform/activity?user=not-uuid')).status).toBe(400);expect((await request(app).patch(`/api/platform/shops/${uid(1)}`).send({})).status).toBe(400);});
 it('contratos não aceitam metadados/segredos/roles injetados',()=>{expect(platformShopUpdate.safeParse({name:'Shop',status:'active',planId:uid(1),billingStatus:'active',periodEnd:null,confirmed:true,actorRole:'PLATFORM_ADMIN'}).success).toBe(false);expect(platformPlanUpdate.safeParse({name:'Plano',priceCents:100,active:true,confirmed:true,metadata:{token:'private'}}).success).toBe(false);});
 it('rewrite da Vercel mantém API fora do SPA e manifest usa ícones existentes',()=>{const v=JSON.parse(readFileSync('vercel.json','utf8'));expect(v.rewrites).toContainEqual({source:'/platform/:path*',destination:'/index.html'});expect(v.rewrites).toContainEqual({source:'/api/:path*',destination:'/api/handler?route=:path*'});expect(v.rewrites).toContainEqual({source:'/:slug([a-z0-9-]{3,60})',destination:'/index.html'});expect(v.rewrites.some((r:{source:string;destination:string})=>r.source==='/(.*)'||(r.source.startsWith('/api')&&r.destination==='/index.html'))).toBe(false);const m=JSON.parse(readFileSync('public/manifest-platform.webmanifest','utf8'));expect(m.start_url).toBe('/acesso/plataforma');expect(m.display).toBe('standalone');for(const icon of m.icons)expect(readFileSync(resolve('public','.'+icon.src)).length).toBeGreaterThan(0);});
});
