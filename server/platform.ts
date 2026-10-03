import { createClient } from '@supabase/supabase-js';
import { Router, type Response } from 'express';
import { z } from 'zod';
import type { AuthContext } from './context.js';
import { ApiError,dbError } from './errors.js';
import { platformPage,platformShopUpdate,platformPlanUpdate,platformSections,type PlatformSection } from '../shared/platform.js';
import { askPlatformAI,decisionInput,executeTool,aiAudit } from './platform-ai.js';
import { pushInput,pushDelete,publicPushConfig } from './platform-push.js';
import { randomUUID } from 'node:crypto';

export async function requirePlatformAdmin(a:AuthContext){
 const r=await a.db.from('platform_admins').select('user_id,display_name').eq('user_id',a.userId).eq('active',true).maybeSingle();
 dbError(r.error);
 if(!r.data)throw new ApiError(403,'FORBIDDEN','Acesso restrito à administração da plataforma.');
 return {...r.data,role:'PLATFORM_ADMIN' as const};
}
const auditColumns='id,actor_user_id,actor_name,actor_role,event_type,description,barbershop_id,created_at,barbershops(name)';
export function platformRouter(){
 const router=Router(),auth=(res:Response)=>res.locals.auth as AuthContext;
 router.use(async(_req,res,next)=>{res.set('Cache-Control','private, no-store');res.locals.platform=await requirePlatformAdmin(auth(res));next();});
 router.get('/feedback',async(req,res)=>{
  const v=platformPage.parse(req.query);
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new ApiError(503,'SETUP_REQUIRED','Suporte indisponível agora.');
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const r=await db.from('support_feedback').select('id,barbershop_id,role,category,message,created_at,barbershops(name)',{count:'exact'}).order('created_at',{ascending:false}).order('id').range((v.page-1)*v.limit,v.page*v.limit-1);dbError(r.error);
  res.json({items:r.data??[],total:r.count??0,page:v.page,limit:v.limit});
 });
 router.get('/shops/:id/contact',async(req,res)=>{
  const id=z.uuid().parse(req.params.id);
  const r=await auth(res).db.from('memberships').select('display_name,phone').eq('barbershop_id',id).eq('role','OWNER').eq('active',true).limit(1).maybeSingle();dbError(r.error);
  res.json(r.data??{display_name:'Responsável',phone:null});
 });
 router.get('/me',(_req,res)=>res.json(res.locals.platform));
 router.post('/ai',async(req,res)=>res.json(await askPlatformAI(auth(res),req.body)));
 router.post('/ai/decision',async(req,res)=>{
  const parsed=decisionInput.safeParse(req.body);
  if(!parsed.success){await aiAudit(auth(res),'action_refused',randomUUID(),'invalid_decision');throw parsed.error;}
  const v=parsed.data,r=await auth(res).db.rpc('platform_ai_decide',{p_id:v.id,p_token:v.token,p_confirm:v.confirm});dbError(r.error);
  if(!r.data?.ok)throw new ApiError(409,r.data?.code??'INVALID_PROPOSAL','Proposta inválida, expirada ou estado alterado. Solicite uma nova proposta.');res.json(r.data);
 });
 router.get('/alerts',async(req,res)=>{
  const v=platformPage.extend({severity:z.enum(['info','warning','critical']).optional(),status:z.enum(['open','resolved']).default('open')}).parse(req.query);
  const r=await executeTool(auth(res),'get_platform_alerts',{...v,limit:Math.min(v.limit,25)},randomUUID());res.json(r.data);
 });
 router.post('/alerts/:id/resolve-proposal',async(req,res)=>{
  z.object({}).strict().parse(req.body);const id=z.uuid().parse(req.params.id),r=await auth(res).db.rpc('platform_ai_propose',{p_action:'resolve_alert',p_target:id,p_plan:null});dbError(r.error);res.json(r.data);
 });
 router.get('/push/config',(_req,res)=>res.json(publicPushConfig()));
 router.get('/push/subscriptions',async(_req,res)=>{
  const a=auth(res),r=await a.db.from('push_subscriptions').select('endpoint,critical,warning,info').eq('user_id',a.userId).limit(5);dbError(r.error);res.json(r.data??[]);
 });
 router.post('/push/subscriptions',async(req,res)=>{
  const v=pushInput.parse(req.body),a=auth(res),r=await a.db.from('push_subscriptions').upsert({user_id:a.userId,endpoint:v.subscription.endpoint,keys:v.subscription.keys,...v.preferences,updated_at:new Date().toISOString()},{onConflict:'endpoint'});dbError(r.error);res.json({ok:true});
 });
 router.delete('/push/subscriptions',async(req,res)=>{
  const v=pushDelete.parse(req.body),a=auth(res),r=await a.db.from('push_subscriptions').delete().eq('user_id',a.userId).eq('endpoint',v.endpoint);dbError(r.error);res.json({ok:true});
 });
 router.get('/actors',async(req,res)=>{
  const v=z.object({search:z.string().trim().max(100).default('')}).parse(req.query);
  let q=auth(res).db.from('platform_actor_directory').select('id,name').order('name').order('id').limit(25);
  if(v.search)q=q.ilike('name',`%${v.search.replace(/[\\%_]/g,'\\$&')}%`);
  const r=await q;dbError(r.error);res.json(r.data??[]);
 });
 router.get('/overview',async(_req,res)=>{
  const db=auth(res).db;
  const results=await Promise.all([
   db.from('platform_shop_directory').select('id',{count:'exact',head:true}).eq('status','active'),
   db.from('saas_subscriptions').select('id',{count:'exact',head:true}).eq('status','active').or(`current_period_end.is.null,current_period_end.gt.${new Date().toISOString()}`),
   db.from('platform_shop_directory').select('id',{count:'exact',head:true}).in('status',['suspended','past_due']),
   db.from('audit_events').select(auditColumns).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(8),
  ]);
  results.forEach(r=>dbError(r.error));
  res.json({activeShops:results[0].count??0,activeSubscriptions:results[1].count??0,alerts:results[2].count??0,revenueCents:null,recent:results[3].data??[]});
 });
 router.get('/shops',async(req,res)=>{
  const v=platformPage.extend({search:z.string().trim().max(100).default(''),status:z.enum(['all','active','trial','suspended','past_due']).default('all'),sort:z.enum(['name','newest']).default('name')}).parse(req.query);
  let q=auth(res).db.from('platform_shop_directory').select('*',{count:'exact'}).order(v.sort==='newest'?'created_at':'name',{ascending:v.sort!=='newest'}).order('id');
  if(v.search)q=q.ilike('name',`%${v.search.replace(/[\\%_]/g,'\\$&')}%`);
  if(v.status!=='all')q=q.eq('status',v.status);
  const r=await q.range((v.page-1)*v.limit,v.page*v.limit-1);dbError(r.error);res.json({items:r.data??[],total:r.count??0,page:v.page,limit:v.limit});
 });
 router.get('/shops/:id',async(req,res)=>{
  const id=z.uuid().parse(req.params.id),r=await auth(res).db.from('platform_shop_directory').select('*').eq('id',id).maybeSingle();dbError(r.error);
  if(!r.data)throw new ApiError(404,'SHOP_NOT_FOUND','Barbearia não encontrada.');res.json(r.data);
 });
 router.get('/shops/:id/:section',async(req,res)=>{
  const id=z.uuid().parse(req.params.id),section=z.enum(Object.keys(platformSections) as [PlatformSection,...PlatformSection[]]).parse(req.params.section),v=platformPage.parse(req.query),s=platformSections[section];
  let q=auth(res).db.from(s.table).select(s.columns,{count:'exact'}).eq('barbershop_id',id);
  if(section==='team')q=q.in('role',['OWNER','BARBER']);
  const r=await q.order(s.order,{ascending:false}).order(section==='team'?'user_id':'id').range((v.page-1)*v.limit,v.page*v.limit-1);dbError(r.error);
  res.json({items:r.data??[],total:r.count??0,page:v.page,limit:v.limit});
 });
 router.patch('/shops/:id',async(req,res)=>{
  const id=z.uuid().parse(req.params.id),v=platformShopUpdate.parse(req.body);
  const r=await auth(res).db.rpc('platform_update_shop',{p_shop:id,p_name:v.name,p_status:v.status,p_plan:v.planId,p_billing_status:v.billingStatus,p_end:v.periodEnd,p_confirmed:v.confirmed});dbError(r.error);res.json({ok:true});
 });
 router.get('/plans',async(_req,res)=>{const r=await auth(res).db.from('saas_plans').select('id,code,name,price_cents,active,features,limits').order('code');dbError(r.error);res.json(r.data??[]);});
 router.patch('/plans/:id',async(req,res)=>{const id=z.uuid().parse(req.params.id),v=platformPlanUpdate.parse(req.body),r=await auth(res).db.rpc('platform_update_plan',{p_id:id,p_name:v.name,p_price:v.priceCents,p_active:v.active,p_confirmed:v.confirmed});dbError(r.error);res.json({ok:true});});
 router.get('/subscriptions',async(req,res)=>{
  const v=platformPage.extend({status:z.enum(['all','active','inactive','trialing','past_due','cancelled']).default('all')}).parse(req.query);
  let q=auth(res).db.from('saas_subscriptions').select('id,barbershop_id,plan,status,starts_at,current_period_end,trial_ends_at,cancelled_at,barbershops(name)',{count:'exact'});
  if(v.status!=='all')q=q.eq('status',v.status);
  const r=await q.order('created_at',{ascending:false}).order('id').range((v.page-1)*v.limit,v.page*v.limit-1);dbError(r.error);res.json({items:r.data??[],total:r.count??0,page:v.page,limit:v.limit});
 });
 router.get('/activity',async(req,res)=>{
  const v=platformPage.extend({technical:z.enum(['true','false']).default('false'),shop:z.uuid().optional(),user:z.uuid().optional(),role:z.enum(['OWNER','BARBER','CLIENT','PLATFORM_ADMIN','UNKNOWN']).optional(),type:z.string().regex(/^[a-z_.]+$/).max(80).optional(),from:z.iso.datetime().optional(),to:z.iso.datetime().optional()}).refine(v=>!v.from||!v.to||v.from<=v.to,{message:'Período inválido'}).parse(req.query);
  let q=auth(res).db.from('audit_events').select(auditColumns,{count:'exact'});
  if(v.technical!=='true')q=q.not('event_type','in','(platform_ai.question,platform_ai.answer,platform_ai.tool_success,platform.ai.question,platform.ai.answer,platform.ai.tool_success)');
  if(v.shop)q=q.eq('barbershop_id',v.shop);if(v.user)q=q.eq('actor_user_id',v.user);if(v.role)q=q.eq('actor_role',v.role);if(v.type)q=q.eq('event_type',v.type);if(v.from)q=q.gte('created_at',v.from);if(v.to)q=q.lte('created_at',v.to);
  const r=await q.order('created_at',{ascending:false}).order('id',{ascending:false}).range((v.page-1)*v.limit,v.page*v.limit-1);dbError(r.error);res.json({items:r.data??[],total:r.count??0,page:v.page,limit:v.limit});
 });
 router.use((_req,_res)=>{throw new ApiError(404,'NOT_FOUND','Rota não encontrada.');});
 return router;
}
