import {useI18n} from '../i18n';
import {useEffect,useState} from 'react';
import type {Appointment} from '../../shared/domain';
import type {WorkspaceProps} from '../pages/Workspace';
import {dayKey} from '../pages/Workspace';
import {api} from '../lib/api';
import {Field,Modal} from './ui';
import {BookingCalendar} from './BookingCalendar';

export function BookingFlow(p:WorkspaceProps&{onClose:()=>void;appointment?:Appointment}){
 const {t,formatDate,formatTime,formatCurrency}=useI18n();
 const {data,appointment:a}=p,zone=data.shop.timezone;
 const services=data.services.filter(s=>s.active),solo=data.shop.operation_mode==='SOLO',role=data.membership.role,isClient=role==='CLIENT',barbers=data.team.filter(t=>t.active&&(t.role==='BARBER'||(solo&&t.role==='OWNER'))&&(role!=='BARBER'||t.user_id===data.membership.user_id));
 const lockedProvider=role==='BARBER';
 const defaultBarber=a?.barber_id??(role==='BARBER'?data.membership.user_id:barbers.length===1?(barbers[0]?.user_id??'any'):'any');
 const firstStep=lockedProvider?1:0;
 const [step,setStep]=useState(a?2:firstStep),[barber,setBarber]=useState(defaultBarber);
 const [service,setService]=useState(a?.service_id??services[0]?.id??''),[client,setClient]=useState(a?.client_id??data.customers.find(c=>c.user_id===data.membership.user_id)?.id??data.customers[0]?.id??'');
 const [date,setDate]=useState(dayKey(new Date().toISOString(),zone)),[slot,setSlot]=useState(''),[slots,setSlots]=useState<string[]>([]),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0),[useSubscription,setUseSubscription]=useState(false);
 const svc=services.find(s=>s.id===service),sub=data.subscriptions.find(s=>(!s.client_id||s.client_id===client)&&s.status==='active'&&new Date(s.expires_at)>new Date(slot||Date.now())&&s.remaining_cuts>0);
 const clock=(v:string)=>formatTime(v,{timeZone:zone,hour:'2-digit',minute:'2-digit'});
 useEffect(()=>{
  let alive=true;setSlot('');setSlots([]);setLoading(true);setError('');
  if(!service||!barber||!date){setLoading(false);return;}
  const request=p.demo?Promise.resolve(['09:00','10:00','14:00','15:00'].map(t=>({starts_at:new Date(`${date}T${t}:00-03:00`).toISOString()})).filter(x=>Date.parse(x.starts_at)>Date.now())):api<{starts_at:string}[]>(`/slots?barberId=${barber}&serviceId=${service}&day=${date}`,data.shop.id);
  void request.then(rows=>{if(alive)setSlots(rows.map(r=>r.starts_at));}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};
 },[barber,service,date,revision,p.demo,data.shop.id]);
 async function confirm(){
  if(!slot||!svc||!client||busy)return;setBusy(true);setError('');
  try{
   let assigned=barber==='any'?barbers[0]?.user_id:barber;
   if(p.demo){if(!assigned)throw Error(t('booking.noProfessional'));p.updateDemo(d=>({...d,appointments:a?d.appointments.map(x=>x.id===a.id?{...x,starts_at:slot,ends_at:new Date(Date.parse(slot)+svc.duration_minutes*60000).toISOString()}:x):[...d.appointments,{id:crypto.randomUUID(),client_id:client,barber_id:assigned!,service_id:service,starts_at:slot,ends_at:new Date(Date.parse(slot)+svc.duration_minutes*60000).toISOString(),status:'scheduled',price_cents:svc.price_cents,subscription_id:useSubscription?sub?.id:null}]}));}
   else if(a)await api(`/appointments/${a.id}/reschedule`,data.shop.id,{startsAt:slot,confirmed:true});
   else {const result=await api<{id:string;barberId:string}>('/appointments',data.shop.id,{barberId:barber==='any'?null:barber,serviceId:service,clientId:client,startsAt:slot,useSubscription});assigned=result.barberId;}
   // A successful mutation must not be presented as failed if only refreshing fails.
   if(!p.demo)await p.refresh().catch(()=>undefined);
   p.notify(`${p.demo?t('booking.demoPrefix'):''}${a?t('booking.rescheduled'):t('booking.created')} ${data.team.find(member=>member.user_id===assigned)?.display_name??t('booking.assignedProfessional')}.`);p.onClose();
  }catch(e){setError((e as Error).message);setSlot('');setStep(2);}finally{setBusy(false);}
 }
 return <Modal title={a?(isClient?t('booking.rescheduleClient'):t('booking.rescheduleStaff')):(isClient?t('booking.newClient'):t('booking.newStaff'))} onClose={()=>{if(!busy)p.onClose();}}><div className="booking-flow">
  <ol className="booking-steps" aria-label={t('booking.stepsLabel')}>{[t('booking.stepProfessional'),t('booking.stepService'),t('booking.stepTime'),t('booking.stepReview')].map((label,i)=>lockedProvider&&i===0?null:<li key={label} aria-current={step===i?'step':undefined} className={step===i?'active':''}><span>{lockedProvider?i:i+1}</span>{label}</li>)}</ol>
  {p.demo&&<p className="muted">{t('booking.demoTimes')}</p>}
  {step===0&&<><div className="booking-section-head"><span className="eyebrow">{t('booking.professionalEyebrow')}</span><h3>{t('booking.chooseProfessional')}</h3><p>{t('booking.professionalDesc')}</p></div><div className="booking-options">{data.membership.role!=='BARBER'&&barbers.length>1&&<button className={barber==='any'?'selected':''} onClick={()=>setBarber('any')} aria-pressed={barber==='any'}><span className="avatar">↗</span><span><strong>{t('booking.noPreference')}</strong><small>{t('booking.noPreferenceDesc')}</small></span></button>}{barbers.map(b=><button key={b.user_id} className={barber===b.user_id?'selected':''} onClick={()=>setBarber(b.user_id)} aria-pressed={barber===b.user_id}><span className="avatar">{b.avatar_url?<img src={b.avatar_url} alt=""/>:b.display_name.slice(0,2)}</span><span><strong>{b.display_name}</strong><small>{solo?t('booking.stepProfessional'):t('booking.shopProfessional')}</small></span></button>)}</div></>}
  {step===1&&<><div className="booking-section-head"><span className="eyebrow">{t('booking.serviceEyebrow')}</span><h3>{isClient?t('booking.chooseService'):t('booking.clientService')}</h3><p>{t('booking.serviceDesc')}</p></div><div className="booking-options">{services.map(s=><button key={s.id} className={service===s.id?'selected':''} onClick={()=>setService(s.id)} aria-pressed={service===s.id}><span><strong>{s.name}</strong><small>{s.duration_minutes} min · {formatCurrency(s.price_cents/100)}</small>{s.description&&<small>{s.description}</small>}</span></button>)}</div>{data.membership.role!=='CLIENT'&&<Field label={t('booking.client')}><select value={client} onChange={e=>{setClient(e.target.value);setUseSubscription(false);}}>{data.customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}{!client&&<p role="alert">{t('booking.needClient')}</p>}</>}
  {step===2&&<BookingCalendar shopId={data.shop.id} barberId={barber} serviceId={service} zone={zone} date={date} slot={slot} slots={slots} loading={loading} error={error} demo={p.demo} onDateChange={setDate} onSlotChange={setSlot} onRefresh={()=>setRevision(r=>r+1)}/>}
  {step===3&&<section className="booking-summary"><h3>{t('booking.reviewTitle')}</h3><dl><dt>{t('booking.shop')}</dt><dd>{data.shop.public_title||data.shop.name}</dd><dt>{t('booking.stepProfessional')}</dt><dd>{barber==='any'?t('booking.assignedOnConfirm'):data.team.find(b=>b.user_id===barber)?.display_name}</dd><dt>{t('booking.stepService')}</dt><dd>{svc?.name} · {svc?.duration_minutes} min</dd><dt>{t('booking.time')}</dt><dd>{formatDate(slot,{timeZone:zone,dateStyle:'short'})} {t('booking.at')} {clock(slot)}</dd></dl>{!a&&sub&&<label className="check-row"><input type="checkbox" checked={useSubscription} onChange={e=>setUseSubscription(e.target.checked)}/>{t('booking.useBenefit',{name:sub.name,count:sub.remaining_cuts})}</label>}<p className="muted">{t('booking.noPayment')}</p></section>}
  {error&&<p className="notice" role="alert">{error} {t('booking.retryAvailable')}</p>}
  <div className="booking-footer">{step>(a?2:firstStep)&&<button className="secondary" disabled={busy} onClick={()=>setStep(s=>s-1)}>{t('booking.back')}</button>}{step<3?<button className="primary" disabled={loading&&step===2||step===0&&!barber||step===1&&(!service||!client)||step===2&&!slot} onClick={()=>setStep(s=>s+1)}>{t('booking.continue')}</button>:<button className="primary" disabled={busy||!slot} onClick={()=>void confirm()}>{busy?t('booking.confirming'):a?t('booking.confirmReschedule'):t('booking.confirmAppointment')}</button>}</div>
 </div></Modal>;
}
