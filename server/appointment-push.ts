import webpush from 'web-push';
import type {SupabaseClient} from '@supabase/supabase-js';
import {validPushEndpoint,publicPushConfig} from './platform-push.js';
import {dbError} from './errors.js';

type PushLocale='pt-BR'|'en'|'es'|'fr'|'de'|'it';
type Delivery={queueId:string;deviceId:string;endpoint:string;keys:{p256dh:string;auth:string};tag:string;url:string;kind:string;locale?:PushLocale};

const COPY:Record<PushLocale,{title:string;reminder:string;change:string}>={
 'pt-BR':{title:'Sua agenda',reminder:'Você tem um horário nas próximas 24 horas. Abra a agenda.',change:'Há uma atualização na sua agenda. Abra para conferir.'},
 en:{title:'Your schedule',reminder:'You have an appointment in the next 24 hours. Open your schedule.',change:'There is an update to your schedule. Open it to check.'},
 es:{title:'Tu agenda',reminder:'Tienes una cita en las próximas 24 horas. Abre tu agenda.',change:'Hay una actualización en tu agenda. Ábrela para revisarla.'},
 fr:{title:'Votre planning',reminder:'Vous avez un rendez-vous dans les prochaines 24 heures. Ouvrez votre planning.',change:'Votre planning a été mis à jour. Ouvrez-le pour vérifier.'},
 de:{title:'Dein Terminplan',reminder:'Du hast in den nächsten 24 Stunden einen Termin. Öffne deinen Terminplan.',change:'Dein Terminplan wurde aktualisiert. Öffne ihn zur Kontrolle.'},
 it:{title:'La tua agenda',reminder:'Hai un appuntamento nelle prossime 24 ore. Apri la tua agenda.',change:'La tua agenda è stata aggiornata. Aprila per controllare.'}
};

const localeCopy=(locale?:string)=>COPY[(locale&&locale in COPY?locale:'pt-BR') as PushLocale];

export async function dispatchAppointmentPush(db:SupabaseClient,send:typeof webpush.sendNotification=webpush.sendNotification){
 if(!publicPushConfig().configured)return {configured:false,sent:0,failed:0};
 const claim=await db.rpc('claim_appointment_push');dbError(claim.error);
 let sent=0,failed=0;
 for(const d of (claim.data??[]) as Delivery[]){
  let status='sent';
  try{
   if(!validPushEndpoint(d.endpoint)){status='expired';throw Error('INVALID_ENDPOINT');}
   const copy=localeCopy(d.locale);
   const body=d.kind==='reminder'?copy.reminder:copy.change;
   await send({endpoint:d.endpoint,keys:d.keys},JSON.stringify({title:copy.title,body,tag:d.tag,url:d.url}),{vapidDetails:{publicKey:process.env.VAPID_PUBLIC_KEY!,privateKey:process.env.VAPID_PRIVATE_KEY!,subject:process.env.VAPID_SUBJECT!},TTL:300,timeout:5000,urgency:'normal'});sent++;
  }catch(e){failed++;status=status==='expired'||[404,410].includes((e as {statusCode?:number}).statusCode??0)?'expired':'failed';}
  const result=await db.rpc('finish_appointment_push',{p_queue:d.queueId,p_device:d.deviceId,p_status:status});dbError(result.error);
 }
 return {configured:true,sent,failed};
}
