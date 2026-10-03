import webpush from 'web-push';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dbError } from './errors.js';

// Fixed push provider allowlist prevents SSRF through user-controlled subscriptions.
export function validPushEndpoint(value:string){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&
  (u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname==='web.push.apple.com'||u.hostname.endsWith('.notify.windows.com'));}catch{return false;}
}
export const pushInput=z.object({optIn:z.literal(true),subscription:z.object({endpoint:z.string().max(2048).refine(validPushEndpoint),expirationTime:z.number().nullable().optional(),keys:z.object({p256dh:z.string().regex(/^[A-Za-z0-9_-]{87}={0,2}$/),auth:z.string().regex(/^[A-Za-z0-9_-]{22}={0,2}$/)}).strict()}).strict(),preferences:z.object({critical:z.boolean(),warning:z.boolean(),info:z.boolean()}).strict()}).strict();
export const pushDelete=z.object({endpoint:z.string().max(2048).refine(validPushEndpoint)}).strict();
export function publicPushConfig(){return {configured:Boolean(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT),publicKey:process.env.VAPID_PUBLIC_KEY??null};}
type Delivery={alertId:string;subscriptionId:string;endpoint:string;keys:{p256dh:string;auth:string}};
export async function dispatchPlatformPush(db:SupabaseClient,send:typeof webpush.sendNotification=webpush.sendNotification){
 const publicKey=process.env.VAPID_PUBLIC_KEY,privateKey=process.env.VAPID_PRIVATE_KEY,subject=process.env.VAPID_SUBJECT;
 if(!publicKey||!privateKey||!subject)return {configured:false,sent:0,failed:0};
 const result=await db.rpc('platform_claim_push');dbError(result.error);let sent=0,failed=0;
 await Promise.all((result.data as Delivery[]).map(async d=>{
  let status='sent';
  try{
   if(!validPushEndpoint(d.endpoint)){status='expired';throw Error('invalid_endpoint');}
   // Generic lock-screen content; never send names, audit text, or financial data.
   await send({endpoint:d.endpoint,keys:d.keys},JSON.stringify({title:'FIO Platform',body:'Há um alerta que precisa da sua atenção.',tag:'fio-platform-alert',url:'/platform/alertas'}),{vapidDetails:{publicKey,privateKey,subject},TTL:300,timeout:5000,urgency:'normal'});sent++;
  }catch(e){failed++;if([404,410].includes((e as {statusCode?:number}).statusCode??0))status='expired';else if(status!=='expired')status='failed';}
  const done=await db.rpc('platform_finish_push',{p_alert:d.alertId,p_subscription:d.subscriptionId,p_status:status});dbError(done.error);
 }));return {configured:true,sent,failed};
}
