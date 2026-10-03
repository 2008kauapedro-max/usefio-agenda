import {describe,it,expect,vi,afterEach} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {askAssistant} from '../server/assistant';
import {planChangePaid,changeSyncpayPlan,manageSyncpayCharge} from '../server/syncpay';
import {demoData} from '../src/lib/demo';
import {usablePix,type BillingState} from '../shared/billing-state';
afterEach(()=>vi.unstubAllEnvs());
describe('trial and upgrade regressions',()=>{
 it.each(['trialing','active','past_due'])('AI respects valid %s entitlement',async status=>{
  vi.stubEnv('AI_API_URL','');const data=demoData('OWNER');
  const db={from:(table:string)=>{const c={select:()=>c,eq:()=>c,single:async()=>({data:table==='saas_subscriptions'?{plan:'PRO',status,expires_at:'2099-01-01'}:{ai_enabled:true},error:null})};return c;}} as unknown as SupabaseClient;
  await expect(askAssistant({db,userId:data.membership.user_id,shopId:data.shop.id,member:data.membership,plan:'PRO'},{message:'Minha agenda'})).rejects.toMatchObject({code:'AI_UNAVAILABLE'});
 });
 it('payment proof must identify the exact proration charge and paid timestamp',()=>{
  const change={charge_cycle:5,charge_amount_cents:4233,charge_identifier:'difference-5'};
  const paid={cycle_number:5,amount:'42.33',status:'paid',paid_at:'2026-09-22T00:00:00Z',payment:{identifier:'difference-5'}};
  expect(planChangePaid(change,[paid])).toBe(true);
  for(const patch of [{cycle_number:4},{amount:'119.90'},{status:'pending'},{paid_at:null},{payment:{identifier:'another-charge'}}])expect(planChangePaid(change,[{...paid,...patch}])).toBe(false);
  expect(planChangePaid({...change,charge_cycle:null},[paid])).toBe(false);
 });
 it.each(['BARBER','CLIENT'] as const)('%s cannot change or cancel SaaS billing',async role=>{
  const d=demoData(role),ctx={db:{} as SupabaseClient,userId:d.membership.user_id,shopId:d.shop.id,member:d.membership,plan:d.plan};
  await expect(changeSyncpayPlan(ctx,{})).rejects.toMatchObject({code:'FORBIDDEN'});await expect(manageSyncpayCharge(ctx,{})).rejects.toMatchObject({code:'FORBIDDEN'});
 });
 it('Pix for active subscription is shown only for a confirmed pending upgrade charge',()=>{
  const b:BillingState={provider:'syncpay',providerStatus:'active',plan:'PRO',cycle:'monthly',amountCents:11990,nextChargeAt:null,payment:{pixCode:'TEST',expiresAt:'2099-01-01',identifier:null,qrCode:null}};
  expect(usablePix(b)).toBe(false);expect(usablePix({...b,change:{plan:'PREMIUM',cycle:'monthly',state:'pending',type:'upgrade',amountCents:2000}})).toBe(true);
  expect(usablePix({...b,change:{plan:'PREMIUM',cycle:'monthly',state:'uncertain',type:'upgrade',amountCents:2000}})).toBe(false);
 });
});
