import {afterEach,describe,it,expect,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {dispatchAppointmentPush} from '../server/appointment-push';
import {appointmentLink} from '../src/lib/appointment-link';
afterEach(()=>vi.unstubAllEnvs());
describe('notificações: transporte e destino',()=>{
 it('não envia sem credenciais',async()=>{vi.stubEnv('VAPID_PUBLIC_KEY','');const rpc=vi.fn();expect(await dispatchAppointmentPush({rpc} as unknown as SupabaseClient)).toEqual({configured:false,sent:0,failed:0});expect(rpc).not.toHaveBeenCalled();});
 it('envia conteúdo discreto e encerra inscrição que retorna 410',async()=>{
  for(const k of ['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT'])vi.stubEnv(k,'test-only');
  const items=[1,2].map(n=>({queueId:`q${n}`,deviceId:`d${n}`,endpoint:`https://fcm.googleapis.com/${n}`,keys:{p256dh:'public',auth:'test'},tag:`fio-appointment-${n}`,url:'/client/agenda?appointment=test',kind:'created'}));
  const rpc=vi.fn().mockImplementation(async(name:string)=>({data:name==='claim_appointment_push'?items:null,error:null}));
  const send=vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce({statusCode:410});
  expect(await dispatchAppointmentPush({rpc} as unknown as SupabaseClient,send)).toEqual({configured:true,sent:1,failed:1});
  expect(JSON.parse(send.mock.calls[0][1])).toMatchObject({title:'Sua agenda',body:'Há uma atualização na sua agenda. Abra para conferir.'});
  expect(rpc).toHaveBeenCalledWith('finish_appointment_push',{p_queue:'q2',p_device:'d2',p_status:'expired'});
 });
 it('localiza o push no idioma salvo do destinatário',async()=>{
  for(const k of ['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT'])vi.stubEnv(k,'test-only');
  const items=[{queueId:'q-en',deviceId:'d-en',endpoint:'https://fcm.googleapis.com/en',keys:{p256dh:'public',auth:'test'},tag:'fio-appointment-en',url:'/client/agenda?appointment=test',kind:'reminder',locale:'en'}];
  const rpc=vi.fn().mockImplementation(async(name:string)=>({data:name==='claim_appointment_push'?items:null,error:null}));
  const send=vi.fn().mockResolvedValue({});
  expect(await dispatchAppointmentPush({rpc} as unknown as SupabaseClient,send)).toEqual({configured:true,sent:1,failed:0});
  expect(JSON.parse(send.mock.calls[0][1])).toMatchObject({title:'Your schedule',body:'You have an appointment in the next 24 hours. Open your schedule.'});
 });
 it('nega redirecionamentos externos e preserva apenas destino de agenda validado',()=>{const id='00000000-0000-4000-8000-000000000001',path=`/client/agenda?appointment=${id}&shopId=${id}`;expect(appointmentLink(path)).toBe(path);for(const value of ['https://evil.test'+path,'//evil.test'+path,'/owner/configuracoes','javascript:alert(1)','/client/agenda?appointment=x'])expect(appointmentLink(value)).toBeNull();});
});
