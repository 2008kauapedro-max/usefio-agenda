// Only used by the explicitly selected preview Vite config. No real Auth or network.
import type { PlatformShop,SaasPlan,AuditEvent } from '../../shared/platform';
export class RequestError extends Error{constructor(public code:string,message:string){super(message);}}
export const supabase={auth:{signOut:async()=>{location.href='/acesso/plataforma';},signInWithPassword:async()=>({error:null})}};
const shop:PlatformShop={id:'10000000-0000-4000-8000-000000000001',name:'Studio de Teste',slug:'studio-teste',logo_url:null,owner_name:'Responsável de Teste',plan:'PRO',plan_id:'10000000-0000-4000-8000-000000000002',status:'active',platform_status:'active',billing_status:'active',current_period_end:null,last_activity:null,created_at:'2026-09-01T12:00:00Z'};
const plans:SaasPlan[]=[{id:shop.plan_id,code:'PRO',name:'FIO PRO',price_cents:null,active:true,features:{ai_enabled:true},limits:{ai_daily_limit:100}},{id:'10000000-0000-4000-8000-000000000003',code:'FREE',name:'FIO FREE',price_cents:0,active:true,features:{ai_enabled:false},limits:{ai_daily_limit:0}}];
const events:AuditEvent[]=[];
export async function api<T>(path:string,_shop?:string,body?:unknown):Promise<T>{
 if(path==='/platform/ai')return {requestId:crypto.randomUUID(),message:'Há uma barbearia de teste. Receita SaaS confirmada indisponível.',tools:['get_platform_summary','get_saas_revenue'],proposals:[{id:shop.id,token:shop.id,action:'suspend_shop',target:shop.id,targetName:shop.name,planId:null,expiresAt:new Date(Date.now()+600000).toISOString()}]} as T;
 if(path==='/platform/push/config')return {configured:false,publicKey:null} as T;
 if(path.startsWith('/platform/alerts'))return {items:[{id:shop.id,title:'Barbearia suspensa',description:'Evento sintético para revisão.',severity:'warning',status:'open',created_at:new Date().toISOString(),barbershop_id:shop.id}],total:1} as T;
 const u=new URL(path,'http://localhost'),page=Number(u.searchParams.get('page')||1),pack=(items:unknown[])=>({items:page===1?items:[],total:items.length,page,limit:25});
 if(body){if(u.pathname.startsWith('/platform/shops/')){const b=body as {name:string;status:string;planId:string;billingStatus:string;periodEnd:string|null};Object.assign(shop,{name:b.name,status:b.status,platform_status:b.status,plan_id:b.planId,plan:plans.find(p=>p.id===b.planId)?.code,billing_status:b.billingStatus,current_period_end:b.periodEnd});}else{const p=plans.find(p=>u.pathname.endsWith(p.id));if(p){const b=body as {name:string;priceCents:number|null;active:boolean};Object.assign(p,{name:b.name,price_cents:b.priceCents,active:b.active});}}return {ok:true} as T;}
 let data:unknown;
 if(u.pathname==='/platform/me')data={user_id:'10000000-0000-4000-8000-000000000099',display_name:'Operador de Teste',role:'PLATFORM_ADMIN'};
 else if(u.pathname==='/platform/overview')data={activeShops:1,activeSubscriptions:1,alerts:0,revenueCents:null,recent:events};
 else if(u.pathname==='/platform/plans')data=plans;
 else if(u.pathname==='/platform/actors')data=[{id:'10000000-0000-4000-8000-000000000099',name:'Operador de Teste'}];
 else if(u.pathname==='/platform/shops')data=pack(!u.searchParams.get('search')||shop.name.toLowerCase().includes(u.searchParams.get('search')!.toLowerCase())?[shop]:[]);
 else if(u.pathname===`/platform/shops/${shop.id}`)data=shop;
 else if(u.pathname.endsWith('/team'))data=pack([{user_id:'test',display_name:'Responsável de Teste',role:'OWNER',active:true}]);
 else if(u.pathname==='/platform/subscriptions')data=pack([{id:'test',plan:shop.plan,status:shop.billing_status,current_period_end:null,barbershops:{name:shop.name}}]);
 else data=pack([]);
 return JSON.parse(JSON.stringify(data)) as T;
}
