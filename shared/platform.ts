import { z } from 'zod';
export type PlatformAdmin={user_id:string;display_name:string;role:'PLATFORM_ADMIN'};
export type PlatformShop={id:string;name:string;slug:string;logo_url:string|null;owner_name:string|null;plan:string;plan_id:string;status:string;platform_status:string;billing_status:string;current_period_end:string|null;last_activity:string|null;created_at:string};
export type SaasPlan={id:string;code:string;name:string;price_cents:number|null;active:boolean;features:Record<string,unknown>;limits:Record<string,unknown>};
export type AuditEvent={id:string;actor_user_id:string;actor_name:string|null;actor_role:string;event_type:string;description:string;barbershop_id:string|null;created_at:string;barbershops:{name:string}|null};
export type Page<T>={items:T[];total:number;page:number;limit:number};
export type PlatformOverview={activeShops:number;activeSubscriptions:number;alerts:number;revenueCents:null;recent:AuditEvent[]};
export const platformPage=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),limit:z.coerce.number().int().min(1).max(50).default(25)});
export const platformShopUpdate=z.object({name:z.string().trim().min(2).max(100),status:z.enum(['active','trial','suspended']),planId:z.uuid(),billingStatus:z.enum(['active','inactive','trialing','past_due','cancelled']),periodEnd:z.iso.datetime().nullable(),confirmed:z.literal(true)}).strict();
export const platformPlanUpdate=z.object({name:z.string().trim().min(2).max(100),priceCents:z.number().int().min(0).max(10000000).nullable(),active:z.boolean(),confirmed:z.literal(true)}).strict();
export const platformSections={
 team:{table:'memberships',columns:'user_id,display_name,role,active',order:'display_name'},
 clients:{table:'customers',columns:'id,name,phone,created_at',order:'created_at'},
 agenda:{table:'appointments',columns:'id,starts_at,ends_at,status,price_cents',order:'starts_at'},
 subscriptions:{table:'client_subscriptions',columns:'id,name,remaining_cuts,status,expires_at',order:'expires_at'},
 reviews:{table:'reviews',columns:'id,rating,comment,created_at',order:'created_at'},
} as const;
export type PlatformSection=keyof typeof platformSections;
