import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
const uid=(n:number)=>`40000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let db:PGlite,shop:string,customer:string,plan:string;
async function user(n:number){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${uid(n)}',false)`);}
async function scalar<T=string>(sql:string,args:unknown[]=[]){const r=await db.query<Record<string,T>>(sql,args);return Object.values(r.rows[0])[0];}
async function billing(code:string,expired=false){await db.exec('reset role');await db.query("update public.saas_subscriptions set plan=$2,status='active',expires_at=now()+($3::integer*interval '1 day') where barbershop_id=$1",[shop,code,expired?-1:30]);await user(1);}
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create schema auth;create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;`);
 for(const f of readdirSync('supabase/migrations').sort())await db.exec(readFileSync(`supabase/migrations/${f}`,'utf8'));
 await db.query('insert into auth.users select unnest($1::uuid[])',[[1,2,3].map(uid)]);
 await user(1);shop=await scalar("select public.create_barbershop('Guard Shop','guard-shop','Owner')");
 await user(2);await db.query("select public.join_barbershop('guard-shop','Client')");
 await user(1);customer=await scalar('select id from public.customers where user_id=$1',[uid(2)]);
});
describe('real SQL billing state transitions',()=>{
 const token='subscription_test_12345',planToken='plan_test_12345';
 const event=(key:string,status:string,at:string)=>db.query<{apply_syncpay_subscription_state:Record<string,unknown>}>('select public.apply_syncpay_subscription_state($1,$2,$3,$4,$5,$6,$7,$8,$9)',[key,'reconcile',at,'a'.repeat(64),token,status,planToken,'2026-09-20T00:00:00Z',['active','overdue'].includes(status)?'2099-10-01T00:00:00Z':null]);
 it('pending enrollment never grants a paid plan',async()=>{
  await db.exec("reset role;select set_config('request.jwt.claim.sub','',false)");
  await db.query("update public.saas_subscriptions set plan='FREE',status='active',expires_at=null where barbershop_id=$1",[shop]);
  await db.query("insert into public.syncpay_plan_mappings(plan_code,billing_cycle,amount_cents,periodicity_days,billing_method,provider_plan_token) values('PRO','monthly',11990,30,'qr_code',$1)",[planToken]);
  await db.exec('set role service_role');
  await db.query("select public.bind_syncpay_subscription($1,$2,$3,$4,'test-terms-v1')",[shop,token,planToken,uid(1)]);
  await db.exec('reset role');expect(await scalar('select public.effective_fio_plan($1)',[shop])).toBe('FREE');
 });
 it('confirmed provider state activates PRO; duplicate events are harmless',async()=>{
  await db.exec('set role service_role');
  const key='confirmed_event_12345';await event(key,'active','2026-09-20T01:00:00Z');
  const r=await event(key,'active','2026-09-20T01:00:00Z');expect(r.rows[0].apply_syncpay_subscription_state).toMatchObject({duplicate:true});
  await db.exec('reset role');expect(await scalar('select public.effective_fio_plan($1)',[shop])).toBe('PRO');
 });
 it('stale cancellation cannot overwrite a newer confirmed state',async()=>{
  await db.exec('set role service_role');const r=await event('stale_cancel_123456','cancelled','2026-09-20T00:30:00Z');
  expect(r.rows[0].apply_syncpay_subscription_state).toMatchObject({stale:true});
  await db.exec('reset role');expect(await scalar('select public.effective_fio_plan($1)',[shop])).toBe('PRO');
 });
 it('suspension removes paid access and clients cannot forge activation',async()=>{
  await db.exec('set role service_role');await event('suspend_event_12345','suspended','2026-09-20T02:00:00Z');
  await db.exec('reset role');expect(await scalar('select public.effective_fio_plan($1)',[shop])).toBe('FREE');
  await user(2);await expect(event('forged_event_123456','active','2026-09-20T03:00:00Z')).rejects.toThrow('permission denied');
 });
});
afterAll(async()=>{await db?.close();});
describe('release authorization regressions',()=>{
 it('unrelated user cannot activate someone else’s trial (NULL role)',async()=>{
  await user(3);await expect(db.query('select public.start_saas_pro_trial($1)',[shop])).rejects.toThrow('FORBIDDEN');
 });
 it('client cannot activate the shop trial',async()=>{
  await user(2);await expect(db.query('select public.start_saas_pro_trial($1)',[shop])).rejects.toThrow('FORBIDDEN');
 });
 it('owner starts one trial with matching expiry and period end',async()=>{
  await billing('FREE');await db.query('select public.start_saas_pro_trial($1)',[shop]);
  expect(await scalar<boolean>('select trial_ends_at=expires_at and current_period_end=expires_at from public.saas_subscriptions where barbershop_id=$1',[shop])).toBe(true);
  await expect(db.query('select public.start_saas_pro_trial($1)',[shop])).rejects.toThrow('TRIAL_ALREADY_USED');
 });
 it('FREE cannot create offers through direct REST writes',async()=>{
  await billing('FREE');await expect(db.query("insert into public.subscription_plans(barbershop_id,name,cuts,validity_days,price_cents) values($1,'Plano',4,30,10000)",[shop])).rejects.toThrow('row-level security');
 });
 it('FREE cannot bypass the API through the legacy subscription RPC',async()=>{
  await user(1);await expect(db.query("select public.issue_subscription($1,$2,'Plano',4,now()+interval '30 days')",[shop,customer])).rejects.toThrow('PLAN_REQUIRED');
 });
 it('PRO can create offers and issue subscriptions',async()=>{
  await billing('PRO');plan=await scalar("insert into public.subscription_plans(barbershop_id,name,cuts,validity_days,price_cents) values($1,'Plano',4,30,10000) returning id",[shop]);
  await db.query('select public.issue_subscription_from_plan($1,$2,$3)',[shop,customer,plan]);
 });
 it('expired PRO cannot issue new subscriptions; existing credits remain readable',async()=>{
  await billing('PRO',true);await expect(db.query('select public.issue_subscription_from_plan($1,$2,$3)',[shop,customer,plan])).rejects.toThrow('PLAN_REQUIRED');
  await user(2);expect(await scalar<number>('select remaining_cuts from public.client_subscriptions where client_id=$1',[customer])).toBe(4);
 });
 it('client cannot execute the internal guard or create an offer',async()=>{
  await expect(db.query('select fio_private.guard_new_client_subscription()')).rejects.toThrow();
  await expect(db.query("insert into public.subscription_plans(barbershop_id,name,cuts,validity_days,price_cents) values($1,'Fraude',4,30,1)",[shop])).rejects.toThrow('row-level security');
 });
});

describe('plan changes preserve paid access until proof',()=>{
 const old='plan_change_old_123',target='plan_change_new_123',token='subscription_change_123';
 let changeId:string;
 const reconcile=(key:string,status='active')=>db.query('select public.apply_syncpay_subscription_state($1,$2,now(),$3,$4,$5,$6,now(),$7)',[key,'reconcile','a'.repeat(64),token,status,target,status==='active'?'2099-10-01T00:00:00Z':null]);
 it('locks parallel changes and prevents premium from an unpaid upgrade webhook',async()=>{
  await db.exec('reset role');await db.query("update public.saas_provider_subscriptions set is_current=false where barbershop_id=$1",[shop]);
  await db.query("insert into public.syncpay_plan_mappings(plan_code,billing_cycle,amount_cents,periodicity_days,billing_method,provider_plan_token) values('PRO','weekly',3990,7,'qr_code',$1),('PREMIUM','weekly',5990,7,'qr_code',$2)",[old,target]);
  await db.query("update public.saas_subscriptions set plan='PRO',status='active',expires_at='2099-10-01' where barbershop_id=$1",[shop]);
  await db.exec('set role service_role');await db.query("select public.bind_syncpay_subscription($1,$2,$3,$4,'test-terms')",[shop,token,old,uid(1)]);
  changeId=await scalar("insert into public.syncpay_plan_changes(barbershop_id,subscription_token,target_plan_token,target_plan,target_cycle,actor,state,result_type) values($1,$2,$3,'PREMIUM','weekly',$4,'pending','upgrade') returning id",[shop,token,target,uid(1)]);
  await expect(db.query("insert into public.syncpay_plan_changes(barbershop_id,subscription_token,target_plan_token,target_plan,target_cycle,actor,state) values($1,$2,$3,'PREMIUM','weekly',$4,'creating')",[shop,token,target,uid(1)])).rejects.toThrow('duplicate key');
  await reconcile('unpaid_upgrade_test_123');await db.exec('reset role');expect(await scalar('select public.effective_fio_plan($1)',[shop])).toBe('PRO');
 });
 it('tenant cannot forge proof; service confirmation permits upgrade',async()=>{
  await user(1);await expect(db.query("update public.syncpay_plan_changes set state='complete' where id=$1",[changeId])).rejects.toThrow('permission denied');
  await db.exec('set role service_role');await db.query("update public.syncpay_plan_changes set state='complete' where id=$1",[changeId]);await reconcile('unpaid_upgrade_test_123');
  await db.exec('reset role');expect(await scalar('select public.effective_fio_plan($1)',[shop])).toBe('PREMIUM');
 });
 it('cancelled unpaid enrollment preserves trial even on repeated reconciliation',async()=>{
  await db.exec('reset role');await db.query("update public.saas_provider_subscriptions set is_current=false where barbershop_id=$1",[shop]);
  await db.query("update public.saas_subscriptions set plan='PRO',status='trialing',expires_at='2099-10-01' where barbershop_id=$1",[shop]);
  await db.exec('set role service_role');const pending='subscription_trial_cancel';await db.query("select public.bind_syncpay_subscription($1,$2,$3,$4,'test-terms')",[shop,pending,old,uid(1)]);
  for(const key of ['cancel_trial_test_123','repeat_cancel_test_123'])await db.query("select public.apply_syncpay_subscription_state($1,'reconcile',now(),$2,$3,'cancelled',$4,null,null)",[key,'a'.repeat(64),pending,old]);
  await db.exec('reset role');expect(await scalar('select public.effective_fio_plan($1)',[shop])).toBe('PRO');expect(await scalar('select status from public.saas_subscriptions where barbershop_id=$1',[shop])).toBe('trialing');
 });
});
