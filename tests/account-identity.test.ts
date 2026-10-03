import { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { readFileSync,readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const uid=(n:number)=>`91000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let db:PGlite;
async function asUser(n:number){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${uid(n)}',false);`);}

beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create schema auth;create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;`);
 for(const file of readdirSync(resolve('supabase/migrations')).sort())await db.exec(readFileSync(resolve('supabase/migrations',file),'utf8'));
 await db.exec(`insert into auth.users(id) values('${uid(1)}'),('${uid(2)}');`);
},60000);
afterAll(async()=>{await db?.close();});

describe('identidade única da conta',()=>{
 it('permite o mesmo telefone para o mesmo usuário e bloqueia outra conta',async()=>{
  await asUser(1);
  expect((await db.query<{claim_account_phone:string}>("select public.claim_account_phone('(61) 99999-9999')")).rows[0].claim_account_phone).toBe('5561999999999');
  await db.query("select public.claim_account_phone('+55 61 99999-9999')");
  await asUser(2);
  await expect(db.query("select public.claim_account_phone('(61) 99999-9999')")).rejects.toThrow('PHONE_ALREADY_IN_USE');
 });
 it('não expõe o cadastro global de telefones ao usuário',async()=>{
  await asUser(1);
  await expect(db.query('select * from public.account_phone_registry')).rejects.toThrow('permission denied');
 });
});

describe('fluxo de conta na interface',()=>{
 it('mantém um e-mail por conta e pede telefone no cadastro',()=>{
  const auth=readFileSync(resolve('src/pages/Auth.tsx'),'utf8');
  const server=readFileSync(resolve('server/app.ts'),'utf8');
  expect(auth).toContain('account_phone:signupPhone.trim()');
  expect(auth).toContain("t('auth.existingAccount')");
  const dict=readFileSync(resolve('src/i18n/dictionaries.ts'),'utf8');
  expect(dict).toContain('Este e-mail já está vinculado a uma conta FIO.');
  expect(server).toContain("claim_account_phone");
  expect(server).toContain('PHONE_ALREADY_IN_USE');
 });
});
