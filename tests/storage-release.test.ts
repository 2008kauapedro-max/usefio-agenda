import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
const uid=(n:number)=>`80000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let db:PGlite,shop:string,other:string;
async function user(n:number){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${uid(n)}',false)`);}
async function scalar<T=string>(sql:string,args:unknown[]=[]){const r=await db.query<Record<string,T>>(sql,args);return Object.values(r.rows[0])[0];}
async function upload(bucket:string,name:string){return db.query('insert into storage.objects(bucket_id,name) values($1,$2)',[bucket,name]);}
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create schema auth;create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,unique(bucket_id,name));
 create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
 create function storage.extension(name text) returns text language sql immutable as $$select reverse(split_part(reverse(name),'.',1))$$;
 alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated,service_role;
 grant select,insert,update,delete on storage.objects to authenticated;grant select on storage.objects to anon;
 `);
 for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync(`supabase/migrations/${f}`,'utf8'));
 await db.query('insert into auth.users select unnest($1::uuid[])',[[1,2,3,4].map(uid)]);
 await user(1);shop=await scalar("select public.create_barbershop('Storage A','storage-a','Owner')");
 await user(2);other=await scalar("select public.create_barbershop('Storage B','storage-b','Owner B')");
 await user(3);await db.query("select public.join_barbershop('storage-a','Client')");
 await user(1);const invite=await scalar("select public.create_invitation($1,'BARBER')",[shop]);
 await user(4);await db.query("select public.accept_invitation($1,'Barber')",[invite]);
},60000);
afterAll(async()=>{await db?.close();});
it('allows exact avatar and branding WebP paths; rejects disguised extensions and cross-tenant uploads',async()=>{
 await user(1);await upload('profile-avatars',`${shop}/${uid(1)}/avatar-1789900000000.webp`);
 await upload('branding-assets',`${shop}/${uid(1)}/logo-1789900000000.webp`);
 await upload('branding-assets',`${shop}/${uid(1)}/settings-cover-1789900000000.webp`);
 for(const path of [`${shop}/${uid(1)}/avatar-1789900000000Xwebp`,`${other}/${uid(1)}/avatar-1789900000000.webp`,`${shop}/${uid(3)}/avatar-1789900000000.webp`])await expect(upload('profile-avatars',path)).rejects.toThrow();
});
it('clients upload their own avatars but cannot upload branding or feed',async()=>{
 await user(3);await upload('profile-avatars',`${shop}/${uid(3)}/avatar-1789900000000.webp`);
 await expect(upload('branding-assets',`${shop}/${uid(3)}/logo-1789900000000.webp`)).rejects.toThrow();
 await expect(upload('feed-posts',`${shop}/${uid(3)}/${uid(1)}.webp`)).rejects.toThrow();
});
it('private feed upload/read follows paid access and tenant membership',async()=>{
 await user(4);const path=`${shop}/${uid(4)}/${uid(1)}.webp`;
 await expect(upload('feed-posts',path)).rejects.toThrow();
 await db.exec('reset role');await db.query("update public.saas_subscriptions set plan='PRO' where barbershop_id=$1",[shop]);
 await user(4);await upload('feed-posts',path);
 await user(3);expect(await scalar<number>("select count(*)::int from storage.objects where bucket_id='feed-posts'")).toBe(1);
 await user(2);expect(await scalar<number>("select count(*)::int from storage.objects where bucket_id='feed-posts'")).toBe(0);
 await db.exec('reset role;set role anon');expect(await scalar<number>("select count(*)::int from storage.objects where bucket_id='feed-posts'")).toBe(0);
});
it('cannot rename an existing avatar to bypass INSERT validation',async()=>{
 await user(3);await db.query("update storage.objects set name=$1 where bucket_id='profile-avatars' and name=$2",[`${shop}/${uid(3)}/arbitrary.webp`,`${shop}/${uid(3)}/avatar-1789900000000.webp`]);
 expect(await scalar<number>("select count(*)::int from storage.objects where name=$1",[`${shop}/${uid(3)}/arbitrary.webp`])).toBe(0);
});
it('phone/name changes reach the customer record and suspended tenants cannot update profiles',async()=>{
 await user(3);await db.query('select public.update_own_profile($1,$2,$3)',[shop,'Novo Nome','+55 (61) 99999-9999']);
 expect(await scalar('select name from public.customers where user_id=$1',[uid(3)])).toBe('Novo Nome');
 expect(await scalar('select phone from public.customers where user_id=$1',[uid(3)])).toBe('+55 (61) 99999-9999');
 await db.exec('reset role');await db.query("update public.barbershops set platform_status='suspended' where id=$1",[shop]);
 await user(3);await expect(db.query('select public.update_own_profile($1,$2,$3)',[shop,'Hacker','61999999999'])).rejects.toThrow('FORBIDDEN');
 await db.exec('reset role');await db.query("update public.barbershops set platform_status='active' where id=$1",[shop]);
});
it('hours replacement is atomic when a row is invalid',async()=>{
 await user(1);const before=await scalar<number>('select count(*)::int from public.business_hours where barbershop_id=$1',[shop]);
 await expect(db.query('select public.replace_business_hours($1,$2)',[shop,JSON.stringify([{weekday:1,opens_at:'18:00',closes_at:'09:00'}])])).rejects.toThrow();
 expect(await scalar<number>('select count(*)::int from public.business_hours where barbershop_id=$1',[shop])).toBe(before);
 await db.query('select public.replace_business_hours($1,$2)',[shop,JSON.stringify([{weekday:1,opens_at:'09:00',closes_at:'18:00'}])]);
 expect(await scalar<number>('select count(*)::int from public.business_hours where barbershop_id=$1',[shop])).toBe(1);
});
it('direct REST feedback cannot bypass per-user rate limit',async()=>{
 await user(3);
 const send=()=>db.query("insert into public.support_feedback(barbershop_id,user_id,role,category,message) values($1,$2,'CLIENT','question','Uma dúvida')",[shop,uid(3)]);
 for(let i=0;i<5;i++)await send();await expect(send()).rejects.toThrow('RATE_LIMIT');
});
it('FREE and PRO service capacities are enforced without deleting existing rows on downgrade',async()=>{
 await db.exec('reset role');await db.query("update public.saas_subscriptions set plan='FREE' where barbershop_id=$1",[shop]);await user(1);
 for(let i=0;i<8;i++)await db.query("insert into public.services(barbershop_id,name,duration_minutes,price_cents) values($1,$2,30,1000)",[shop,`Serviço ${i}`]);
 const extra=()=>db.query("insert into public.services(barbershop_id,name,duration_minutes,price_cents) values($1,'Extra',30,1000)",[shop]);
 await expect(extra()).rejects.toThrow('PLAN_CAPACITY');
 await db.exec('reset role');await db.query("update public.saas_subscriptions set plan='PRO' where barbershop_id=$1",[shop]);await user(1);await extra();
 await db.exec('reset role');await db.query("update public.saas_subscriptions set plan='FREE' where barbershop_id=$1",[shop]);await user(1);
 expect(await scalar<number>('select count(*)::int from public.services where barbershop_id=$1',[shop])).toBe(9);
 await expect(extra()).rejects.toThrow('PLAN_CAPACITY');
});
it('FREE rejects a second active barber and customer number 86',async()=>{
 await db.exec('reset role');await db.query('insert into auth.users(id) values($1)',[uid(5)]);
 await user(1);const invite=await scalar("select public.create_invitation($1,'BARBER')",[shop]);await user(5);
 await expect(db.query("select public.accept_invitation($1,'Extra barber')",[invite])).rejects.toThrow('PLAN_CAPACITY');
 await user(1);for(let i=0;i<84;i++)await db.query("insert into public.customers(barbershop_id,name) values($1,$2)",[shop,`Cliente ${i}`]);
 await expect(db.query("insert into public.customers(barbershop_id,name) values($1,'Cliente extra')",[shop])).rejects.toThrow('PLAN_CAPACITY');
});
