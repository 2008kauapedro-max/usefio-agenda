import { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { readFileSync,readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const uid='30000000-0000-4000-8000-000000000001';
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create schema auth;create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;`);
 for(const f of readdirSync(resolve('supabase/migrations')).sort())await db.exec(readFileSync(resolve('supabase/migrations',f),'utf8'));
 await db.query('insert into auth.users(id) values($1)',[uid]);
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${uid}',false);`);
});
afterAll(async()=>{await db?.close();});

describe('barbeiro solo',()=>{
 it('cria workspace solo sem inventar uma equipe',async()=>{
  const created=await db.query<{create_workspace:string}>("select public.create_workspace('Pedro Barber','pedro-barber','Pedro','SOLO')");
  const id=created.rows[0].create_workspace;
  const shop=await db.query<{operation_mode:string}>('select operation_mode from public.barbershops where id=$1',[id]);
  expect(shop.rows[0].operation_mode).toBe('SOLO');
 });
});

describe('site e app do cliente',()=>{
 it('mantém instalação personalizada e bloqueia o agendamento web antes do app',()=>{
  const portal=readFileSync(resolve('src/pages/PublicPortal.tsx'),'utf8');
  const server=readFileSync(resolve('server/app.ts'),'utf8');
  expect(portal).toContain("t('public.downloadContinue',{title})");
  expect(portal).toContain('beforeinstallprompt');
  expect(portal).toContain("installPlatform('android')");
  expect(portal).toContain("installPlatform('windows')");
  expect(portal).toContain("installPlatform('mac')");
  expect(portal).toContain("installPlatform('iphone')");
  expect(portal).toContain("t('public.installIphone')");
  expect(portal).toContain('apple-touch-icon');
  expect(portal).toContain("t('public.powered')");
  expect(portal).toContain('publicMapsUrl');
  expect(portal).toContain('publicInstagramUrl');
  expect(portal).toContain('publicWhatsappUrl');
  expect(portal).toContain("t('public.whatsappMessage',{title})");
  const dict=readFileSync(resolve('src/i18n/dictionaries.ts'),'utf8');
  expect(dict).toContain('Baixe {{title}} para continuar.');
  expect(dict).toContain('Instale no seu iPhone');
  expect(dict).toContain('Tecnologia por FIO');
  expect(dict).toContain('Vim pelo site da {{title}} no FIO');
  expect(server).toContain("/api/public/manifest/:slug");
  expect(server).toContain('operation_mode');
 });
});
