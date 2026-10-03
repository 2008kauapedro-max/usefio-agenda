import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Request } from 'express';
import { z } from 'zod';
import type { Membership, Bootstrap, Plan } from '../shared/domain.js';
import { planAllows,type FioFeature } from '../shared/entitlements.js';
import { ApiError, dbError } from './errors.js';

export interface AuthContext { db: SupabaseClient; userId: string }
export interface TenantContext extends AuthContext { shopId: string; member: Membership; plan:Plan }

type SubscriptionState={plan:Plan;status:string;expires_at:string|null};
function effectivePlan(subscription:SubscriptionState|null|undefined):Plan{
 if(!subscription)return 'FREE';
 const active=['active','trialing','past_due'].includes(subscription.status)&&(!subscription.expires_at||new Date(subscription.expires_at)>new Date());
 return active?subscription.plan:'FREE';
}

export async function authenticate(req: Request): Promise<AuthContext> {
 const token=req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
 if(!token) throw new ApiError(401,'AUTH_REQUIRED','Entre para continuar.');
 const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_ANON_KEY;
 if(!url||!key) throw new ApiError(503,'SETUP_REQUIRED','A conexão da barbearia ainda não foi configurada.');
 const db=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.auth.getUser(token);
 if(error||!data.user) throw new ApiError(401,'AUTH_REQUIRED','Sua sessão expirou. Entre novamente.');
 return {db,userId:data.user.id};
}

export async function tenant(auth: AuthContext, req: Request): Promise<TenantContext> {
 const shopId=z.uuid().parse(req.headers['x-barbershop-id']);
 const [membership,billing]=await Promise.all([
  auth.db.from('memberships').select('*').eq('barbershop_id',shopId).eq('user_id',auth.userId).eq('active',true).maybeSingle(),
  auth.db.from('saas_subscriptions').select('plan,status,expires_at').eq('barbershop_id',shopId).maybeSingle()
 ]);
 dbError(membership.error);dbError(billing.error);
 if(!membership.data) throw new ApiError(403,'FORBIDDEN','Você não tem acesso a esta barbearia.');
 return {...auth,shopId,member:membership.data as Membership,plan:effectivePlan(billing.data as SubscriptionState|null)};
}

export function requireOwner(ctx: TenantContext) { if(ctx.member.role!=='OWNER') throw new ApiError(403,'FORBIDDEN','Esta ação é exclusiva do responsável pela barbearia.'); }
export function requireFioFeature(ctx:TenantContext,feature:FioFeature){
 if(!planAllows(ctx.plan,feature))throw new ApiError(403,'PLAN_REQUIRED','Este recurso não está disponível no plano atual da barbearia.');
}

export async function bootstrap(ctx: TenantContext): Promise<Bootstrap> {
 const {db,shopId}=ctx;
 const from=new Date(Date.now()-30*86400000).toISOString();
 const feedAllowed=planAllows(ctx.plan,'feed'),communicationAllowed=planAllows(ctx.plan,'communication');
 const results=await Promise.all([
  db.from('barbershops').select('*').eq('id',shopId).single(),
  db.from('services').select('*').eq('barbershop_id',shopId).order('name'),
  db.from('appointments').select('id,client_id,barber_id,service_id,starts_at,ends_at,status,price_cents,subscription_id').eq('barbershop_id',shopId).gte('starts_at',from).order('starts_at').limit(500),
  db.from('customers').select('id,name,phone,user_id').eq('barbershop_id',shopId).order('name').limit(500),
  db.from('memberships').select('*').eq('barbershop_id',shopId).eq('active',true),
  db.from('client_subscriptions').select('*').eq('barbershop_id',shopId).order('expires_at').limit(500),
  db.from('saas_subscriptions').select('*').eq('barbershop_id',shopId).single(),
  db.from('memberships').select('*').eq('user_id',ctx.userId).eq('active',true),
  db.from('plan_features').select('plan,ai_enabled,ai_daily_limit,ai_per_minute'),
  feedAllowed?db.from('feed_posts').select('id,author_id,author_name,caption,image_path,created_at').eq('barbershop_id',shopId).order('created_at',{ascending:false}).limit(100):Promise.resolve({data:[],error:null}),
  db.from('subscription_plans').select('id,name,description,cuts,validity_days,price_cents,active').eq('barbershop_id',shopId).order('name'),
  communicationAllowed?db.from('campaigns').select('id,title,body,audience,status,created_at,published_at').eq('barbershop_id',shopId).order('created_at',{ascending:false}).limit(100):Promise.resolve({data:[],error:null}),
  db.from('notifications').select('id,title,body,read_at,created_at,appointment_id').eq('barbershop_id',shopId).eq('user_id',ctx.userId).order('created_at',{ascending:false}).limit(50),
  db.from('reviews').select('id,appointment_id,client_id,barber_id,rating,comment,created_at').eq('barbershop_id',shopId).order('created_at',{ascending:false}).limit(500)
 ]);
 results.forEach(r=>dbError(r.error));
 const [shop,services,appointments,customers,team,subscriptions,billing,memberships,features,posts,subscriptionPlans,campaigns,notifications,reviews]=results.map(r=>r.data);
 const plan=ctx.plan;
 const aiEnabled=planAllows(plan,'assistant')&&(features as {plan:string;ai_enabled:boolean}[]).some(f=>f.plan===plan&&f.ai_enabled);
 const fioSubscription={plan:billing.plan,status:billing.status,starts_at:billing.starts_at,current_period_end:billing.current_period_end,trial_ends_at:billing.trial_ends_at,cancelled_at:billing.cancelled_at};
 const brandingShop={...shop,logo_url:shop.logo_url||(shop.logo_asset_path&&process.env.SUPABASE_URL?`${process.env.SUPABASE_URL}/storage/v1/object/public/branding-assets/${shop.logo_asset_path}`:null)};
 return {shop:brandingShop,membership:ctx.member,memberships,services,appointments,customers,team,subscriptions,subscriptionPlans,campaigns,notifications,posts,reviews,fioSubscription,plan,aiEnabled,aiLimits:features.find((f:{plan:string})=>f.plan===plan)} as Bootstrap;
}

// The provider receives a deliberately small, role-scoped data projection, never a frontend snapshot.
export function assistantContext(data: Bootstrap) {
 const role=data.membership.role;
 return {
  role, barbershop:{name:data.shop.name,timezone:data.shop.timezone}, current_time:new Date().toISOString(),
  coverage:'Agenda: recorte dos registros a partir dos últimos 30 dias, até 80 registros; pode não incluir todos os horários futuros. Clientes e assinaturas: até 100 registros. Não inferir totais fora deste recorte.',
  services:data.services.filter(s=>s.active).slice(0,80).map(s=>({name:s.name,description:s.description??undefined,duration_minutes:s.duration_minutes,price_cents:s.price_cents})),
  appointments:data.appointments.slice(0,80).map(a=>({start:a.starts_at,end:a.ends_at,status:a.status,service:data.services.find(s=>s.id===a.service_id)?.name,client:data.customers.find(c=>c.id===a.client_id)?.name})),
  ...(role==='OWNER'?{customers:data.customers.slice(0,100).map(c=>({name:c.name})),subscriptions:data.subscriptions.slice(0,100).map(s=>({name:s.name,remaining_cuts:s.remaining_cuts,expires_at:s.expires_at,status:s.status}))}:{}),
  ...(role==='CLIENT'?{subscriptions:data.subscriptions.slice(0,100).map(s=>({name:s.name,remaining_cuts:s.remaining_cuts,expires_at:s.expires_at,status:s.status}))}:{}),
  cancellation_policy:'Cliente pode cancelar até 2 horas antes. Nenhuma ação é executada pelo chat.'
 };
}



