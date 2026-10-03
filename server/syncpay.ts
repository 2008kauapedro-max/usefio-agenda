import { createHash,createHmac,timingSafeEqual } from 'node:crypto';
import { createClient,type SupabaseClient } from '@supabase/supabase-js';
import type { Request,Response as ExpressResponse } from 'express';
import { z } from 'zod';
import type { TenantContext } from './context.js';
import { ApiError,dbError } from './errors.js';
import { FIO_PLAN_CATALOG,type BillingCycle } from '../shared/fio-plans.js';

const BASE='https://api.syncpayments.com.br/api/partner/v1';
const PAID_PLANS=['PRO','PREMIUM'] as const;
const CYCLES=['monthly','annual'] as const;
const CYCLE_DAYS:Record<BillingCycle,number>={weekly:7,monthly:30,annual:365};
const BILLING_ADVANCE:Record<BillingCycle,number>={weekly:1,monthly:3,annual:7};
const GRACE_DAYS:Record<BillingCycle,number>={weekly:2,monthly:5,annual:7};
const MAX_RETRIES=3;
const SUBSCRIPTION_EVENTS=new Set([
 'assinatura_criada','assinatura_ativada','assinatura_em_atraso','assinatura_suspensa',
 'assinatura_cancelada','assinatura_reativada','assinatura_renovada','assinatura_plano_alterado',
 'cobranca_gerada','cobranca_paga','cobranca_falhou','cobranca_retentativa','mandato_ativado','mandato_cancelado'
]);

const subscribeInput=z.object({
 plan:z.enum(PAID_PLANS),cycle:z.enum(CYCLES),document:z.string().trim().min(11).max(24),acceptedTerms:z.literal(true)
}).strict();

const planResource=z.object({
 token:z.string().min(8).max(200),name:z.string(),description:z.string().optional().nullable(),amount:z.union([z.string(),z.number()]),
 periodicity_days:z.number().int().positive(),billing_advance_days:z.number().int().nonnegative().optional(),grace_period_days:z.number().int().nonnegative().optional(),
 max_retry_attempts:z.number().int().nonnegative().optional(),billing_method:z.string(),status:z.string(),checkout_url:z.string().url().optional().nullable()
}).passthrough();
const listPlansResponse=z.object({data:z.array(planResource)}).passthrough();
const createPlanResponse=z.object({data:planResource}).passthrough();
const subscriberResource=z.object({
 token:z.string().min(8).max(200),status:z.string().optional(),subscriber_email:z.string().optional().nullable(),
 started_at:z.string().optional().nullable()
}).passthrough();
const listSubscribersResponse=z.object({data:z.array(subscriberResource)}).passthrough();
const transactionResponse=z.object({data:z.object({
 reference_id:z.string().min(8).max(200),status:z.string(),paid_at:z.string().optional().nullable(),transaction_date:z.string().optional().nullable()
}).passthrough()}).passthrough();
const refundResponse=z.object({data:z.object({
 code:z.string().min(4).max(100),status:z.string(),requested_at:z.string().optional().nullable()
}).passthrough()}).passthrough();

const chargeSchema=z.object({
 cycle_number:z.number().int().optional(),amount:z.union([z.string(),z.number()]).optional(),status:z.string().default('pending'),due_date:z.string().optional().nullable(),
 expires_at:z.string().optional().nullable(),paid_at:z.string().optional().nullable(),payment:z.object({pix_code:z.string().optional().nullable(),qr_code:z.string().optional().nullable(),identifier:z.string().optional().nullable()}).passthrough().optional().nullable()
}).passthrough();
const loosePayment=z.object({pix_code:z.string().optional().nullable(),qr_code:z.string().optional().nullable(),identifier:z.string().optional().nullable(),expires_at:z.string().optional().nullable(),status:z.string().optional().nullable()}).passthrough();
const looseSubscription=z.object({
 token:z.string().optional(),subscription_token:z.string().optional(),status:z.string().optional(),subscriber_name:z.string().optional(),subscriber_email:z.string().optional(),
 started_at:z.string().optional().nullable(),next_charge_at:z.string().optional().nullable(),next_billing_at:z.string().optional().nullable(),next_charge_date:z.string().optional().nullable(),
 cancelled_at:z.string().optional().nullable(),plan:z.union([z.string(),z.object({token:z.string().optional(),grace_period_days:z.number().int().nonnegative().optional()}).passthrough()]).optional(),
 plan_token:z.string().optional(),charges:z.array(chargeSchema).optional(),payment:loosePayment.optional().nullable()
}).passthrough();
const enrollResponse=z.object({
 subscription_token:z.string().min(8).max(200),status:z.string(),billing_method:z.string(),payment:z.object({
  pix_code:z.string().min(1).optional().nullable(),qr_code:z.string().optional().nullable(),identifier:z.string().optional().nullable(),expires_at:z.string().optional().nullable()
 }).passthrough().optional().nullable()
}).passthrough();
const webhookEnvelope=z.object({
 event:z.string().min(1).max(80),occurred_at:z.iso.datetime({offset:true}),subscription_token:z.string().min(8).max(200),
 plan_token:z.string().min(8).max(200).optional(),status:z.string().max(80).optional(),next_charge_at:z.iso.datetime({offset:true}).nullable().optional()
}).passthrough();

type Fetcher=typeof fetch;
type PaidPlan=typeof PAID_PLANS[number];
type ProviderStatus='pending_first_payment'|'active'|'overdue'|'suspended'|'cancelled';
type ProviderDetail={planReported:boolean;token:string;status:ProviderStatus;started_at:string|null;next_charge_at:string|null;cancelled_at:string|null;plan:{token:string;grace_period_days:number};charges:z.infer<typeof chargeSchema>[];payment:z.infer<typeof loosePayment>|null};
type PlanMapping={plan_code:PaidPlan;billing_cycle:BillingCycle;amount_cents:number;periodicity_days:number;billing_method:string;provider_plan_token:string;checkout_url:string|null};
type ProviderLink={id:string;barbershop_id:string;provider_subscription_token:string;provider_plan_token:string;plan_code:PaidPlan;billing_cycle:BillingCycle;amount_cents:number;provider_status:ProviderStatus;is_current:boolean;last_event_at:string|null};
type EnrollmentIntent={id:string;state:'creating'|'uncertain';provider_subscription_token:string|null;same_offer:boolean;created:boolean};
type OpenEnrollmentRow={id:string;provider_plan_token:string;plan_code:PaidPlan;billing_cycle:BillingCycle;state:'creating'|'uncertain';provider_subscription_token:string|null;created_at:string;updated_at:string};
const enrollmentIntentSchema=z.object({id:z.uuid(),state:z.enum(['creating','uncertain']),provider_subscription_token:z.string().min(8).max(200).nullable(),same_offer:z.boolean(),created:z.boolean()});

let tokenCache:{value:string;expiresAt:number}|null=null;

class SyncpayHttpError extends Error{
 constructor(readonly status:number,readonly payload:unknown){super(`syncpay_http_${status}`);this.name='SyncpayHttpError';}
}

function adminDb(){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new ApiError(503,'SETUP_REQUIRED','A configuração segura do servidor ainda não foi concluída.');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}

function configured(){return Boolean(process.env.SYNCPAY_CLIENT_ID&&process.env.SYNCPAY_CLIENT_SECRET);}
function webhookSecrets(){
 const named=[
  process.env.SYNCPAY_WEBHOOK_SECRET,
  process.env.SYNCPAY_WEBHOOK_SECRET_PREVIOUS,
  process.env.SYNCPAY_WEBHOOK_SECRET_ACTIVATED,
  process.env.SYNCPAY_WEBHOOK_SECRET_OVERDUE,
  process.env.SYNCPAY_WEBHOOK_SECRET_SUSPENDED,
  process.env.SYNCPAY_WEBHOOK_SECRET_CANCELLED,
  process.env.SYNCPAY_WEBHOOK_SECRET_REACTIVATED,
  process.env.SYNCPAY_WEBHOOK_SECRET_RENEWED
 ];
 const packed=(process.env.SYNCPAY_WEBHOOK_SECRETS??'').split(/[\n,;]/);
 return [...new Set([...named,...packed].map(x=>x?.trim()).filter((x):x is string=>Boolean(x&&x.length>=8)))].slice(0,20);
}
function digits(value:string){return value.replace(/\D/g,'');}
function safeEqual(a:string,b:string){const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb);}
function cents(value:string|number){const n=typeof value==='number'?value:Number(value);return Number.isFinite(n)?Math.round(n*100):-1;}
function brl(centsValue:number){return (centsValue/100).toFixed(2);}
function iso(value:string|null|undefined){if(!value)return null;const d=new Date(value);return Number.isNaN(d.getTime())?null:d.toISOString();}

function validCpf(value:string){
 if(value.length!==11||/^(\d)\1+$/.test(value))return false;
 const calc=(len:number)=>{let sum=0;for(let i=0;i<len;i++)sum+=Number(value[i])*(len+1-i);const r=(sum*10)%11;return r===10?0:r;};
 return calc(9)===Number(value[9])&&calc(10)===Number(value[10]);
}
function validCnpj(value:string){
 if(value.length!==14||/^(\d)\1+$/.test(value))return false;
 const calc=(base:string,weights:number[])=>{const sum=base.split('').reduce((acc,n,i)=>acc+Number(n)*weights[i],0);const r=sum%11;return r<2?0:11-r;};
 const d1=calc(value.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2]);
 const d2=calc(value.slice(0,12)+d1,[6,5,4,3,2,9,8,7,6,5,4,3,2]);
 return d1===Number(value[12])&&d2===Number(value[13]);
}
function validDocument(value:string){return validCpf(value)||validCnpj(value);}

function planConfig(plan:PaidPlan,cycle:BillingCycle){
 const definition=FIO_PLAN_CATALOG.find(item=>item.code===plan);
 const amount=definition?.prices[cycle];
 if(!definition||definition.proposal||amount==null||amount<=0)throw new ApiError(400,'INVALID_PLAN','Escolha um plano pago válido.');
 return {plan,cycle,amountCents:amount,periodicityDays:CYCLE_DAYS[cycle],name:`${definition.name} · ${cycle==='weekly'?'Semanal':cycle==='monthly'?'Mensal':'Anual'} · v1 · ${amount}`};
}

async function parseJson(response:globalThis.Response){
 const text=await response.text();
 if(!text)return {};
 try{return JSON.parse(text) as unknown;}catch{return {message:'invalid_json'};}
}

function providerParse<T>(schema:z.ZodType<T>,value:unknown):T{
 const parsed=schema.safeParse(value);
 if(!parsed.success)throw new ApiError(503,'SYNCPAY_INVALID_RESPONSE','Não foi possível atualizar a cobrança agora. Tente novamente em instantes.');
 return parsed.data;
}

function normalizeProviderStatus(value:unknown):ProviderStatus{
 const raw=String(value??'').toLowerCase().trim();
 if(raw==='pending'||raw==='pending_payment'||raw==='pending_first_payment')return 'pending_first_payment';
 if(raw==='active'||raw==='approved'||raw==='paid')return 'active';
 if(raw==='overdue'||raw==='past_due'||raw==='late')return 'overdue';
 if(raw==='suspended'||raw==='paused')return 'suspended';
 if(raw==='cancelled'||raw==='canceled'||raw==='expired')return 'cancelled';
 throw new ApiError(503,'SYNCPAY_INVALID_RESPONSE','Não foi possível atualizar a cobrança agora. Tente novamente em instantes.');
}

function normalizeProviderDetail(value:unknown,fallback:{token:string;planToken:string;gracePeriodDays:number}):ProviderDetail{
 const root=value&&typeof value==='object'?value as Record<string,unknown>:{};
 let raw:unknown=root.data??root;
 if(raw&&typeof raw==='object'&&'subscription' in (raw as Record<string,unknown>))raw=(raw as Record<string,unknown>).subscription;
 const detail=providerParse(looseSubscription,raw);
 const plan=typeof detail.plan==='string'?{token:detail.plan}:detail.plan;
 const token=(detail.token??detail.subscription_token??fallback.token).trim();
 const planToken=(plan?.token??detail.plan_token??fallback.planToken).trim();
 if(token.length<8||planToken.length<8)throw new ApiError(503,'SYNCPAY_INVALID_RESPONSE','Não foi possível atualizar a cobrança agora. Tente novamente em instantes.');
 if(token!==fallback.token)throw new ApiError(503,'SYNCPAY_INVALID_RESPONSE','Não foi possível confirmar a cobrança solicitada.');
 return {
  planReported:Boolean(plan?.token||detail.plan_token),token,status:normalizeProviderStatus(detail.status),started_at:iso(detail.started_at),next_charge_at:iso(detail.next_charge_at??detail.next_billing_at??detail.next_charge_date),cancelled_at:iso(detail.cancelled_at),
   plan:{token:planToken,grace_period_days:fallback.gracePeriodDays},
  charges:detail.charges??[],payment:detail.payment??null
 };
}

async function getAccessToken(fetcher:Fetcher,force=false){
 if(!force&&tokenCache&&tokenCache.expiresAt-Date.now()>60_000)return tokenCache.value;
 const clientId=process.env.SYNCPAY_CLIENT_ID,clientSecret=process.env.SYNCPAY_CLIENT_SECRET;
 if(!clientId||!clientSecret)throw new ApiError(503,'SYNCPAY_NOT_CONFIGURED','A cobrança recorrente ainda não está disponível. Tente novamente mais tarde.');
 let response:globalThis.Response;
 try{response=await fetcher(`${BASE}/auth-token`,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({client_id:clientId,client_secret:clientSecret}),signal:AbortSignal.timeout(15000)});}catch{throw new ApiError(503,'SYNCPAY_UNAVAILABLE','Não foi possível acessar a cobrança agora. Tente novamente em instantes.');}
 const payload=await parseJson(response);
 if(!response.ok)throw new SyncpayHttpError(response.status,payload);
 const parsed=providerParse(z.object({access_token:z.string().min(10),expires_in:z.number().positive().default(3600),expires_at:z.string().optional()}),payload);
 const byField=parsed.expires_at?Date.parse(parsed.expires_at):NaN;
 tokenCache={value:parsed.access_token,expiresAt:Number.isFinite(byField)?byField:Date.now()+parsed.expires_in*1000};
 return tokenCache.value;
}

async function providerRequest(fetcher:Fetcher,path:string,init:RequestInit={},retry401=true):Promise<unknown>{
 let token:string;
 try{token=await getAccessToken(fetcher);}catch(e){throw providerApiError(e);}
 let response:globalThis.Response;
 try{response=await fetcher(`${BASE}${path}`,{...init,headers:{Accept:'application/json',Authorization:`Bearer ${token}`,...(init.body?{'Content-Type':'application/json'}:{}),...(init.headers??{})},signal:init.signal??AbortSignal.timeout(15000)});}catch{throw new ApiError(503,'SYNCPAY_UNAVAILABLE','Não foi possível acessar a cobrança agora. Tente novamente em instantes.');}
 if(response.status===401&&retry401){tokenCache=null;try{await getAccessToken(fetcher,true);}catch(e){throw providerApiError(e);}return providerRequest(fetcher,path,init,false);}
 const payload=await parseJson(response);
 if(!response.ok)throw providerApiError(new SyncpayHttpError(response.status,payload));
 return payload;
}

function providerApiError(error:unknown):ApiError{
 if(error instanceof ApiError)return error;
 if(error instanceof SyncpayHttpError){
  const p=error.payload&&typeof error.payload==='object'?error.payload as Record<string,unknown>:{};
  if(error.status===422&&p.action==='wait_for_approval')return new ApiError(503,'SYNCPAY_ACCOUNT_PENDING','A cobrança recorrente ainda não está disponível para esta conta.');
  if(error.status===401||error.status===403)return new ApiError(503,'SYNCPAY_AUTH_ERROR','A cobrança recorrente está temporariamente indisponível. Tente novamente mais tarde.');
  if(error.status===429)return new ApiError(429,'SYNCPAY_RATE_LIMIT','Muitas tentativas em pouco tempo. Aguarde um pouco e tente novamente.');
  if(error.status===404)return new ApiError(409,'SYNCPAY_RESOURCE_NOT_FOUND','Não foi possível localizar esta cobrança. Atualize a página e tente novamente.');
  const providerCode=String(p.error??p.error_code??'').toLowerCase();
  if(error.status===409&&providerCode.includes('refund'))return new ApiError(409,'SYNCPAY_REFUND_IN_PROGRESS','Já existe um reembolso em andamento para esta cobrança.');
  if(error.status===422&&providerCode.includes('refund'))return new ApiError(422,'SYNCPAY_REFUND_UNAVAILABLE','Esta cobrança não está elegível para reembolso automático. Fale com o suporte FIO.');
  if(error.status===422)return new ApiError(422,'SYNCPAY_INVALID_REQUEST','Não foi possível criar a cobrança com esses dados. Confira as informações e tente novamente.');
 }
 return new ApiError(503,'SYNCPAY_UNAVAILABLE','Não foi possível acessar a cobrança agora. Tente novamente em instantes.');
}

async function ensureProviderPlan(db:SupabaseClient,plan:PaidPlan,cycle:BillingCycle,fetcher:Fetcher):Promise<PlanMapping>{
 const config=planConfig(plan,cycle);
 const local=await db.from('syncpay_plan_mappings').select('plan_code,billing_cycle,amount_cents,periodicity_days,billing_method,provider_plan_token,checkout_url').eq('plan_code',plan).eq('billing_cycle',cycle).eq('billing_method','qr_code').eq('amount_cents',config.amountCents).eq('active',true).maybeSingle();
 dbError(local.error);
 if(local.data)return local.data as PlanMapping;

 const query=new URLSearchParams({page:'1',per_page:'100',status:'active',search:config.name});
 const listed=providerParse(listPlansResponse,await providerRequest(fetcher,`/subscription-plans?${query.toString()}`));
 let remote=listed.data.find(item=>item.name===config.name&&cents(item.amount)===config.amountCents&&item.periodicity_days===config.periodicityDays&&item.billing_method==='qr_code');
 if(!remote){
  const created=providerParse(createPlanResponse,await providerRequest(fetcher,'/subscription-plans',{method:'POST',body:JSON.stringify({
   name:config.name,description:`Assinatura ${plan} do FIO no ciclo ${cycle}.`,amount:brl(config.amountCents),periodicity_days:config.periodicityDays,
   billing_method:'qr_code',billing_advance_days:BILLING_ADVANCE[cycle],grace_period_days:GRACE_DAYS[cycle],max_retry_attempts:MAX_RETRIES
  })}));
  remote=created.data;
 }
 const row={plan_code:plan,billing_cycle:cycle,amount_cents:config.amountCents,periodicity_days:config.periodicityDays,billing_method:'qr_code',provider_plan_token:remote.token,checkout_url:remote.checkout_url??null,active:true,updated_at:new Date().toISOString()};
 const saved=await db.from('syncpay_plan_mappings').upsert(row,{onConflict:'plan_code,billing_cycle,billing_method,amount_cents'}).select('plan_code,billing_cycle,amount_cents,periodicity_days,billing_method,provider_plan_token,checkout_url').single();
 dbError(saved.error);return saved.data as PlanMapping;
}

async function getProviderDetail(token:string,fetcher:Fetcher,fallback:{planToken:string;gracePeriodDays:number}){return normalizeProviderDetail(await providerRequest(fetcher,`/subscriptions/${encodeURIComponent(token)}`),{token,...fallback});}

function paymentFromDetail(detail:ProviderDetail){
 const charge=detail.charges.find(item=>['pending','created','waiting_payment'].includes(String(item.status).toLowerCase())&&item.payment?.pix_code);
 if(charge)return {pixCode:charge.payment?.pix_code??null,qrCode:charge.payment?.qr_code??null,identifier:charge.payment?.identifier??null,expiresAt:iso(charge.expires_at)};
 if(detail.payment?.pix_code)return {pixCode:detail.payment.pix_code??null,qrCode:detail.payment.qr_code??null,identifier:detail.payment.identifier??null,expiresAt:iso(detail.payment.expires_at)};
 return null;
}

function paymentFromChargePayload(value:unknown){
 let raw:unknown=value;
 for(let depth=0;depth<4;depth++){
  if(!raw||typeof raw!=='object')return null;
  const record=raw as Record<string,unknown>;
  if(record.charge&&typeof record.charge==='object'){
   const parsed=chargeSchema.safeParse(record.charge);
   const charge=parsed.success?parsed.data:null;
   if(charge?.payment?.pix_code)return {pixCode:charge.payment.pix_code,qrCode:charge.payment.qr_code??null,identifier:charge.payment.identifier??null,expiresAt:iso(charge.expires_at)};
  }
  const direct=loosePayment.safeParse(record.payment??record);
  if(direct.success&&direct.data.pix_code)return {pixCode:direct.data.pix_code,qrCode:direct.data.qr_code??null,identifier:direct.data.identifier??null,expiresAt:iso(direct.data.expires_at)};
  raw=record.data??record.subscription??null;
 }
 return null;
}

function accessUntil(detail:ProviderDetail){
 const next=iso(detail.next_charge_at);
 if(detail.status==='active'||detail.status==='overdue'){
  if(!next)return null;
  return new Date(new Date(next).getTime()+(detail.plan.grace_period_days??0)*86_400_000).toISOString();
 }
 return null;
}

function stateEventKey(prefix:string,detail:ProviderDetail){
 return createHash('sha256').update([prefix,detail.token,detail.status,detail.plan.token,detail.next_charge_at??'',detail.cancelled_at??'',JSON.stringify(detail.charges.map(c=>[c.cycle_number,c.status,c.paid_at,c.payment?.identifier]))].join('|')).digest('hex');
}

async function applyProviderTruth(db:SupabaseClient,detail:ProviderDetail,event:{key:string;name:string;occurredAt:string;bodyHash:string}){
 await reconcilePlanChange(db,detail);
 const mapped=await db.from('syncpay_plan_mappings').select('billing_cycle').eq('provider_plan_token',detail.plan.token).maybeSingle();dbError(mapped.error);
 if(mapped.data)detail.plan.grace_period_days=GRACE_DAYS[mapped.data.billing_cycle as BillingCycle];
 const until=accessUntil(detail);
 if((detail.status==='active'||detail.status==='overdue')&&!until)throw new ApiError(503,'SYNCPAY_INCOMPLETE_STATE','Não foi possível confirmar a validade da assinatura agora. Tente novamente em instantes.');
 const result=await db.rpc('apply_syncpay_subscription_state',{
  p_event_key:event.key,p_event_name:event.name,p_occurred_at:event.occurredAt,p_body_sha256:event.bodyHash,
  p_subscription_token:detail.token,p_provider_status:detail.status,p_plan_token:detail.plan.token,p_started_at:iso(detail.started_at),p_access_until:until
 });
 dbError(result.error);return result.data;
}

function firstPaidCharge(detail:ProviderDetail){
 const paid=detail.charges.filter(item=>Boolean(item.paid_at)&&['paid','completed','approved'].includes(String(item.status).toLowerCase()));
 return paid.sort((a,b)=>{
  const ac=a.cycle_number??Number.MAX_SAFE_INTEGER,bc=b.cycle_number??Number.MAX_SAFE_INTEGER;
  if(ac!==bc)return ac-bc;
  return Date.parse(a.paid_at??'')-Date.parse(b.paid_at??'');
 })[0]??null;
}

function refundWindow(detail:ProviderDetail,now=Date.now()){
 const charge=firstPaidCharge(detail);
 if(!charge?.paid_at)return {eligible:false,deadline:null,identifier:null};
 if(charge.cycle_number!=null&&charge.cycle_number!==1)return {eligible:false,deadline:null,identifier:null};
 const paidAt=Date.parse(charge.paid_at);
 if(!Number.isFinite(paidAt))return {eligible:false,deadline:null,identifier:null};
 const deadlineMs=paidAt+7*86_400_000;
 return {eligible:now<=deadlineMs,deadline:new Date(deadlineMs).toISOString(),identifier:charge.payment?.identifier??null};
}

function billingResponse(link:ProviderLink,detail:ProviderDetail,paymentOverride?:{pixCode:string|null;qrCode:string|null;identifier:string|null;expiresAt:string|null}|null){
 const refund=refundWindow(detail);
 return {provider:'syncpay' as const,providerStatus:detail.status,plan:link.plan_code,cycle:link.billing_cycle,amountCents:link.amount_cents,nextChargeAt:iso(detail.next_charge_at),payment:paymentOverride??paymentFromDetail(detail),refund:{eligible:refund.eligible,deadline:refund.deadline}};
}

async function currentLink(db:SupabaseClient,shopId:string){
 const r=await db.from('saas_provider_subscriptions').select('id,barbershop_id,provider_subscription_token,provider_plan_token,plan_code,billing_cycle,amount_cents,provider_status,is_current,last_event_at').eq('barbershop_id',shopId).eq('provider','syncpay').eq('is_current',true).maybeSingle();
 dbError(r.error);return r.data as ProviderLink|null;
}

async function setEnrollmentIntent(db:SupabaseClient,id:string,state:'creating'|'uncertain'|'linked'|'failed',subscriptionToken:string|null,errorCode:string|null){
 const r=await db.from('syncpay_enrollment_intents').update({state,provider_subscription_token:subscriptionToken,last_error_code:errorCode,updated_at:new Date().toISOString()}).eq('id',id);
 dbError(r.error);
}

function enrollmentFailureIsKnown(error:unknown){
 if(!(error instanceof ApiError))return false;
 return ['INVALID_DOCUMENT','BILLING_EMAIL_REQUIRED','SYNCPAY_ACCOUNT_PENDING','SYNCPAY_AUTH_ERROR','SYNCPAY_RATE_LIMIT','SYNCPAY_RESOURCE_NOT_FOUND','SYNCPAY_INVALID_REQUEST'].includes(error.code);
}

function pickRecoverableSubscriber(items:z.infer<typeof subscriberResource>[],email:string,intentCreatedAt:string){
 const wanted=email.trim().toLowerCase(),created=Date.parse(intentCreatedAt);
 if(!wanted||!Number.isFinite(created))return null;
 const floor=created-10*60_000,ceiling=Date.now()+5*60_000;
 const candidates=items.filter(item=>{
  const started=Date.parse(item.started_at??'');
  return item.subscriber_email?.trim().toLowerCase()===wanted
   && !['cancelled','canceled'].includes(String(item.status??'').toLowerCase())
   && Number.isFinite(started)&&started>=floor&&started<=ceiling;
 });
 return candidates.sort((a,b)=>Date.parse(b.started_at??'')-Date.parse(a.started_at??''))[0]??null;
}

async function recoverOpenEnrollment(ctx:TenantContext,fetcher:Fetcher,forceReset=false){
 const db=adminDb();
 const open=await db.from('syncpay_enrollment_intents')
  .select('id,provider_plan_token,plan_code,billing_cycle,state,provider_subscription_token,created_at,updated_at')
  .eq('barbershop_id',ctx.shopId).in('state',['creating','uncertain']).order('created_at',{ascending:false}).limit(1).maybeSingle();
 dbError(open.error);
 if(!open.data)return {billing:null,blocked:false};
 const intent=open.data as OpenEnrollmentRow;
 const mapping=await db.from('syncpay_plan_mappings').select('provider_plan_token,billing_cycle').eq('provider_plan_token',intent.provider_plan_token).maybeSingle();
 dbError(mapping.error);
 if(!mapping.data){
  const age=Date.now()-Date.parse(intent.updated_at);
  if(Number.isFinite(age)&&age>=30*60_000){await setEnrollmentIntent(db,intent.id,'failed',null,'SYNCPAY_PLAN_MAPPING_MISSING');return {billing:null,blocked:false};}
  return {billing:null,blocked:true};
 }
 const finalize=async(token:string)=>{
  const detail=await getProviderDetail(token,fetcher,{planToken:intent.provider_plan_token,gracePeriodDays:GRACE_DAYS[intent.billing_cycle]});
  const known=await db.from('saas_provider_subscriptions').select('id,barbershop_id').eq('provider_subscription_token',detail.token).maybeSingle();
  dbError(known.error);
  if(known.data){
   if(known.data.barbershop_id!==ctx.shopId)throw new ApiError(409,'SYNCPAY_SUBSCRIPTION_CONFLICT','A assinatura recuperada pertence a outro estabelecimento. Fale com o suporte FIO.');
   const demote=await db.from('saas_provider_subscriptions').update({is_current:false,updated_at:new Date().toISOString()}).eq('barbershop_id',ctx.shopId).eq('provider','syncpay').eq('is_current',true).neq('id',known.data.id);
   dbError(demote.error);
   const promote=await db.from('saas_provider_subscriptions').update({is_current:true,updated_at:new Date().toISOString()}).eq('id',known.data.id);
   dbError(promote.error);
  }else{
   const bound=await db.rpc('bind_syncpay_subscription',{p_shop:ctx.shopId,p_subscription_token:detail.token,p_provider_plan_token:intent.provider_plan_token,p_actor:ctx.userId,p_terms_version:'fio-subscription-v1'});
   dbError(bound.error);
  }
  await setEnrollmentIntent(db,intent.id,'linked',detail.token,null);
  const link=await currentLink(db,ctx.shopId);
  if(!link)throw new ApiError(503,'BILLING_STATE_ERROR','A assinatura existe, mas o FIO não conseguiu recuperar o vínculo.');
  await applyProviderTruth(db,detail,{key:stateEventKey('enrollment-auto-recovery',detail),name:'reconcile',occurredAt:new Date().toISOString(),bodyHash:createHash('sha256').update(JSON.stringify(detail)).digest('hex')});
  return billingResponse(link,detail);
 };
 if(intent.provider_subscription_token){
  try{return {billing:await finalize(intent.provider_subscription_token),blocked:false};}
  catch{return {billing:null,blocked:true};}
 }
 const user=await db.auth.admin.getUserById(ctx.userId),email=user.data.user?.email?.trim().toLowerCase()??'';
 if(email){
  try{
   const query=new URLSearchParams({page:'1',per_page:'50',search:email});
   const listed=providerParse(listSubscribersResponse,await providerRequest(fetcher,`/subscription-plans/${encodeURIComponent(intent.provider_plan_token)}/subscribers?${query.toString()}`));
   const candidate=pickRecoverableSubscriber(listed.data,email,intent.created_at);
   if(candidate)return {billing:await finalize(candidate.token),blocked:false};
  }catch(error){
   if(error instanceof ApiError&&['SYNCPAY_AUTH_ERROR','SYNCPAY_ACCOUNT_PENDING','SYNCPAY_RATE_LIMIT','SYNCPAY_UNAVAILABLE'].includes(error.code))return {billing:null,blocked:true};
  }
 }
 const age=Date.now()-Date.parse(intent.updated_at);
 const resetAfter=forceReset?5*60_000:30*60_000;
 if(Number.isFinite(age)&&age>=resetAfter){
  await setEnrollmentIntent(db,intent.id,'failed',null,forceReset?'SYNCPAY_ENROLLMENT_RESET_BY_OWNER':'SYNCPAY_STALE_ENROLLMENT');
  return {billing:null,blocked:false};
 }
 return {billing:null,blocked:true};
}

export async function recoverSyncpayEnrollment(ctx:TenantContext,raw:unknown,fetcher:Fetcher=fetch){
 if(ctx.member.role!=='OWNER')throw new ApiError(403,'FORBIDDEN','Somente o responsável pode verificar a tentativa de assinatura.');
 z.object({confirmed:z.literal(true)}).strict().parse(raw);
 const result=await recoverOpenEnrollment(ctx,fetcher,true);
 if(result.billing)return {configured:true,subscription:result.billing,cleared:false};
 if(result.blocked)throw new ApiError(409,'SYNCPAY_ENROLLMENT_IN_PROGRESS','A tentativa ainda é recente. Aguarde até 5 minutos da última tentativa e verifique novamente.');
 return {configured:true,subscription:null,cleared:true};
}

export async function createSyncpaySubscription(ctx:TenantContext,raw:unknown,fetcher:Fetcher=fetch){
 if(ctx.member.role!=='OWNER')throw new ApiError(403,'FORBIDDEN','Esta ação é exclusiva do responsável pela barbearia.');
 const input=subscribeInput.parse(raw),document=digits(input.document);
 if(!validDocument(document))throw new ApiError(400,'INVALID_DOCUMENT','Informe um CPF ou CNPJ válido.');
 if(!configured())throw new ApiError(503,'SYNCPAY_NOT_CONFIGURED','A cobrança recorrente ainda não está disponível. Tente novamente mais tarde.');
 const recovered=await recoverOpenEnrollment(ctx,fetcher);
 if(recovered.billing){
  if(recovered.billing.plan===input.plan&&recovered.billing.cycle===input.cycle)return recovered.billing;
  throw new ApiError(409,'SYNCPAY_SUBSCRIPTION_EXISTS','Já existe uma assinatura ou cobrança recorrente em andamento. Conclua ou cancele a atual antes de escolher outro plano.');
 }
 if(recovered.blocked)throw new ApiError(409,'SYNCPAY_ENROLLMENT_IN_PROGRESS','Uma tentativa recente ainda está sendo conferida. Aguarde alguns minutos e tente novamente.');
 const db=adminDb(),mapping=await ensureProviderPlan(db,input.plan,input.cycle,fetcher);
 const existing=await currentLink(db,ctx.shopId);
 if(existing){
  const detail=await getProviderDetail(existing.provider_subscription_token,fetcher,{planToken:existing.provider_plan_token,gracePeriodDays:GRACE_DAYS[existing.billing_cycle]});
  await applyProviderTruth(db,detail,{key:stateEventKey('pre-enroll-reconcile',detail),name:'reconcile',occurredAt:new Date().toISOString(),bodyHash:createHash('sha256').update(JSON.stringify({status:detail.status,token:detail.token,plan:detail.plan.token,next:detail.next_charge_at})).digest('hex')});
  if(['active','overdue','pending_first_payment'].includes(detail.status)){
   if(existing.plan_code===input.plan&&existing.billing_cycle===input.cycle)return billingResponse(existing,detail);
   throw new ApiError(409,'SYNCPAY_SUBSCRIPTION_EXISTS','Já existe uma assinatura ou cobrança recorrente em andamento. Conclua ou cancele a atual antes de escolher outro plano.');
  }
 }
 const user=await db.auth.admin.getUserById(ctx.userId);
 if(user.error||!user.data.user?.email)throw new ApiError(400,'BILLING_EMAIL_REQUIRED','Sua conta precisa de um e-mail válido para assinar o FIO.');
 const begun=await db.rpc('begin_syncpay_enrollment',{p_shop:ctx.shopId,p_provider_plan_token:mapping.provider_plan_token,p_actor:ctx.userId});dbError(begun.error);
 const intent=providerParse(enrollmentIntentSchema,begun.data) as EnrollmentIntent;
 if(!intent.same_offer)throw new ApiError(409,'SYNCPAY_ENROLLMENT_IN_PROGRESS','Já existe uma tentativa de assinatura em verificação. Para evitar cobrança duplicada, aguarde a confirmação antes de escolher outro plano.');
 if(!intent.created){
  if(!intent.provider_subscription_token)throw new ApiError(409,'SYNCPAY_ENROLLMENT_UNCERTAIN','Uma tentativa anterior ainda está sendo verificada. Para evitar uma cobrança duplicada, não gere outro Pix agora.');
  const detail=await getProviderDetail(intent.provider_subscription_token,fetcher,{planToken:mapping.provider_plan_token,gracePeriodDays:GRACE_DAYS[input.cycle]});
  try{
   const bound=await db.rpc('bind_syncpay_subscription',{p_shop:ctx.shopId,p_subscription_token:detail.token,p_provider_plan_token:mapping.provider_plan_token,p_actor:ctx.userId,p_terms_version:'fio-subscription-v1'});dbError(bound.error);
   await setEnrollmentIntent(db,intent.id,'linked',detail.token,null);
   const link=await currentLink(db,ctx.shopId);
   if(!link)throw new ApiError(503,'BILLING_STATE_ERROR','A assinatura existe, mas o FIO não conseguiu recuperar o vínculo. Entre em contato com o suporte.');
   await applyProviderTruth(db,detail,{key:stateEventKey('enrollment-recovery',detail),name:'reconcile',occurredAt:new Date().toISOString(),bodyHash:createHash('sha256').update(JSON.stringify(detail)).digest('hex')});
   return billingResponse(link,detail);
  }catch(e){await setEnrollmentIntent(db,intent.id,'uncertain',detail.token,e instanceof ApiError?e.code:'BILLING_STATE_ERROR');throw e;}
 }
 const phone=digits(ctx.member.phone??'');
 const payload:{name:string;email:string;document:string;phone?:string}={name:ctx.member.display_name,email:user.data.user.email,document};
 if(phone.length>=8)payload.phone=phone;
 let subscriptionToken:string|null=null;
 try{
  const enrolled=providerParse(enrollResponse,await providerRequest(fetcher,`/subscription-plans/${encodeURIComponent(mapping.provider_plan_token)}/enroll`,{method:'POST',body:JSON.stringify(payload)}));
  subscriptionToken=enrolled.subscription_token;
  await setEnrollmentIntent(db,intent.id,'creating',subscriptionToken,null);
  const bound=await db.rpc('bind_syncpay_subscription',{p_shop:ctx.shopId,p_subscription_token:subscriptionToken,p_provider_plan_token:mapping.provider_plan_token,p_actor:ctx.userId,p_terms_version:'fio-subscription-v1'});dbError(bound.error);
  await setEnrollmentIntent(db,intent.id,'linked',subscriptionToken,null);
  const link=await currentLink(db,ctx.shopId);
  if(!link)throw new ApiError(503,'BILLING_STATE_ERROR','A cobrança foi criada, mas o FIO não conseguiu vincular a assinatura. Não gere outra cobrança e entre em contato com o suporte.');
  let detail:ProviderDetail;
  try{
   detail=await getProviderDetail(subscriptionToken,fetcher,{planToken:mapping.provider_plan_token,gracePeriodDays:GRACE_DAYS[input.cycle]});
  }catch(error){
   // Enrollment and binding already succeeded. A temporary detail read failure
   // must not mark the real subscription as uncertain or hide its initial Pix.
   if(normalizeProviderStatus(enrolled.status)!=='pending_first_payment')throw error;
   detail=normalizeProviderDetail({subscription_token:subscriptionToken,status:enrolled.status,plan_token:mapping.provider_plan_token,payment:enrolled.payment??null},{token:subscriptionToken,planToken:mapping.provider_plan_token,gracePeriodDays:GRACE_DAYS[input.cycle]});
   const fallback=billingResponse(link,detail);
   if(!fallback.payment?.pixCode&&enrolled.payment?.pix_code)fallback.payment={pixCode:enrolled.payment.pix_code,qrCode:enrolled.payment.qr_code??null,identifier:enrolled.payment.identifier??null,expiresAt:iso(enrolled.payment.expires_at)};
   return fallback;
  }
  await applyProviderTruth(db,detail,{key:stateEventKey('enrollment-confirmation',detail),name:'reconcile',occurredAt:new Date().toISOString(),bodyHash:createHash('sha256').update(JSON.stringify(detail)).digest('hex')});
  const current=await currentLink(db,ctx.shopId);
  const response=billingResponse(current??link,detail);
  // Some SyncPay responses expose the first Pix on /enroll while the detail
  // endpoint is still catching up. Keep that code if reconciliation has none.
  if(!response.payment?.pixCode&&enrolled.payment?.pix_code){
   response.payment={pixCode:enrolled.payment.pix_code,qrCode:enrolled.payment.qr_code??null,identifier:enrolled.payment.identifier??null,expiresAt:iso(enrolled.payment.expires_at)};
  }
  return response;
 }catch(e){
  const known=!subscriptionToken&&enrollmentFailureIsKnown(e);
  await setEnrollmentIntent(db,intent.id,known?'failed':'uncertain',subscriptionToken,e instanceof ApiError?e.code:'SYNCPAY_UNKNOWN_RESULT');
  if(!known&&!subscriptionToken)throw new ApiError(503,'SYNCPAY_ENROLLMENT_UNCERTAIN','Não foi possível confirmar se a SyncPay criou a assinatura. Para evitar cobrança duplicada, não tente novamente agora.');
  throw e;
 }
}

type PlanChange={id:string;subscription_token:string;target_plan_token:string;state:string;charge_cycle:number|null;charge_amount_cents:number|null;charge_identifier:string|null;target_plan:PaidPlan;target_cycle:BillingCycle;result_type:string|null};
async function pendingPlanChange(db:SupabaseClient,token:string){
 const r=await db.from('syncpay_plan_changes').select('*').eq('subscription_token',token).in('state',['creating','uncertain','pending']).maybeSingle();dbError(r.error);return r.data as PlanChange|null;
}
export function planChangePaid(change:Pick<PlanChange,'charge_cycle'|'charge_amount_cents'|'charge_identifier'>,charges:ProviderDetail['charges']){
 if(change.charge_cycle===null||change.charge_amount_cents===null)return false;
 return charges.some(c=>c.cycle_number===change.charge_cycle&&cents(c.amount??-1)===change.charge_amount_cents&&c.status==='paid'&&Boolean(iso(c.paid_at))&&(!change.charge_identifier||c.payment?.identifier===change.charge_identifier));
}
async function reconcilePlanChange(db:SupabaseClient,detail:ProviderDetail){
 const change=await pendingPlanChange(db,detail.token);if(!change)return;
 const complete=change.state==='pending'&&detail.planReported&&detail.plan.token===change.target_plan_token&&(change.result_type==='downgrade'||change.result_type==='same_value'||planChangePaid(change,detail.charges));
 if(complete){const r=await db.from('syncpay_plan_changes').update({state:'complete',updated_at:new Date().toISOString()}).eq('id',change.id).eq('state','pending');dbError(r.error);}
}
export async function changeSyncpayPlan(ctx:TenantContext,raw:unknown,fetcher:Fetcher=fetch){
 if(ctx.member.role!=='OWNER')throw new ApiError(403,'FORBIDDEN','Somente o responsável pode alterar o plano.');
 const input=z.object({plan:z.enum(PAID_PLANS),cycle:z.enum(CYCLES),confirmed:z.literal(true)}).strict().parse(raw);
 const db=adminDb(),link=await currentLink(db,ctx.shopId);
 if(!link)throw new ApiError(409,'SYNCPAY_NO_SUBSCRIPTION','Não há assinatura paga para alterar.');
 const existingChange=await pendingPlanChange(db,link.provider_subscription_token);
 if(existingChange)throw new ApiError(409,'SYNCPAY_CHANGE_PENDING','Há uma troca em andamento. Atualize a cobrança antes de tentar novamente.');
 const detail=await getProviderDetail(link.provider_subscription_token,fetcher,{planToken:link.provider_plan_token,gracePeriodDays:GRACE_DAYS[link.billing_cycle]});
 if(detail.status!=='active'||detail.charges.some(c=>['pending','created','waiting_payment'].includes(c.status)))throw new ApiError(409,'SYNCPAY_CHANGE_BLOCKED','Regularize a cobrança atual antes de trocar de plano.');
 const target=await ensureProviderPlan(db,input.plan,input.cycle,fetcher);
 if(target.provider_plan_token===detail.plan.token)throw new ApiError(409,'SYNCPAY_SAME_PLAN','Este já é o plano e período atuais.');
 // Provider product compatibility is checked before mutation; never assume separately created plans belong to one product.
 const resources=await Promise.all([detail.plan.token,target.provider_plan_token].map(token=>providerRequest(fetcher,`/subscription-plans/${encodeURIComponent(token)}`)));
 const compatibility=z.object({data:z.object({status:z.string(),billing_method:z.string(),product:z.object({reference_id:z.string().min(1)})})});
 const current=compatibility.safeParse(resources[0]),next=compatibility.safeParse(resources[1]);
 if(!current.success||!next.success||next.data.data.status!=='active'||current.data.data.product.reference_id!==next.data.data.product.reference_id||current.data.data.billing_method!==next.data.data.billing_method)throw new ApiError(409,'SYNCPAY_PLAN_INCOMPATIBLE','Os planos precisam ser vinculados ao mesmo produto de cobrança. Fale com o suporte.');
 const created=await db.from('syncpay_plan_changes').insert({barbershop_id:ctx.shopId,subscription_token:link.provider_subscription_token,target_plan_token:target.provider_plan_token,target_plan:input.plan,target_cycle:input.cycle,actor:ctx.userId,state:'creating'}).select('id').single();
 if(created.error?.code==='23505')throw new ApiError(409,'SYNCPAY_CHANGE_PENDING','Há uma troca em andamento.');dbError(created.error);
 const id=created.data!.id;
 try{
  const result=await providerRequest(fetcher,`/subscriptions/${encodeURIComponent(link.provider_subscription_token)}/change-plan`,{method:'PATCH',body:JSON.stringify({new_plan_token:target.provider_plan_token,reason:'Troca confirmada pelo responsável no FIO'})},false);
  const response=providerParse(z.object({plan_change:z.object({type:z.enum(['upgrade','downgrade','same_value']),to_plan_token:z.string(),proration_amount:z.union([z.string(),z.number()]).nullable().optional(),proration_charge:chargeSchema.nullable().optional()})}),result);
  if(response.plan_change.to_plan_token!==target.provider_plan_token)throw new ApiError(503,'SYNCPAY_INVALID_RESPONSE','Troca em verificação.');
  const change=response.plan_change,charge=change.proration_charge;
  if(change.type==='upgrade'&&(!charge||charge.cycle_number==null||cents(charge.amount??-1)<=0))throw new ApiError(503,'SYNCPAY_INVALID_RESPONSE','Cobrança da diferença em verificação.');
  const saved=await db.from('syncpay_plan_changes').update({state:'pending',result_type:change.type,charge_cycle:charge?.cycle_number??null,charge_amount_cents:charge?cents(charge.amount??-1):null,charge_identifier:charge?.payment?.identifier??null,updated_at:new Date().toISOString()}).eq('id',id);dbError(saved.error);
 }catch(e){
  const known=enrollmentFailureIsKnown(e);
  const saved=await db.from('syncpay_plan_changes').update({state:known?'failed':'uncertain',updated_at:new Date().toISOString()}).eq('id',id);dbError(saved.error);
  if(!known)throw new ApiError(503,'SYNCPAY_CHANGE_UNCERTAIN','Troca em verificação. Não repita a solicitação; consulte a cobrança.');throw e;
 }
 return getSyncpayBilling(ctx,fetcher);
}
export async function manageSyncpayCharge(ctx:TenantContext,raw:unknown,fetcher:Fetcher=fetch){
 if(ctx.member.role!=='OWNER')throw new ApiError(403,'FORBIDDEN','Somente o responsável pode gerenciar a cobrança.');
 const input=z.object({action:z.enum(['cancel_pending','resend','cancel_active']),confirmed:z.literal(true)}).strict().parse(raw);
 const db=adminDb(),link=await currentLink(db,ctx.shopId);
 if(!link)throw new ApiError(409,'SYNCPAY_NO_SUBSCRIPTION','Nenhuma cobrança encontrada.');
 if(await pendingPlanChange(db,link.provider_subscription_token))throw new ApiError(409,'SYNCPAY_CHANGE_PENDING','A troca está em andamento. Consulte o suporte.');
 const detail=await getProviderDetail(link.provider_subscription_token,fetcher,{planToken:link.provider_plan_token,gracePeriodDays:GRACE_DAYS[link.billing_cycle]});
 if(input.action==='cancel_pending'&&detail.status!=='pending_first_payment')throw new ApiError(409,'SYNCPAY_CHANGE_BLOCKED','A cobrança mudou. Atualize antes de continuar.');
 if(input.action==='cancel_active'&&!['active','overdue','suspended'].includes(detail.status))throw new ApiError(409,'SYNCPAY_CHANGE_BLOCKED','Esta assinatura não pode ser cancelada nesse estado. Atualize antes de continuar.');
 if(input.action==='resend'&&!['pending_first_payment','overdue'].includes(detail.status))throw new ApiError(409,'SYNCPAY_CHANGE_BLOCKED','Não há cobrança pendente para reenviar.');
 let payload:unknown;
 try{
  if(input.action==='resend')payload=await providerRequest(fetcher,`/subscriptions/${encodeURIComponent(link.provider_subscription_token)}/resend-charge`,{method:'PATCH'},false);
  else payload=await providerRequest(fetcher,`/subscriptions/${encodeURIComponent(link.provider_subscription_token)}/cancel`,{method:'PATCH',body:JSON.stringify({reason:input.action==='cancel_pending'?'Responsável cancelou a contratação antes do primeiro pagamento no FIO':'Responsável cancelou a renovação da assinatura pelo FIO'})},false);
 }catch(error){
  if(input.action==='resend'&&error instanceof ApiError&&error.code==='SYNCPAY_INVALID_REQUEST')throw new ApiError(422,'SYNCPAY_RESEND_REJECTED','A SyncPay não aceitou gerar outro Pix agora. Atualize o status e, se continuar assim, fale com o suporte antes de tentar novamente.');
  throw error;
 }
 if(input.action==='resend'){
  const resentPayment=paymentFromChargePayload(payload);
  if(resentPayment?.pixCode)return {configured:true,subscription:{...billingResponse(link,detail,resentPayment),change:null}};
 }
 return getSyncpayBilling(ctx,fetcher);
}

export async function requestSyncpayRefund(ctx:TenantContext,raw:unknown,fetcher:Fetcher=fetch){
 if(ctx.member.role!=='OWNER')throw new ApiError(403,'FORBIDDEN','Somente o responsável pode solicitar reembolso.');
 z.object({confirmed:z.literal(true)}).strict().parse(raw);
 if(!configured())throw new ApiError(503,'SYNCPAY_NOT_CONFIGURED','O reembolso está temporariamente indisponível.');
 const db=adminDb(),link=await currentLink(db,ctx.shopId);
 if(!link)throw new ApiError(409,'SYNCPAY_NO_SUBSCRIPTION','Nenhuma assinatura paga foi encontrada.');
 const detail=await getProviderDetail(link.provider_subscription_token,fetcher,{planToken:link.provider_plan_token,gracePeriodDays:GRACE_DAYS[link.billing_cycle]});
 const window=refundWindow(detail);
 if(!window.eligible||!window.deadline)throw new ApiError(409,'SYNCPAY_REFUND_WINDOW_EXPIRED','O prazo de 7 dias para esta primeira contratação já terminou. Você ainda pode cancelar cobranças futuras.');
 if(!window.identifier)throw new ApiError(409,'SYNCPAY_REFUND_MANUAL_REQUIRED','Não foi possível identificar automaticamente a transação paga. Fale com o suporte FIO para solicitar o reembolso.');
 const existing=await db.from('syncpay_refund_requests').select('refund_code,status,requested_at').eq('barbershop_id',ctx.shopId).eq('subscription_token',link.provider_subscription_token).maybeSingle();
 dbError(existing.error);
 if(existing.data)return {refund:{code:existing.data.refund_code,status:existing.data.status,requestedAt:existing.data.requested_at},subscription:(await getSyncpayBilling(ctx,fetcher)).subscription,cancellation:'already_requested' as const};
 const transaction=providerParse(transactionResponse,await providerRequest(fetcher,`/transaction/${encodeURIComponent(window.identifier)}`));
 if(String(transaction.data.status).toLowerCase()!=='completed')throw new ApiError(409,'SYNCPAY_REFUND_NOT_READY','O pagamento ainda não está disponível para reembolso. Atualize o status e tente novamente.');
 let refunded:z.infer<typeof refundResponse>;
 try{
  refunded=providerParse(refundResponse,await providerRequest(fetcher,`/transaction/${encodeURIComponent(transaction.data.reference_id)}/refund`,{method:'POST',body:JSON.stringify({
   reason:'buyer_withdrawal',
   reason_details:'Cliente solicitou cancelamento e reembolso da primeira contratação do FIO dentro do prazo de 7 dias.'
  })},false));
 }catch(error){
  if(error instanceof ApiError&&error.code==='SYNCPAY_INVALID_REQUEST')throw new ApiError(422,'SYNCPAY_REFUND_UNAVAILABLE','A SyncPay não aceitou automatizar o reembolso desta cobrança. Fale com o suporte FIO.');
  throw error;
 }
 const saved=await db.from('syncpay_refund_requests').insert({
  barbershop_id:ctx.shopId,subscription_token:link.provider_subscription_token,transaction_reference_id:transaction.data.reference_id,
  refund_code:refunded.data.code,status:refunded.data.status,requested_at:iso(refunded.data.requested_at)??new Date().toISOString(),created_by:ctx.userId
 }).select('refund_code,status,requested_at').single();
 dbError(saved.error);
 const savedRefund=saved.data!;
 let cancellation:'cancelled'|'needs_attention'='cancelled';
 try{
  await providerRequest(fetcher,`/subscriptions/${encodeURIComponent(link.provider_subscription_token)}/cancel`,{method:'PATCH',body:JSON.stringify({reason:'Cliente solicitou reembolso da primeira contratação dentro do prazo de 7 dias'})},false);
 }catch{cancellation='needs_attention';}
 let subscription=null;
 try{subscription=(await getSyncpayBilling(ctx,fetcher)).subscription;}catch{}
 return {refund:{code:savedRefund.refund_code,status:savedRefund.status,requestedAt:savedRefund.requested_at},subscription,cancellation};
}

export async function getSyncpayBilling(ctx:TenantContext,fetcher:Fetcher=fetch){
 if(ctx.member.role!=='OWNER')throw new ApiError(403,'FORBIDDEN','Esta ação é exclusiva do responsável pela barbearia.');
 if(!configured())return {configured:false,subscription:null};
 const db=adminDb(),link=await currentLink(db,ctx.shopId);
 if(!link)return {configured:true,subscription:null};
 const detail=await getProviderDetail(link.provider_subscription_token,fetcher,{planToken:link.provider_plan_token,gracePeriodDays:GRACE_DAYS[link.billing_cycle]});
 await applyProviderTruth(db,detail,{key:stateEventKey('owner-reconcile',detail),name:'reconcile',occurredAt:new Date().toISOString(),bodyHash:createHash('sha256').update(JSON.stringify({status:detail.status,token:detail.token,plan:detail.plan.token,next:detail.next_charge_at})).digest('hex')});
 const reconciled=await currentLink(db,ctx.shopId);
 const change=await pendingPlanChange(db,link.provider_subscription_token);
 if(change){detail.payment=null;detail.charges=detail.charges.filter(c=>change.charge_cycle!==null&&c.cycle_number===change.charge_cycle&&cents(c.amount??-1)===change.charge_amount_cents&&(!change.charge_identifier||c.payment?.identifier===change.charge_identifier));}
 return {configured:true,subscription:{...billingResponse(reconciled??link,detail),change:change?{plan:change.target_plan,cycle:change.target_cycle,state:change.state,type:change.result_type,amountCents:change.charge_amount_cents}:null}};
}

function isSyncpayDashboardTest(rawBody:Buffer){
 const expected='This is a test webhook payload.';
 if(rawBody.length===0||rawBody.length>2048)return false;
 const body=rawBody.toString('utf8').replace(/\u0000/g,'').trim();
 // Never swallow a real event merely because a field includes the test phrase.
 if(/"(?:event|subscription_token)"\s*:/.test(body))return false;
 if(body===expected)return true;
 const containsExpected=(value:unknown,depth=0):boolean=>{
  if(typeof value==='string')return value.trim()===expected;
  if(!value||typeof value!=='object'||depth>3)return false;
  if(Array.isArray(value))return value.some(item=>containsExpected(item,depth+1));
  return Object.values(value as Record<string,unknown>).some(item=>containsExpected(item,depth+1));
 };
 try{
  const parsed:unknown=JSON.parse(body);
  if(parsed&&typeof parsed==='object'&&('event' in parsed||'subscription_token' in parsed))return false;
  return containsExpected(parsed);
 }catch{}
 try{
  const params=new URLSearchParams(body);
  if(params.has('event')||params.has('subscription_token'))return false;
  if([...params.values()].some(value=>value.trim()===expected))return true;
 }catch{}
 // Dashboard form-data reachability checks contain a dedicated message field.
 if(body.startsWith('--')&&!/name="(?:event|subscription_token)"/.test(body))return body.split(/\r?\n/).some(line=>line===expected);
 return false;
}

export function verifySyncpayWebhook(rawBody:Buffer,headers:Request['headers'],nowSeconds=Math.floor(Date.now()/1000)){
 const secrets=webhookSecrets();
 if(!secrets.length)return false;
 const signature=String(headers['x-syncpay-signature']??'');
 if(signature){
  const parts=signature.split(',').map(x=>x.trim().split('=',2));
  const t=Number(parts.find(([k])=>k==='t')?.[1]??0),v1=parts.find(([k])=>k==='v1')?.[1]??'';
  if(Number.isFinite(t)&&t>0&&v1&&Math.abs(nowSeconds-t)<=300){
   const signed=`${t}.${rawBody.toString('utf8')}`;
   if(secrets.some(secret=>safeEqual(createHmac('sha256',secret).update(signed).digest('hex'),v1)))return true;
  }
 }
 const auth=String(headers.authorization??'').match(/^Bearer\s+(.+)$/i)?.[1]??'';
 return Boolean(auth&&secrets.some(secret=>safeEqual(secret,auth)));
}

export async function handleSyncpayWebhook(req:Request,res:ExpressResponse,fetcher:Fetcher=fetch){
 const raw=Buffer.isBuffer(req.body)?req.body:Buffer.from('');
 if(!raw.length)throw new ApiError(400,'INVALID_WEBHOOK','Webhook vazio.');
 // The SyncPay dashboard's manual "send test" action uses a fixed synthetic payload.
 // It is only a reachability check, so acknowledge that exact payload without mutating state.
 // Real events still fail closed unless their HMAC/Bearer authentication is valid.
 if(isSyncpayDashboardTest(raw)){res.status(200).json({received:true,test:true});return;}
 if(!verifySyncpayWebhook(raw,req.headers))throw new ApiError(401,'INVALID_WEBHOOK_SIGNATURE','Assinatura do webhook inválida.');
 let parsed:unknown;try{parsed=JSON.parse(raw.toString('utf8'));}catch{throw new ApiError(400,'INVALID_WEBHOOK','Webhook inválido.');}
 const base=z.object({event:z.string().min(1).max(80)}).passthrough().parse(parsed);
 if(!SUBSCRIPTION_EVENTS.has(base.event)){res.status(200).json({received:true,ignored:true});return;}
 const event=webhookEnvelope.parse(parsed);
 const db=adminDb();
 const known=await db.from('saas_provider_subscriptions').select('id,provider_plan_token,billing_cycle').eq('provider','syncpay').eq('provider_subscription_token',event.subscription_token).maybeSingle();
 dbError(known.error);
 if(!known.data){res.status(200).json({received:true,ignored:true});return;}
 const knownLink=known.data as {id:string;provider_plan_token:string;billing_cycle:BillingCycle};
 const detail=await getProviderDetail(event.subscription_token,fetcher,{planToken:event.plan_token??knownLink.provider_plan_token,gracePeriodDays:GRACE_DAYS[knownLink.billing_cycle]});
 const bodyHash=createHash('sha256').update(raw).digest('hex');
 const key=createHash('sha256').update([event.event,event.subscription_token,event.occurred_at,event.plan_token??'',event.status??'',event.next_charge_at??''].join('|')).digest('hex');
 await applyProviderTruth(db,detail,{key,name:event.event,occurredAt:new Date(event.occurred_at).toISOString(),bodyHash});
 res.status(200).json({received:true});
}

export const syncpayInternals={planConfig,validDocument,accessUntil,stateEventKey,isSyncpayDashboardTest,normalizeProviderDetail,paymentFromChargePayload,refundWindow,pickRecoverableSubscriber};
