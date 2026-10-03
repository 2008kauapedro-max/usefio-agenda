import { useI18n } from '../i18n';
import { saveLocalePreferences } from '../i18n/supabaseLocale';
import { WhatsAppIcon } from '../components/WhatsAppIcon';
import { LanguageSettings } from '../components/LanguageSettings';
import {StaffSchedule} from '../components/StaffSchedule';
import {AppointmentPeriod} from '../components/AppointmentPeriod';
import {PushSettings} from '../components/PushSettings';
import {BookingFlow as BookingModal} from '../components/BookingFlow';
import { useState,useEffect,type FormEvent,type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight,ArrowLeft,ChevronLeft,ChevronRight,Plus,Scissors,Clock3,Users,CalendarDays,Check,Search,Copy,SlidersHorizontal,MessageCircle,Star,Link as LinkIcon,Download,X,Share2,SquarePlus,UserRound,Store,ShieldCheck,KeyRound,LogOut,Palette,Eye,EyeOff,Info,Crown,CircleHelp,FileText,Shield,MessageSquareText,Bug,Send,ImagePlus,RefreshCw,Languages } from 'lucide-react';
import type { Bootstrap,Appointment,Service } from '../../shared/domain';
import { money } from '../../shared/domain';
import { api,supabase } from '../lib/api';
import { optimizeImage } from '../lib/images';
import { planAllows } from '../../shared/entitlements';
import { Empty,Field,Modal,PageTitle,ArrowLink } from '../components/ui';
export interface WorkspaceProps {data:Bootstrap;demo:boolean;base:string;refresh:()=>Promise<void>;notify:(text:string)=>void;updateDemo:(fn:(d:Bootstrap)=>Bootstrap)=>void;canInstall?:boolean;installApp?:()=>Promise<void>}
const statusLabels={scheduled:'Agendado',confirmed:'Confirmado',in_service:'Em atendimento',completed:'Concluído',cancelled:'Cancelado',no_show:'Falta'};
const statusHelp={
 scheduled:'Este horário já está reservado na agenda.',
 confirmed:'Este horário está reservado automaticamente na agenda.',
 in_service:'O atendimento está em andamento.',
 completed:'Atendimento concluído e salvo no histórico.',
 cancelled:'Este horário foi cancelado e saiu da agenda ativa.',
 no_show:'O cliente não compareceu e a falta foi registrada.'
};
const whats=(phone?:string|null)=>{const digits=(phone??'').replace(/\D/g,'');if(!digits)return '';return `https://wa.me/${digits.startsWith('55')?digits:`55${digits}`}`;};
const accentContrast=(hex:string)=>{const value=hex.replace('#','');if(!/^[0-9a-f]{6}$/i.test(value))return '#050505';const r=parseInt(value.slice(0,2),16),g=parseInt(value.slice(2,4),16),b=parseInt(value.slice(4,6),16);return (r*299+g*587+b*114)/1000<145?'#ffffff':'#050505';};
export const dayKey=(date:string,zone:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));
function MemberAvatar({member,className=''}:{member:{display_name:string;avatar_url?:string|null};className?:string}){return <span className={`avatar ${className}`}>{member.avatar_url?<img src={member.avatar_url} alt=""/>:member.display_name.split(' ').map(n=>n[0]).slice(0,2).join('')}</span>;}

type Customer=Bootstrap['customers'][number];

const firstName=(name?:string|null,fallback='Cliente')=>
 (name??fallback).trim().split(/\s+/)[0]||fallback;

function CustomerAvatar({
 customer,
 data,
 className=''
}:{
 customer?:Customer|null;
 data:Bootstrap;
 className?:string
}){
 const {t}=useI18n();
 const membership=
  customer?.user_id
   ?data.team.find(member=>member.user_id===customer.user_id)
   :undefined;

 const name=customer?.name??t('ws.client');

 return <span className={`avatar customer-avatar ${className}`}>
  {membership?.avatar_url
   ?<img src={membership.avatar_url} alt=""/>
   :name.split(' ').map(n=>n[0]).slice(0,2).join('')}
 </span>;
}

type HomeSlide={eyebrow:string;title:string;text:string;action:string;kind:'route'|'public'|'install'|'info';to?:string};
function HomeCarousel(p:WorkspaceProps){
 const {t}=useI18n();
 const navigate=useNavigate(),role=p.data.membership.role;
 const shopName=p.data.shop.public_title||p.data.shop.name;
 const slides:HomeSlide[]=role==='CLIENT'
  ?[
    {eyebrow:t('home.client.s1e'),title:t('home.client.s1t',{shop:shopName}),text:t('home.client.s1x'),action:t('home.client.s1a'),kind:'route',to:`${p.base}/agenda?novo=1`},
    {eyebrow:t('home.client.s2e'),title:t('home.client.s2t',{shop:shopName}),text:t('home.client.s2x'),action:t('home.client.s2a'),kind:'install'},
    {eyebrow:t('home.client.s3e'),title:t('home.client.s3t'),text:t('home.client.s3x'),action:t('home.client.s3a'),kind:'route',to:`${p.base}/agenda`}
   ]
  :role==='OWNER'
   ?[
     {eyebrow:t('home.owner.s1e'),title:t('home.owner.s1t'),text:t('home.owner.s1x'),action:t('home.owner.s1a'),kind:'public'},
     {eyebrow:t('home.owner.s2e'),title:t('home.owner.s2t'),text:t('home.owner.s2x'),action:t('home.owner.s2a'),kind:'route',to:`${p.base}/agenda`},
     {eyebrow:t('home.owner.s3e'),title:t('home.owner.s3t'),text:t('home.owner.s3x'),action:t('home.owner.s3a'),kind:'route',to:`${p.base}/configuracoes`},
     {eyebrow:t('home.owner.s4e'),title:t('home.owner.s4t'),text:t('home.owner.s4x'),action:t('home.owner.s4a'),kind:'info'}
    ]
   :[
     {eyebrow:t('home.staff.s1e'),title:t('home.staff.s1t'),text:t('home.staff.s1x'),action:t('home.staff.s1a'),kind:'route',to:`${p.base}/agenda`},
     {eyebrow:t('home.staff.s2e'),title:t('home.staff.s2t'),text:t('home.staff.s2x'),action:t('home.staff.s2a'),kind:'install'},
     {eyebrow:t('home.staff.s3e'),title:t('home.staff.s3t'),text:t('home.staff.s3x'),action:t('home.staff.s3a'),kind:'info'}
    ];
 const [index,setIndex]=useState(0);
 useEffect(()=>{setIndex(0);},[role,p.data.shop.id]);
 useEffect(()=>{if(slides.length<2)return;const timer=window.setInterval(()=>setIndex(current=>(current+1)%slides.length),6500);return()=>window.clearInterval(timer);},[role,p.data.shop.id,slides.length]);
 const run=async(slide:HomeSlide)=>{
  if(slide.kind==='route'&&slide.to){navigate(slide.to);return;}
  if(slide.kind==='public'){window.open(`/${p.data.shop.slug}`,'_blank','noopener,noreferrer');return;}
  if(slide.kind==='install'){
   if(p.canInstall)await p.installApp?.();
   else p.notify(t('home.installBrowser'));
  }
 };
 return <section className="home-carousel home-carousel-featured" aria-label={t('home.carouselAria')}>
  <div className="home-carousel-track">{slides.map((slide,i)=><article key={`${slide.eyebrow}-${i}`} className={`home-carousel-slide ${i===index?'active':''}`} aria-hidden={i!==index}>
   <div className="home-carousel-copy"><p className="eyebrow">{slide.eyebrow}</p><h2>{slide.title}</h2><p>{slide.text}</p></div>
   <button type="button" className={`secondary home-carousel-action ${slide.kind==='info'?'future':''}`} disabled={slide.kind==='info'} tabIndex={i===index?0:-1} onClick={()=>void run(slide)}>{slide.action}{slide.kind!=='info'&&<ArrowUpRight size={16}/>}</button>
  </article>)}</div>
  <div className="home-carousel-footer">
   <div className="home-carousel-dots">{slides.map((slide,i)=><button type="button" key={slide.eyebrow} className={`home-carousel-dot ${i===index?'active':''}`} aria-label={t('home.showHighlight',{number:i+1})} onClick={()=>setIndex(i)}/>)}</div>
   <div className="home-carousel-nav"><button type="button" aria-label={t('home.previousHighlight')} onClick={()=>setIndex(current=>(current-1+slides.length)%slides.length)}><ChevronLeft size={16}/></button><button type="button" aria-label={t('home.nextHighlight')} onClick={()=>setIndex(current=>(current+1)%slides.length)}><ChevronRight size={16}/></button></div>
  </div>
 </section>;
}
function StaffHome(p:WorkspaceProps){
 const {t,formatDate,formatTime}=useI18n();
 const navigate=useNavigate();
 const role=p.data.membership.role;
 const shopName=p.data.shop.public_title||p.data.shop.name;
 const now=Date.now();

 const openPublic=()=>
  window.open(
   `/${p.data.shop.slug}`,
   '_blank',
   'noopener,noreferrer'
  );

 const next=p.data.appointments
  .filter(a=>
   ['scheduled','confirmed','in_service'].includes(a.status)&&
   Date.parse(a.ends_at)>now&&
   (
    role!=='BARBER'||
    a.barber_id===p.data.membership.user_id
   )
  )
  .sort(
   (a,b)=>
    Date.parse(a.starts_at)-
    Date.parse(b.starts_at)
  )[0];

 const customer=
  next
   ?p.data.customers.find(c=>c.id===next.client_id)
   :undefined;

 const service=
  next
   ?p.data.services.find(s=>s.id===next.service_id)
   :undefined;

 const professional=
  next
   ?p.data.team.find(t=>t.user_id===next.barber_id)
   :undefined;

 const happening=Boolean(
  next&&
  Date.parse(next.starts_at)<=now&&
  Date.parse(next.ends_at)>now
 );

 return <>

  <section className="home-hub-intro">

   <div>
    <span className="eyebrow">{t('home.overview')}</span>
    <h1>{shopName}</h1>
    <p>
     {role==='OWNER'?t('home.ownerDesc'):t('home.staffDesc')}
    </p>
   </div>

   {role==='OWNER'&&
    <button
     type="button"
     className="secondary"
     onClick={openPublic}
    >
     <LinkIcon size={17}/>
     {t('home.openMiniSite')}
    </button>
   }

  </section>

  {next&&
   <button
    type="button"
    className={
     `next-appointment-card ${happening?'is-now':''}`
    }
    onClick={()=>
     navigate(
      `${p.base}/agenda?appointment=${next.id}`
     )
    }
   >

    <div className="next-appointment-time">

     <span className="eyebrow">
      {happening?t('home.nowService'):t('home.nextService')}
     </span>

     <strong>
      {formatTime(next.starts_at,{timeZone:p.data.shop.timezone})}
     </strong>

     <small>
      {formatDate(next.starts_at,{timeZone:p.data.shop.timezone,weekday:'long',day:'2-digit',month:'short'})}
     </small>

    </div>

    <CustomerAvatar
     customer={customer}
     data={p.data}
    />

    <div className="next-appointment-person">

     <strong>
      {firstName(customer?.name,t('ws.client'))}
     </strong>

     <span>
      {service?.name??t('ws.service')}
     </span>

     {role==='OWNER'&&
      <small>
       {t('home.withProfessional',{name:professional?.display_name??t('ws.professional')})}
      </small>
     }

    </div>

    <span className={`status ${next.status}`}>
     {happening?t('home.now'):t(`status.${next.status}`)}
    </span>

    <ArrowUpRight size={19}/>

   </button>
  }

  <HomeCarousel {...p}/>

  <section
   className="home-quick-section"
   aria-label={t('home.shortcuts')}
  >

   <div className="home-section-heading">
    <div>
     <span className="eyebrow">{t('home.shortcuts')}</span>
     <h2>
      {t('home.shortcutsTitle')}
     </h2>
    </div>
   </div>

   <div className="home-quick-grid">

    <button
     type="button"
     onClick={()=>navigate(`${p.base}/agenda`)}
    >
     <span><CalendarDays size={19}/></span>
     <div>
      <strong>{t('nav.agenda')}</strong>
      <small>
       {t('home.agendaDesc')}
      </small>
     </div>
     <ArrowUpRight size={17}/>
    </button>

    {role==='OWNER'&&
     <button
      type="button"
      onClick={()=>navigate(`${p.base}/clientes`)}
     >
      <span><Users size={19}/></span>
      <div>
       <strong>{t('nav.clients')}</strong>
       <small>
        {t('home.clientsDesc')}
       </small>
      </div>
      <ArrowUpRight size={17}/>
     </button>
    }

    <button
     type="button"
     onClick={()=>navigate(`${p.base}/servicos`)}
    >
     <span><Scissors size={19}/></span>
     <div>
      <strong>{t('nav.services')}</strong>
      <small>
       {t('home.servicesDesc')}
      </small>
     </div>
     <ArrowUpRight size={17}/>
    </button>

    <button
     type="button"
     onClick={()=>navigate(`${p.base}/configuracoes`)}
    >
     <span><Palette size={19}/></span>
     <div>
      <strong>
       {role==='OWNER'?t('home.customization'):t('home.settings')}
      </strong>
      <small>
       {role==='OWNER'?t('home.customizationDesc'):t('home.settingsDesc')}
      </small>
     </div>
     <ArrowUpRight size={17}/>
    </button>

   </div>

  </section>

  <InstallNudge {...p}/>

 </>;
}
export function Dashboard(p:WorkspaceProps){
 const {t,formatDate}=useI18n();
 const {data,base}=p,role=data.membership.role,navigate=useNavigate(),today=dayKey(new Date().toISOString(),data.shop.timezone);
 if(role!=='CLIENT')return <StaffHome {...p}/>;
 const next=data.appointments.filter(a=>['scheduled','confirmed','in_service'].includes(a.status)&&new Date(a.ends_at)>new Date()).slice(0,4);
 return <><PageTitle eyebrow={formatDate(new Date(),{timeZone:data.shop.timezone,weekday:'long',day:'numeric',month:'long'})} title={t('dashboard.bookTitle')} action={<button className="primary" onClick={()=>navigate(`${base}/agenda?novo=1`)}><Plus size={18}/>{t('dashboard.bookAction')}</button>}/><HomeCarousel {...p}/><section className="client-welcome">{data.shop.cover_url&&<img className="client-cover" src={data.shop.cover_url} alt=""/>}<div><h2>{data.shop.public_title||data.shop.name}</h2><p>{data.shop.public_description||t('dashboard.defaultShopDesc')}</p><div className="page-actions"><button className="secondary" onClick={()=>navigate(`${base}/profissionais`)}>{t('dashboard.professionals')}</button><button className="secondary" onClick={()=>navigate(`${base}/servicos`)}>{t('dashboard.services')}</button>{data.shop.whatsapp&&<a className="secondary" href={whats(data.shop.whatsapp)} target="_blank" rel="noreferrer">{t('dashboard.contact')}</a>}</div></div></section><section><div className="section-title"><h2>{t('dashboard.upcoming')}</h2><ArrowLink onClick={()=>navigate(`${base}/agenda`)}>{t('dashboard.viewAgenda')}</ArrowLink></div>{next.length?<div className="appointment-list">{next.map(a=><AppointmentRow key={a.id} appointment={a} data={data} onClick={()=>navigate(`${base}/agenda?appointment=${a.id}`)}/>)}</div>:<Empty title={t('dashboard.noneTitle')}>{t('dashboard.noneText')}</Empty>}</section><ReviewPrompt {...p}/><InstallNudge {...p}/></>;
}
function InstallNudge(p:WorkspaceProps){
 const {t}=useI18n();
 const key=`fio-install-dismissed:${p.data.shop.id}:${p.data.membership.user_id}`;
 const standalone=typeof window!=='undefined'&&(window.matchMedia?.('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true);
 const [visible,setVisible]=useState(()=>!standalone&&localStorage.getItem(key)!=='1'),[guide,setGuide]=useState<'menu'|'ios'|'mac'|null>(null);
 if((!visible&&!guide)||standalone)return null;
 const remember=()=>{localStorage.setItem(key,'1');setVisible(false);};
 const direct=async()=>{remember();if(p.canInstall)await p.installApp?.();else setGuide('menu');};
 const appName=p.data.membership.role==='BARBER'?t('install.staffApp'):t('install.shopApp',{shop:p.data.shop.public_title||p.data.shop.name});
 return <><section className="install-nudge"><div className="install-nudge-icon"><Download size={18}/></div><div><strong>{t('install.title',{app:appName})}</strong><span>{t('install.quick')}</span></div><button className="install-nudge-action" onClick={()=>setGuide('menu')}>{t('install.download')}</button><button className="install-nudge-close" aria-label={t('install.close')} onClick={remember}><X size={16}/></button></section>{guide&&<Modal title={t('install.modal')} onClose={()=>setGuide(null)}><div className="install-platforms">{guide==='menu'?<><p className="muted">{t('install.choose')}</p><button className="secondary" onClick={()=>void direct()}>Android</button><button className="secondary" onClick={()=>void direct()}>Windows</button><button className="secondary" onClick={()=>setGuide('mac')}>Mac</button><button className="secondary" onClick={()=>setGuide('ios')}>iPhone / iPad</button><small className="muted">{t('install.later')}</small></>:guide==='ios'?<div className="install-guide"><div><Share2 size={22}/><span><b>1.</b> {t('install.ios1a')} <strong>{t('install.share')}</strong>.</span></div><div><SquarePlus size={22}/><span><b>2.</b> {t('install.ios2a')} <strong>{t('install.addHome')}</strong> {t('install.andConfirm')}</span></div></div>:<div className="install-guide"><p>{t('install.mac')}</p></div>}</div></Modal>}</>;
}
function ReviewPrompt(p:WorkspaceProps){
 const {t}=useI18n();
 const completed=p.data.appointments.filter(a=>a.status==='completed'&&!p.data.reviews.some(r=>r.appointment_id===a.id));
 const [appointment,setAppointment]=useState<Appointment|null>(null),[rating,setRating]=useState(5),[comment,setComment]=useState(''),[busy,setBusy]=useState(false);
 const pending=completed[0];if(!pending)return null;
 const barber=p.data.team.find(t=>t.user_id===pending.barber_id)?.display_name??t('review.defaultProfessional');
 async function submit(){if(!appointment)return;setBusy(true);try{if(p.demo){p.updateDemo(d=>({...d,reviews:[...d.reviews,{id:crypto.randomUUID(),appointment_id:appointment.id,client_id:appointment.client_id,barber_id:appointment.barber_id,rating,comment,created_at:new Date().toISOString()}]}));}else{await api('/reviews',p.data.shop.id,{appointmentId:appointment.id,rating,comment});await p.refresh();}setAppointment(null);setComment('');setRating(5);p.notify(t('review.thanks'));}catch(e){p.notify((e as Error).message);}finally{setBusy(false);}}
 return <><button className="review-prompt" onClick={()=>setAppointment(pending)}><div><span className="eyebrow">{t('review.eyebrow')}</span><strong>{t('review.title',{name:barber.split(' ')[0]})}</strong><small>{t('review.fast')}</small></div><div className="review-stars">★★★★★</div><ArrowUpRight size={18}/></button>{appointment&&<Modal title={t('review.modal')} onClose={()=>setAppointment(null)}><div className="review-modal"><p className="muted">{t('review.desc',{name:barber})}</p><div className="star-picker" aria-label={t('review.rating')}>{[1,2,3,4,5].map(n=><button type="button" aria-label={t('review.star',{count:n,suffix:n>1?'s':''})} className={n<=rating?'selected':''} key={n} onClick={()=>setRating(n)}><Star size={30} fill={n<=rating?'currentColor':'none'}/></button>)}</div><Field label={t('review.comment')}><textarea maxLength={1000} value={comment} onChange={e=>setComment(e.target.value)} placeholder={t('review.placeholder')}/></Field><button className="primary full" disabled={busy} onClick={submit}>{busy?t('review.sending'):t('review.send')}</button></div></Modal>}</>;
}
function AppointmentRow({appointment:a,data,onClick}:{appointment:Appointment;data:Bootstrap;onClick:()=>void}){
 const {t,formatTime}=useI18n();
 const customer=
  data.customers.find(c=>c.id===a.client_id);

 return <button
  className="appointment-row"
  onClick={onClick}
 >

  <div className="appointment-time">
   {formatTime(a.starts_at,{timeZone:data.shop.timezone})}
   <small>
    {formatTime(a.ends_at,{timeZone:data.shop.timezone})}
   </small>
  </div>

  <CustomerAvatar
   customer={customer}
   data={data}
  />

  <div className="appointment-info">

   <strong>
    {firstName(customer?.name,t('ws.client'))}
   </strong>

   <span>
    {data.services.find(
     s=>s.id===a.service_id
    )?.name??t('ws.service')}

    {' · '}

    {data.team.find(
     t=>t.user_id===a.barber_id
    )?.display_name}
   </span>

  </div>

  <span className={`status ${a.status}`}>
   {t(`status.${a.status}`)}
  </span>

  <ArrowUpRight size={16}/>

 </button>;
}
function ClientAppointmentRow({appointment:a,data,onClick}:{appointment:Appointment;data:Bootstrap;onClick:()=>void}){
 const {t,formatDate,formatTime}=useI18n();
 const zone=data.shop.timezone,start=new Date(a.starts_at);
 const professional=data.team.find(t=>t.user_id===a.barber_id)?.display_name??t('ws.professional');
 const service=data.services.find(s=>s.id===a.service_id)?.name??t('ws.service');
 return <button className="client-booking-card" onClick={onClick}>
  <span className="client-booking-date"><strong>{formatDate(start,{timeZone:zone,day:'2-digit'})}</strong><small>{formatDate(start,{timeZone:zone,month:'short'}).replace('.','')}</small></span>
  <span className="client-booking-info"><span className="eyebrow">{t(`status.${a.status}`)}</span><strong>{service}</strong><small>{formatDate(start,{timeZone:zone,weekday:'long'})} · {formatTime(a.starts_at,{timeZone:zone})} · {professional}</small></span>
  <span className={`status ${a.status}`}>{t(`status.${a.status}`)}</span>
  <ArrowUpRight size={17}/>
 </button>;
}

function ClientAgenda(p:WorkspaceProps){
 const {t,formatDate,formatTime,formatCurrency}=useI18n();
 const {data}=p,zone=data.shop.timezone;

 const [booking,setBooking]=useState(
  new URLSearchParams(location.search).has('novo')
 );

 const [selected,setSelected]=useState<Appointment|null>(null);
 const [reschedule,setReschedule]=useState<Appointment|null>(null);
 const [busy,setBusy]=useState(false);
 const [linkOpened,setLinkOpened]=useState(false);

 useEffect(()=>{

  const id=new URLSearchParams(location.search)
   .get('appointment');

  if(!id||linkOpened)return;

  let alive=true;

  const known=data.appointments.find(a=>a.id===id);

  const request=known
   ?Promise.resolve(known)
   :api<Appointment>(`/appointments/${id}`,data.shop.id);

  void request
   .then(found=>{
    if(alive){
     setSelected(found);
     setLinkOpened(true);
    }
   })
   .catch(e=>{
    if(alive){
     p.notify(e.message);
     setLinkOpened(true);
    }
   });

  return()=>{alive=false};

 },[
  data.appointments,
  data.shop.id,
  linkOpened
 ]);

 const upcoming=data.appointments
  .filter(a=>
   ['scheduled','confirmed','in_service'].includes(a.status)&&
   Date.parse(a.ends_at)>Date.now()
  )
  .sort((a,b)=>
   Date.parse(a.starts_at)-Date.parse(b.starts_at)
  );

 const recentChanges=data.appointments
  .filter(a=>
   ['cancelled','no_show'].includes(a.status)&&
   Date.parse(a.starts_at)>Date.now()-30*86400000
  )
  .sort((a,b)=>
   Date.parse(b.starts_at)-Date.parse(a.starts_at)
  )
  .slice(0,5);

 const latestNotice=data.notifications.find(n=>
  n.appointment_id&&
  /(confirmado|cancelado|remarcado)/i.test(n.body)
 );

 async function cancel(){

  if(!selected||busy)return;

  if(!window.confirm(
   t('clientAgenda.cancelConfirm')
  ))return;

  setBusy(true);

  try{

   if(p.demo){

    p.updateDemo(d=>({
     ...d,
     appointments:d.appointments.map(a=>
      a.id===selected.id
       ?{...a,status:'cancelled'}
       :a
     )
    }));

   }else{

    await api(
     `/appointments/${selected.id}`,
     data.shop.id,
     {status:'cancelled',confirmed:true},
     'PATCH'
    );

    await p.refresh();

   }

   setSelected(null);

   p.notify(
    t('clientAgenda.cancelled')
   );

  }catch(e){

   p.notify((e as Error).message);

  }finally{

   setBusy(false);

  }
 }

 return <>

  <PageTitle
   eyebrow={t('clientAgenda.eyebrow')}
   title={t('clientAgenda.title')}
   description={t('clientAgenda.desc')}
   action={
    <button
     className="primary"
     onClick={()=>setBooking(true)}
    >
     <Plus size={18}/>
     {t('clientAgenda.book')}
    </button>
   }
  />

  {latestNotice&&
   <section className="client-agenda-notice">

    <span className="client-agenda-notice-icon">
     <Info size={17}/>
    </span>

    <div>
     <strong>{latestNotice.body}</strong>
     <small>
      {formatDate(latestNotice.created_at,{timeZone:zone,dateStyle:'short',timeStyle:'short'})}
     </small>
    </div>

   </section>
  }

  <section className="client-agenda-panel">

   <div className="client-agenda-heading">

    <div>
     <span className="eyebrow">{t('clientAgenda.upcoming')}</span>
     <h2>{t('clientAgenda.marked')}</h2>
    </div>

    <span className="muted">
     {t('clientAgenda.count',{count:upcoming.length,suffix:upcoming.length===1?'':'s'})}
    </span>

   </div>

   {upcoming.length?

    <div className="client-agenda-list">

     {upcoming.map(a=>
      <ClientAppointmentRow
       key={a.id}
       appointment={a}
       data={data}
       onClick={()=>setSelected(a)}
      />
     )}

    </div>

    :

    <Empty title={t('clientAgenda.none')}>{t('clientAgenda.noneDesc')}</Empty>

   }

  </section>

  {recentChanges.length>0&&

   <details className="client-history">

    <summary>
     {t('clientAgenda.recent')}
     <span>{recentChanges.length}</span>
    </summary>

    <div className="client-agenda-list">

     {recentChanges.map(a=>
      <ClientAppointmentRow
       key={a.id}
       appointment={a}
       data={data}
       onClick={()=>setSelected(a)}
      />
     )}

    </div>

   </details>

  }

  {booking&&
   <BookingModal
    {...p}
    onClose={()=>setBooking(false)}
   />
  }

  {reschedule&&
   <BookingModal
    {...p}
    appointment={reschedule}
    onClose={()=>setReschedule(null)}
   />
  }

  {selected&&
   <Modal
    title={t('clientAgenda.detail')}
    onClose={()=>setSelected(null)}
   >

    <div className="appointment-detail-status">

     <span className={`status ${selected.status}`}>
      {t(`status.${selected.status}`)}
     </span>

     <small>{t(`ws.statusHelp.${selected.status}`)}</small>

    </div>

    <div className="appointment-detail-grid">

     <div>
      <span>{t('ws.service')}</span>
      <strong>
       {data.services.find(
        s=>s.id===selected.service_id
       )?.name??t('ws.service')}
      </strong>
      <small>
       {t('ws.minutes',{count:data.services.find(s=>s.id===selected.service_id)?.duration_minutes??'—'})}
      </small>
     </div>

     <div>
      <span>{t('ws.professional')}</span>
      <strong>
       {data.team.find(
        t=>t.user_id===selected.barber_id
       )?.display_name??t('ws.professional')}
      </strong>
     </div>

     <div>
      <span>{t('clientAgenda.date')}</span>
      <strong>
       {formatDate(selected.starts_at,{timeZone:zone,dateStyle:'long'})}
      </strong>
     </div>

     <div>
      <span>{t('clientAgenda.time')}</span>
      <strong>
       {formatTime(selected.starts_at,{timeZone:zone})}
       {' — '}
       {formatTime(selected.ends_at,{timeZone:zone})}
      </strong>
     </div>

     <div>
      <span>{t('clientAgenda.value')}</span>
      <strong>
       {selected.subscription_id
        ?t('ws.coveredSubscription')
        :formatCurrency(selected.price_cents/100,'BRL')}
      </strong>
     </div>

    </div>

    <div className="modal-actions">

     {['scheduled','confirmed']
      .includes(selected.status)&&
      <button
       className="secondary"
       disabled={busy}
       onClick={()=>{
        setReschedule(selected);
        setSelected(null);
       }}
      >
       {t('clientAgenda.reschedule')}
      </button>
     }

     {['scheduled','confirmed']
      .includes(selected.status)&&
      <button
       className="danger"
       disabled={busy}
       onClick={()=>void cancel()}
      >
       {t('clientAgenda.cancel')}
      </button>
     }

     {['cancelled','no_show']
      .includes(selected.status)&&
      <button
       className="primary"
       onClick={()=>{
        setSelected(null);
        setBooking(true);
       }}
      >
       {t('clientAgenda.bookAnother')}
      </button>
     }

    </div>

   </Modal>
  }

 </>;
}
function StaffAgenda(p:WorkspaceProps){

 const {t,formatDate,formatTime,formatCurrency}=useI18n();
 const {data}=p;
 const zone=data.shop.timezone;
 const solo=data.shop.operation_mode==='SOLO';

 const owner=data.membership.role==='OWNER';

 const initialProfessional=
  data.membership.role==='BARBER'||solo
   ?data.membership.user_id
   :'';

 const providers=data.team.filter(t=>
  t.active&&
  (
   t.role==='BARBER'||
   (solo&&t.role==='OWNER')
  )
 );

 const [date,setDate]=useState(
  dayKey(new Date().toISOString(),zone)
 );

 const [booking,setBooking]=useState(
  new URLSearchParams(location.search).has('novo')
 );

 const [selected,setSelected]=useState<Appointment|null>(null);
 const [profileCustomer,setProfileCustomer]=useState<Customer|null>(null);
 const [linkOpened,setLinkOpened]=useState(false);
 const [busy,setBusy]=useState(false);

 const [professional,setProfessional]=
  useState(initialProfessional);

 const [reschedule,setReschedule]=
  useState<Appointment|null>(null);

 const [daily,setDaily]=useState<Appointment[]>([]);
 const [dailyError,setDailyError]=useState('');
 const [dailyLoading,setDailyLoading]=useState(true);
 const [manualRefreshing,setManualRefreshing]=useState(false);
 const [reloadKey,setReloadKey]=useState(0);

 useEffect(()=>{

  let alive=true;

  setDailyLoading(true);
  setDailyError('');

  const request=p.demo
   ?Promise.resolve({
     items:data.appointments.filter(a=>
      dayKey(a.starts_at,zone)===date&&
      (!professional||a.barber_id===professional)
     )
    })
   :api<{items:Appointment[]}>(
     `/appointments/period?from=${date}&to=${date}`+
     `${professional?`&barberId=${professional}`:''}`,
     data.shop.id
    );

  void request
   .then(v=>{
    if(alive)setDaily(v.items);
   })
   .catch(e=>{
    if(alive)setDailyError(e.message);
   })
   .finally(()=>{
    if(alive)setDailyLoading(false);
   });

  return()=>{alive=false};

 },[
  date,
  professional,
  data.appointments,
  data.shop.id,
  p.demo,
  zone,
  reloadKey
 ]);

 useEffect(()=>{

  const id=
   new URLSearchParams(location.search)
    .get('appointment');

  if(!id||linkOpened)return;

  let alive=true;

  const known=
   data.appointments.find(a=>a.id===id);

  const request=
   known
    ?Promise.resolve(known)
    :api<Appointment>(
      `/appointments/${id}`,
      data.shop.id
     );

  void request
   .then(found=>{
    if(alive){
     setSelected(found);
     setLinkOpened(true);
    }
   })
   .catch(e=>{
    if(alive){
     p.notify(e.message);
     setLinkOpened(true);
    }
   });

  return()=>{alive=false};

 },[
  data.appointments,
  data.shop.id,
  linkOpened
 ]);

 const activeAppointments=daily.filter(a=>
  ['scheduled','confirmed','in_service']
   .includes(a.status)
 );

 const archivedAppointments=daily.filter(a=>
  ['completed','cancelled','no_show']
   .includes(a.status)
 );

 function changeDay(delta:number){

  const d=new Date(date+'T12:00:00Z');

  d.setUTCDate(d.getUTCDate()+delta);

  setDate(d.toISOString().slice(0,10));

 }

 async function manualRefresh(){

  if(manualRefreshing)return;

  setManualRefreshing(true);

  try{

   await p.refresh();

   setReloadKey(key=>key+1);

   p.notify(t('staffAgenda.refreshed'));

  }catch(e){

   p.notify(
    (e as Error).message||
    t('staffAgenda.refreshFailed')
   );

  }finally{

   setManualRefreshing(false);

  }
 }

 async function transition(
  status:
   'confirmed'|
   'in_service'|
   'completed'|
   'cancelled'|
   'no_show'
 ){

  if(!selected)return;

  if(
   status==='cancelled'&&
   !window.confirm(
    t('staffAgenda.cancelConfirm')
   )
  )return;

  setBusy(true);

  try{

   if(p.demo){

    p.updateDemo(d=>({
     ...d,
     appointments:d.appointments.map(a=>
      a.id===selected.id
       ?{...a,status}
       :a
     )
    }));

   }else{

    await api(
     `/appointments/${selected.id}`,
     data.shop.id,
     {status,confirmed:true},
     'PATCH'
    );

    await p.refresh();

   }

   setSelected(null);

   p.notify({
    confirmed:t('staffAgenda.confirmed'),
    in_service:t('staffAgenda.started'),
    completed:t('staffAgenda.completed'),
    cancelled:t('staffAgenda.cancelled'),
    no_show:t('staffAgenda.noShow')
   }[status]);

  }catch(e){

   p.notify((e as Error).message);

  }finally{

   setBusy(false);

  }
 }

 const customer=
  selected
   ?data.customers.find(
     c=>c.id===selected.client_id
    )
   :null;

 const service=
  selected
   ?data.services.find(
     s=>s.id===selected.service_id
    )
   :null;

 const selectedProfessional=
  selected
   ?data.team.find(
     t=>t.user_id===selected.barber_id
    )
   :null;

 const profileAppointments=
  profileCustomer
   ?data.appointments.filter(
     a=>a.client_id===profileCustomer.id
    )
   :[];

 const profileCompleted=
  profileAppointments.filter(
   a=>a.status==='completed'
  );

 const profileUpcoming=
  profileAppointments.filter(a=>
   ['scheduled','confirmed','in_service']
    .includes(a.status)&&
   Date.parse(a.ends_at)>Date.now()
  );

 const profileLast=
  [...profileCompleted]
   .sort(
    (a,b)=>
     Date.parse(b.starts_at)-
     Date.parse(a.starts_at)
   )[0];

 return <>

  <PageTitle
   eyebrow={owner?t('staffAgenda.ownerEyebrow'):t('staffAgenda.staffEyebrow')}
   title={
    owner?(solo?t('staffAgenda.myAgenda'):t('staffAgenda.shopAgenda')):t('staffAgenda.myAgenda')
   }
   description={
    owner?t('staffAgenda.ownerDesc'):t('staffAgenda.staffDesc')
   }
   action={
    <div className="page-actions">

     <button
      className="secondary agenda-refresh-button"
      disabled={manualRefreshing}
      onClick={()=>void manualRefresh()}
     >
      <RefreshCw
       className={manualRefreshing?'spin':''}
       size={18}
      />
      <span>{t('staffAgenda.refresh')}</span>
     </button>

     <button
      className="primary"
      onClick={()=>setBooking(true)}
     >
      <Plus size={18}/>
      {owner?t('staffAgenda.new'):t('staffAgenda.bookClient')}
     </button>

    </div>
   }
  />

  <div className="agenda-controls">

   <div className="agenda-day">

    <button
     className="icon-button"
     onClick={()=>changeDay(-1)}
    >
     <ChevronLeft/>
    </button>

    <Field label={t('staffAgenda.day')}>
     <input
      type="date"
      value={date}
      onChange={e=>setDate(e.target.value)}
     />
    </Field>

    <button
     className="icon-button"
     onClick={()=>changeDay(1)}
    >
     <ChevronRight/>
    </button>

    <button
     className="secondary"
     onClick={()=>
      setDate(
       dayKey(new Date().toISOString(),zone)
      )
     }
    >
     {t('staffAgenda.today')}
    </button>

   </div>

   {owner&&!solo&&
    <Field label={t('staffAgenda.filterProfessional')}>
     <select
      value={professional}
      onChange={e=>setProfessional(e.target.value)}
     >
      <option value="">{t('staffAgenda.allTeam')}</option>

      {providers.map(t=>
       <option
        key={t.user_id}
        value={t.user_id}
       >
        {t.display_name}
       </option>
      )}

     </select>
    </Field>
   }

   <span className="muted">
    {t('staffAgenda.active',{count:activeAppointments.length,suffix:activeAppointments.length===1?'':'s'})}
   </span>

   <span className="agenda-live-status">
    <i/>
    {t('staffAgenda.auto')}
   </span>

  </div>

  <AppointmentPeriod
   {...p}
   professional={professional}
   onSelect={setSelected}
  />

  <section className="staff-day-agenda">

   <div className="section-title">

    <h2>{t('staffAgenda.dayServices')}</h2>

    <span className="muted">
     {activeAppointments.length} ativo
     {activeAppointments.length===1?'':'s'}
    </span>

   </div>

   {dailyLoading?

    <p role="status">{t('staffAgenda.loading')}</p>

    :dailyError?

    <p role="alert" className="notice">
     {dailyError}
    </p>

    :activeAppointments.length?

    <div className="appointment-list">

     {activeAppointments.map(a=>
      <AppointmentRow
       key={a.id}
       appointment={a}
       data={data}
       onClick={()=>setSelected(a)}
      />
     )}

    </div>

    :

    <Empty title={t('staffAgenda.none')}>{t('staffAgenda.noneDesc')}</Empty>

   }

   {archivedAppointments.length>0&&

    <details className="staff-archive">

     <summary>
      {t('staffAgenda.history')}
      <span>{archivedAppointments.length}</span>
     </summary>

     <div className="appointment-list">

      {archivedAppointments.map(a=>
       <AppointmentRow
        key={a.id}
        appointment={a}
        data={data}
        onClick={()=>setSelected(a)}
       />
      )}

     </div>

    </details>

   }

  </section>

  {reschedule&&
   <BookingModal
    {...p}
    appointment={reschedule}
    onClose={()=>setReschedule(null)}
   />
  }

  {booking&&
   <BookingModal
    {...p}
    onClose={()=>setBooking(false)}
   />
  }

  {selected&&
   <Modal
    title={t('staffAgenda.details')}
    onClose={()=>setSelected(null)}
   >

    <div className="appointment-detail-status">

     <span className={`status ${selected.status}`}>
      {t(`status.${selected.status}`)}
     </span>

     <small>{t(`ws.statusHelp.${selected.status}`)}</small>

    </div>

    {customer&&
     <div className="appointment-client-card">

      <CustomerAvatar
       customer={customer}
       data={data}
       className="appointment-client-avatar"
      />

      <div>
       <span>{t('staffAgenda.client')}</span>
       <strong>
        {firstName(customer.name,t('ws.client'))}
       </strong>
       <small>
        {t('staffAgenda.clientDesc')}
       </small>
      </div>

      <button
       type="button"
       className="secondary client-profile-button"
       onClick={()=>setProfileCustomer(customer)}
      >
       {t('staffAgenda.profile')}
      </button>

     </div>
    }

    <div className="appointment-detail-grid">

     <div>
      <span>{t('ws.service')}</span>
      <strong>{service?.name??t('ws.service')}</strong>
      <small>
       {t('ws.minutes',{count:service?.duration_minutes??'—'})}
      </small>
     </div>

     <div>
      <span>{t('ws.professional')}</span>
      <strong>
       {selectedProfessional?.display_name??t('ws.professional')}
      </strong>
     </div>

     <div>
      <span>{t('clientAgenda.date')}</span>
      <strong>
       {formatDate(selected.starts_at,{timeZone:zone,dateStyle:'long'})}
      </strong>
     </div>

     <div>
      <span>{t('clientAgenda.time')}</span>
      <strong>
       {formatTime(selected.starts_at,{timeZone:zone})}
       {' — '}
       {formatTime(selected.ends_at,{timeZone:zone})}
      </strong>
     </div>

     <div>
      <span>{t('clientAgenda.value')}</span>
      <strong>
       {selected.subscription_id
        ?t('ws.coveredSubscription')
        :formatCurrency(selected.price_cents/100,'BRL')}
      </strong>
     </div>

    </div>

    <div className="modal-actions">

     {['scheduled','confirmed']
      .includes(selected.status)&&
      <button
       className="secondary"
       onClick={()=>{
        setReschedule(selected);
        setSelected(null);
       }}
      >
       {t('clientAgenda.reschedule')}
      </button>
     }

     {['scheduled','confirmed']
      .includes(selected.status)&&
      <button
       className="danger"
       disabled={busy}
       onClick={()=>void transition('cancelled')}
      >
       {t('clientAgenda.cancel')}
      </button>
     }

     {['scheduled','confirmed','in_service']
      .includes(selected.status)&&
      new Date(selected.starts_at)<=new Date()&&
      <button
       className="primary"
       disabled={busy}
       onClick={()=>void transition('completed')}
      >
       {t('staffAgenda.finish')}
      </button>
     }

     {['scheduled','confirmed'].includes(selected.status)&&
      new Date(selected.starts_at)<=new Date()&&
      <button
       className="secondary"
       disabled={busy}
       onClick={()=>void transition('no_show')}
      >
       {t('staffAgenda.noShowButton')}
      </button>
     }

    </div>

   </Modal>
  }


  {profileCustomer&&
   <Modal
    title={t('staffAgenda.customerProfile')}
    onClose={()=>setProfileCustomer(null)}
   >

    <div className="customer-profile-modal">

     <CustomerAvatar
      customer={profileCustomer}
      data={data}
      className="profile-avatar"
     />

     <h3>
      {profileCustomer.name}
     </h3>

     <p className="muted">
      {profileCustomer.phone||
       t('staffAgenda.noPhone')}
     </p>

     <small className="customer-profile-origin">
      {profileCustomer.user_id
       ?t('staffAgenda.connected'):t('staffAgenda.shopRecord')}
     </small>

     <div className="profile-stats">

      <div>
       <strong>
        {profileCompleted.length}
       </strong>
       <span>
        {t('staffAgenda.completedRecent')}
       </span>
      </div>

      <div>
       <strong>
        {profileUpcoming.length}
       </strong>
       <span>
        {t('staffAgenda.upcoming')}
       </span>
      </div>

     </div>

     {profileLast&&
      <div className="customer-last-visit">

       <span>
        {t('staffAgenda.last')}
       </span>

       <strong>
        {data.services.find(
         s=>s.id===profileLast.service_id
        )?.name??t('ws.service')}
       </strong>

       <small>
        {formatDate(profileLast.starts_at,{timeZone:zone})}
       </small>

      </div>
     }

     {profileCustomer.phone&&
      <a
       className="primary full whatsapp-button"
       href={whats(profileCustomer.phone)}
       target="_blank"
       rel="noreferrer"
      >
       <WhatsAppIcon size={18}/>{t('staffAgenda.whatsapp')}
      </a>
     }

    </div>

   </Modal>
  }

 </>;
}
export function Agenda(p:WorkspaceProps){
 return p.data.membership.role==='CLIENT'?<ClientAgenda {...p}/>:<StaffAgenda {...p}/>;
}

export function Services(p:WorkspaceProps){
 const {t,formatCurrency}=useI18n();
 const {data}=p,[modal,setModal]=useState(false),[editing,setEditing]=useState<Service|null>(null),[name,setName]=useState(''),[description,setDescription]=useState(''),[price,setPrice]=useState('65'),[duration,setDuration]=useState('45'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');const values={name,description:description.trim(),duration_minutes:Number(duration),price_cents:Math.round(Number(price)*100)};try{if(p.demo){p.updateDemo(d=>({...d,services:editing?d.services.map(s=>s.id===editing.id?{...s,...values}:s):[...d.services,{...values,id:crypto.randomUUID(),active:true}]}));}else{await api(editing?`/services/${editing.id}`:'/services',data.shop.id,values,editing?'PATCH':'POST');await p.refresh();}setModal(false);p.notify(t('services.saved'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 function open(service?:Service){setEditing(service??null);setName(service?.name??'');setDescription(service?.description??'');setPrice(service?String(service.price_cents/100):'65');setDuration(service?String(service.duration_minutes):'45');setError('');setModal(true);}
 return <><PageTitle eyebrow={t('services.eyebrow')} title={t('services.title')} description={t('services.desc')} action={data.membership.role==='OWNER'&&<button className="primary" onClick={()=>open()}><Plus size={18}/>{t('services.new')}</button>}/>{data.services.length?<div className="service-list">{data.services.filter(s=>s.active).map((service,i)=><div className="service-row" key={service.id}><span className="service-number">{String(i+1).padStart(2,'0')}</span><div className="service-name"><h2>{service.name}</h2>{service.description&&<p className="service-description">{service.description}</p>}<span><Clock3 size={14}/>{t('services.minutes',{count:service.duration_minutes})}</span></div><strong>{formatCurrency(service.price_cents/100,'BRL')}</strong>{data.membership.role==='OWNER'&&<button className="icon-button" aria-label={t('services.editAria',{name:service.name})} onClick={()=>open(service)}><SlidersHorizontal size={18}/></button>}</div>)}</div>:<Empty title={t('services.empty')}>{t('services.emptyDesc')}</Empty>}{modal&&<Modal title={editing?t('services.edit'):t('services.new')} onClose={()=>setModal(false)}><form onSubmit={submit}><Field label={t('services.name')}><input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></Field><Field label={t('services.description')}><textarea maxLength={500} rows={3} value={description} onChange={e=>setDescription(e.target.value)} placeholder={t('services.placeholder')}/><span className="field-counter">{description.length}/500</span></Field><div className="form-grid"><Field label={t('services.value')}><input required type="number" min="0" max="10000" step="0.01" value={price} onChange={e=>setPrice(e.target.value)}/></Field><Field label={t('services.duration')}><input required type="number" min="10" max="240" value={duration} onChange={e=>setDuration(e.target.value)}/></Field></div>{error&&<p className="notice" role="alert">{error}</p>}<button className="primary full" disabled={busy}>{busy?t('services.saving'):t('services.save')}</button></form></Modal>}</>;
}
export function Customers(p:WorkspaceProps){
 const {t}=useI18n();
 const [search,setSearch]=useState(''),[modal,setModal]=useState(false),[selected,setSelected]=useState<(typeof p.data.customers)[number]|null>(null),[name,setName]=useState(''),[phone,setPhone]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{if(p.demo)p.updateDemo(d=>({...d,customers:[...d.customers,{id:crypto.randomUUID(),name,phone,user_id:null}]}));else{await api('/customers',p.data.shop.id,{name,phone:phone||undefined});await p.refresh();}setModal(false);setName('');setPhone('');p.notify(t('customers.saved'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const customers=p.data.customers.filter(c=>c.name.toLowerCase().includes(search.toLowerCase())||(c.phone??'').includes(search));
 return <><PageTitle eyebrow={t('customers.eyebrow')} title={p.data.membership.role==='OWNER'?t('customers.titleOwner'):t('customers.titleStaff')} description={t('customers.desc')} action={p.data.membership.role==='OWNER'&&<button className="primary" onClick={()=>setModal(true)}><Plus size={18}/>{t('customers.new')}</button>}/><label className="search-input"><Search size={18}/><input aria-label={t('customers.searchAria')} placeholder={t('customers.search')} value={search} onChange={e=>setSearch(e.target.value)}/></label>{customers.length?<div className="people-list">{customers.map(c=>{const completed=p.data.appointments.filter(a=>a.client_id===c.id&&a.status==='completed').length;return <button key={c.id} className="person-row person-button" onClick={()=>setSelected(c)}><span className="avatar">{c.name.split(' ').map(n=>n[0]).slice(0,2).join('')}</span><div><h3>{c.name}</h3><p>{c.phone||(c.user_id?t('customers.connected'):t('customers.shopRecord'))}</p></div><span className="muted">{t('customers.services',{count:completed})}</span></button>})}</div>:<Empty title={t('customers.none')}>{search?t('customers.tryAnother'):t('customers.appear')}</Empty>}{selected&&<Modal title={t('customers.profile')} onClose={()=>setSelected(null)}><div className="profile-detail"><span className="avatar profile-avatar">{selected.name.split(' ').map(n=>n[0]).slice(0,2).join('')}</span><h3>{selected.name}</h3><p className="muted">{selected.phone||t('customers.noPhone')}</p><div className="profile-stats"><div><strong>{p.data.appointments.filter(a=>a.client_id===selected.id&&a.status==='completed').length}</strong><span>{t('ws.services')}</span></div><div><strong>{p.data.subscriptions.find(x=>x.client_id===selected.id&&x.status==='active')?.remaining_cuts??0}</strong><span>{t('customers.cutsPlan')}</span></div></div>{selected.phone&&<a className="primary full whatsapp-button" href={whats(selected.phone)} target="_blank" rel="noreferrer"><WhatsAppIcon size={18}/>{t('customers.whatsapp')}</a>}</div></Modal>}{modal&&<Modal title={t('customers.new')} onClose={()=>setModal(false)}><form onSubmit={submit}><Field label={t('customers.name')}><input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></Field><Field label={t('customers.phone')}><input type="tel" inputMode="tel" minLength={8} maxLength={24} placeholder={t('ws.phonePlaceholder')} value={phone} onChange={e=>setPhone(e.target.value)}/></Field>{error&&<p role="alert" className="notice">{error}</p>}<button className="primary full" disabled={busy}>{busy?t('customers.saving'):t('customers.save')}</button></form></Modal>}</>;
}
export function Team(p:WorkspaceProps){
 const {t}=useI18n();
 const owner=p.data.membership.role==='OWNER';
 const [modal,setModal]=useState(false),[selected,setSelected]=useState<(typeof p.data.team)[number]|null>(null),[name,setName]=useState(''),[email,setEmail]=useState(''),[phone,setPhone]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function createStaff(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await api('/staff',p.data.shop.id,{name,email,phone,temporaryPassword:password});await p.refresh();setModal(false);setName('');setEmail('');setPhone('');setPassword('');p.notify(t('team.created'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const [staffEmail,setStaffEmail]=useState(''),[accessError,setAccessError]=useState('');
 useEffect(()=>{let active=true;setStaffEmail('');setAccessError('');if(owner&&selected?.role==='BARBER')void api<{email:string}>(`/staff/${selected.user_id}/access`,p.data.shop.id).then(r=>{if(active)setStaffEmail(r.email);}).catch(e=>{if(active)setAccessError(e.message);});return()=>{active=false;};},[selected?.user_id,owner,p.data.shop.id]);
 const people=p.data.team.filter(m=>m.role!=='CLIENT');
 return <><PageTitle eyebrow={t('team.eyebrow')} title={p.data.membership.role==='CLIENT'?t('team.clientTitle'):t('team.staffTitle')} description={p.data.membership.role==='CLIENT'?t('team.clientDesc'):t('team.staffDesc')} action={owner?<button className="primary" onClick={()=>setModal(true)}><Plus size={18}/>{t('team.add')}</button>:undefined}/><div className="people-list">{people.map(m=>{const reviews=p.data.reviews.filter(r=>r.barber_id===m.user_id),avg=reviews.length?reviews.reduce((a,b)=>a+b.rating,0)/reviews.length:0;return <button className="person-row person-button" key={m.user_id} onClick={()=>setSelected(m)}><MemberAvatar member={m}/><div><h3>{m.display_name}</h3><p>{m.role==='OWNER'?t('team.ownerShop'):m.phone||t('team.professional')}</p></div>{m.role==='BARBER'&&reviews.length>0?<span className="rating-chip"><Star size={14} fill="currentColor"/>{avg.toFixed(1)} · {reviews.length}</span>:<span className="status">{m.role==='OWNER'?t('team.owner'):t('team.active')}</span>}</button>})}</div>{selected&&<Modal title={t('team.contact')} onClose={()=>setSelected(null)}><div className="profile-detail"><MemberAvatar member={selected} className="profile-avatar"/><h3>{selected.display_name}</h3><p className="muted">{selected.role==='OWNER'?t('team.ownerShop'):t('team.staffRole')}</p><p>{selected.phone||t('customers.noPhone')}</p>{owner&&selected.role==='BARBER'&&<div className="settings-readonly"><span>{t('team.accessEmail')}</span><strong>{staffEmail||accessError||t('team.checking')}</strong><p>{t('team.passwordHelp')}</p>{staffEmail&&<button className="secondary" onClick={()=>void navigator.clipboard.writeText(`${window.location.origin}/login?audience=staff&mode=forgot&email=${encodeURIComponent(staffEmail)}`).then(()=>p.notify(t('team.copyOk'))).catch(()=>p.notify(t('team.copyFail')))}>{t('team.copyRecovery')}</button>}</div>}{selected.phone&&<a className="primary full whatsapp-button" href={whats(selected.phone)} target="_blank" rel="noreferrer"><WhatsAppIcon size={18}/>{t('team.whatsapp')}</a>}</div></Modal>}{owner&&modal&&<Modal title={t('team.new')} onClose={()=>setModal(false)}><form onSubmit={createStaff}><p className="muted compact-copy">{t('team.createDesc')}</p><Field label={t('team.name')}><input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></Field><Field label={t('team.email')}><input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></Field><Field label={t('team.phone')}><input type="tel" inputMode="tel" required minLength={8} maxLength={24} value={phone} onChange={e=>setPhone(e.target.value)}/></Field><Field label={t('team.password')}><input type="password" required minLength={8} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></Field>{error&&<p role="alert" className="notice">{error}</p>}<button className="primary full" disabled={busy}>{busy?t('team.creating'):t('team.create')}</button></form></Modal>}</>;
}
export function Subscriptions(p:WorkspaceProps){
 const {t,formatCurrency,formatDate}=useI18n();
 const owner=p.data.membership.role==='OWNER',canManagePlans=owner&&planAllows(p.data.plan,'client_plans');
 const [planModal,setPlanModal]=useState(false),[assignModal,setAssignModal]=useState(false),[clientId,setClientId]=useState(p.data.customers[0]?.id??''),[planId,setPlanId]=useState(p.data.subscriptionPlans[0]?.id??''),[name,setName]=useState(''),[planDescription,setPlanDescription]=useState(''),[cuts,setCuts]=useState('4'),[days,setDays]=useState('30'),[price,setPrice]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function createPlan(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await api('/subscription-plans',p.data.shop.id,{name,description:planDescription,cuts:Number(cuts),validityDays:Number(days),priceCents:Math.round(Number(price.replace(',','.'))*100)});await p.refresh();setPlanModal(false);setName('');setPlanDescription('');setPrice('');p.notify(t('subs.planPublished'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function assign(e:FormEvent){e.preventDefault();if(!clientId||!planId)return;setBusy(true);setError('');try{await api('/subscriptions/from-plan',p.data.shop.id,{clientId,planId,confirmed:true});await p.refresh();setAssignModal(false);p.notify(t('subs.assigned'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const active=p.data.subscriptions.filter(s=>s.status==='active'&&new Date(s.expires_at)>new Date());
 const visiblePlans=owner||planAllows(p.data.plan,'client_plans')?p.data.subscriptionPlans.filter(x=>x.active):[];
 return <><PageTitle eyebrow={t('subs.eyebrow')} title={owner?t('subs.ownerTitle'):t('subs.clientTitle')} description={owner?t('subs.ownerDesc'):t('subs.clientDesc')} action={canManagePlans?<div className="page-actions"><button className="secondary" onClick={()=>setAssignModal(true)}><UserRound size={17}/>{t('subs.assign')}</button><button className="primary" onClick={()=>setPlanModal(true)}><Plus size={17}/>{t('subs.new')}</button></div>:undefined}/>{owner&&!canManagePlans&&<section className="feature-upgrade-note"><Crown size={18}/><div><strong>{t('subs.upgradeTitle')}</strong><p>{t('subs.upgradeDesc')}</p></div></section>}<div className="section-title"><h2>{t('subs.available')}</h2><span className="muted">{t('subs.published',{count:visiblePlans.length})}</span></div>{visiblePlans.length?<div className="subscription-grid">{visiblePlans.map(plan=><article key={plan.id} className="subscription-card plan-catalog-card"><span className="eyebrow">{t('subs.plan')}</span><h2>{plan.name}</h2><strong>{formatCurrency(plan.price_cents/100,'BRL')}</strong><p>{t('subs.cutsDays',{count:plan.cuts,suffix:plan.cuts===1?'':'s',days:plan.validity_days})}</p>{plan.description&&<p className="plan-description">{plan.description}</p>}{!owner&&p.data.shop.whatsapp&&<a className="primary full whatsapp-button" target="_blank" rel="noreferrer" href={`${whats(p.data.shop.whatsapp)}?text=${encodeURIComponent(t('subs.whatsappMessage',{name:plan.name}))}`}><WhatsAppIcon size={17}/>{t('subs.want')}</a>}</article>)}</div>:<Empty title={t('subs.none')}>{owner?(canManagePlans?t('subs.createFirst'):t('subs.notIncluded')):t('subs.noneClient')}</Empty>}<div className="section-title subscriptions-active-title"><h2>{owner?t('subs.ownerActive'):t('subs.clientActive')}</h2><span className="muted">{t('subs.activeCount',{count:active.length})}</span></div>{active.length?<div className="subscription-grid">{active.map(subscription=><article key={subscription.id} className="subscription-card"><span className="eyebrow">{t('subs.active')}</span><h2>{subscription.name}</h2>{owner&&subscription.client_id&&<p>{p.data.customers.find(c=>c.id===subscription.client_id)?.name??t('ws.client')}</p>}<strong>{subscription.remaining_cuts}<span> {t('subs.cutsRemaining')}</span></strong><p>{t('subs.until',{date:formatDate(subscription.expires_at,{timeZone:p.data.shop.timezone})})}</p></article>)}</div>:<Empty title={owner?t('subs.noneOwnerActive'):t('subs.noneClientActive')}/>} {canManagePlans&&planModal&&<Modal title={t('subs.newModal')} onClose={()=>setPlanModal(false)}><form onSubmit={createPlan}><Field label={t('subs.planName')}><input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></Field><Field label={t('subs.planDesc')}><textarea rows={4} maxLength={700} value={planDescription} onChange={e=>setPlanDescription(e.target.value)} placeholder={t('subs.planPlaceholder')}/><span className="field-counter">{planDescription.length}/700</span></Field><div className="form-grid"><Field label={t('subs.cuts')}><input inputMode="numeric" required value={cuts} onChange={e=>setCuts(e.target.value.replace(/\D/g,''))}/></Field><Field label={t('subs.validity')}><input inputMode="numeric" required value={days} onChange={e=>setDays(e.target.value.replace(/\D/g,''))}/></Field></div><Field label={t('subs.price')}><input inputMode="decimal" required value={price} onChange={e=>setPrice(e.target.value.replace(/[^0-9,.]/g,''))}/></Field>{error&&<p className="notice" role="alert">{error}</p>}<button className="primary full" disabled={busy}>{t('subs.publish')}</button></form></Modal>} {canManagePlans&&assignModal&&<Modal title={t('subs.assignModal')} onClose={()=>setAssignModal(false)}><form onSubmit={assign}><Field label={t('subs.client')}><select required value={clientId} onChange={e=>setClientId(e.target.value)}>{p.data.customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label={t('subs.plan')}><select required value={planId} onChange={e=>setPlanId(e.target.value)}>{p.data.subscriptionPlans.filter(x=>x.active).map(plan=><option key={plan.id} value={plan.id}>{plan.name} · {formatCurrency(plan.price_cents/100,'BRL')}</option>)}</select></Field>{error&&<p className="notice" role="alert">{error}</p>}<button className="primary full" disabled={busy||!clientId||!planId}>{t('subs.confirm')}</button></form></Modal>}</>;
}
export function Communication(p:WorkspaceProps){
 const {t}=useI18n();
 const [modal,setModal]=useState(false),[title,setTitle]=useState(''),[body,setBody]=useState(''),[audience,setAudience]=useState<'CLIENT'|'BARBER'|'ALL'>('CLIENT'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function create(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{if(p.demo){p.notify(t('comm.demoCreated'));setModal(false);return;}await api('/campaigns',p.data.shop.id,{title,body,audience});await p.refresh();setModal(false);setTitle('');setBody('');p.notify(t('comm.draftCreated'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function publish(id:string){if(!confirm(t('comm.publishConfirm')))return;setBusy(true);try{if(p.demo){p.notify(t('comm.demoPublished'));return;}await api(`/campaigns/${id}/publish`,p.data.shop.id,{confirmed:true});await p.refresh();p.notify(t('comm.publishedNotice'));}catch(e){p.notify((e as Error).message);}finally{setBusy(false);}}
 const audienceLabel=(value:'CLIENT'|'BARBER'|'ALL')=>value==='CLIENT'?t('comm.clients'):value==='BARBER'?t('comm.team'):t('comm.all');
 return <><PageTitle eyebrow={t('comm.eyebrow')} title={t('comm.title')} description={t('comm.desc')} action={<button className="primary" onClick={()=>setModal(true)}><Plus size={18}/>{t('comm.new')}</button>}/>{p.data.campaigns.length?<div className="people-list">{p.data.campaigns.map(c=><div className="person-row" key={c.id}><div><h3>{c.title}</h3><p>{c.body}</p><small className="muted">{t('comm.audienceLabel',{audience:audienceLabel(c.audience),status:c.status==='published'?t('comm.published'):t('comm.draft')})}</small></div>{c.status==='draft'&&<button className="secondary" disabled={busy} onClick={()=>publish(c.id)}>{t('comm.publish')}</button>}</div>)}</div>:<Empty title={t('comm.none')}>{t('comm.noneDesc')}</Empty>}{modal&&<Modal title={t('comm.modal')} onClose={()=>setModal(false)}><form onSubmit={create}><Field label={t('comm.titleField')}><input required minLength={2} maxLength={120} value={title} onChange={e=>setTitle(e.target.value)}/></Field><Field label={t('comm.message')}><textarea required maxLength={1000} rows={5} value={body} onChange={e=>setBody(e.target.value)}/></Field><Field label={t('comm.audience')}><select value={audience} onChange={e=>setAudience(e.target.value as 'CLIENT'|'BARBER'|'ALL')}><option value="CLIENT">{t('comm.clients')}</option><option value="BARBER">{t('comm.team')}</option><option value="ALL">{t('comm.all')}</option></select></Field>{error&&<p className="notice" role="alert">{error}</p>}<button className="primary full" disabled={busy}>{t('comm.saveDraft')}</button></form></Modal>}</>;
}
export function Support(p:WorkspaceProps){
 const {t}=useI18n();
 const [section,setSection]=useState<'home'|'terms'|'privacy'|'feedback'>('home');
 const [category,setCategory]=useState<'feedback'|'problem'|'question'>('feedback');
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const owner=p.data.team.find(member=>member.role==='OWNER');
 const contact=p.data.shop.whatsapp||owner?.phone||'';
 async function sendFeedback(e:FormEvent){
  e.preventDefault();const text=message.trim();if(text.length<3)return;setBusy(true);setError('');
  try{await api('/support/feedback',p.data.shop.id,{category,message:text});setMessage('');setSection('home');p.notify(t('support.sent'));}
  catch{setError(t('support.sendFailed'));}finally{setBusy(false);}
 }
 if(section==='terms')return <><button className="settings-back" data-tour="support-back" type="button" onClick={()=>setSection('home')}><ArrowLeft size={16}/>{t('support.back')}</button><PageTitle eyebrow={t('support.helpEyebrow')} title={t('support.terms')} description={t('support.termsPageDesc')}/><section className="support-document"><h2>{t('support.termsAccountTitle')}</h2><p>{t('support.termsAccount')}</p><h2>{t('support.termsInfoTitle')}</h2><p>{t('support.termsInfo')}</p><h2>{t('support.termsPlansTitle')}</h2><p>{t('support.termsPlans')}</p><h2>{t('support.termsResponsibleTitle')}</h2><p>{t('support.termsResponsible')}</p><div className="support-legal-note"><Info size={17}/><span>{t('support.termsLegal')}</span></div></section></>;
 if(section==='privacy')return <><button className="settings-back" data-tour="support-back" type="button" onClick={()=>setSection('home')}><ArrowLeft size={16}/>{t('support.back')}</button><PageTitle eyebrow={t('support.helpEyebrow')} title={t('support.privacy')} description={t('support.privacyDescPage')}/><section className="support-document"><h2>{t('support.privacyNeededTitle')}</h2><p>{t('support.privacyNeeded')}</p><h2>{t('support.privacyPhotosTitle')}</h2><p>{t('support.privacyPhotos')}</p><h2>{t('support.privacySeparationTitle')}</h2><p>{t('support.privacySeparation')}</p><h2>{t('support.privacyControlTitle')}</h2><p>{t('support.privacyControl')}</p><div className="support-legal-note"><Shield size={17}/><span>{t('support.privacyWarning')}</span></div></section></>;
 if(section==='feedback')return <><button className="settings-back" data-tour="support-back" type="button" onClick={()=>setSection('home')}><ArrowLeft size={16}/>{t('support.back')}</button><PageTitle eyebrow={t('support.helpEyebrow')} title={t('support.feedbackTitle')} description={t('support.feedbackPageDesc')}/><section className="settings-card support-feedback-card"><form onSubmit={sendFeedback}><Field label={t('support.subject')}><select value={category} onChange={e=>setCategory(e.target.value as typeof category)}><option value="feedback">{t('support.feedbackOption')}</option><option value="problem">{t('support.problemOption')}</option><option value="question">{t('support.questionOption')}</option></select></Field><Field label={t('support.message')}><textarea data-tour="feedback-message" rows={6} minLength={3} maxLength={1500} required value={message} onChange={e=>setMessage(e.target.value)} placeholder={t('support.messagePlaceholder')}/><span className="field-counter">{message.length}/1500</span></Field>{error&&<p className="notice" role="alert">{error}</p>}<button data-tour="feedback-send" className="primary full" disabled={busy||message.trim().length<3}><Send size={17}/>{busy?t('support.sending'):t('support.send')}</button></form></section></>;
 return <><PageTitle eyebrow={t('support.eyebrow')} title={t('support.title')} description={t('support.description')}/><button className="secondary" onClick={()=>window.dispatchEvent(new Event('fio-tour-restart'))}>{t('support.tutorial')}</button><div className="support-grid"><button className="support-card" onClick={()=>setSection('terms')}><span><FileText size={20}/></span><div><strong>{t('support.terms')}</strong><p>{t('support.termsDesc')}</p></div><ArrowUpRight size={18}/></button><button className="support-card" onClick={()=>setSection('privacy')}><span><Shield size={20}/></span><div><strong>{t('support.privacy')}</strong><p>{t('support.privacyDesc')}</p></div><ArrowUpRight size={18}/></button><button className="support-card" data-tour="feedback" onClick={()=>setSection('feedback')}><span><MessageSquareText size={20}/></span><div><strong>{t('support.feedback')}</strong><p>{t('support.feedbackDesc')}</p></div><ArrowUpRight size={18}/></button><button className="support-card" onClick={()=>{setCategory('problem');setSection('feedback');}}><span><Bug size={20}/></span><div><strong>{t('support.problem')}</strong><p>{t('support.problemDesc')}</p></div><ArrowUpRight size={18}/></button></div>{contact&&<section className="support-contact"><div><span className="eyebrow">{t('support.barbershop')}</span><h2>{t('support.talkTo',{name:owner?.display_name||p.data.shop.name})}</h2><p>{t('support.contactDesc')}</p></div><a className="primary" href={whats(contact)} target="_blank" rel="noreferrer"><WhatsAppIcon size={17}/>{t('support.openWhatsApp')}</a></section>}<section className="support-about"><CircleHelp size={18}/><div><strong>{t('support.about')}</strong><p>{t('support.aboutDesc')}</p></div></section></>;
}
export function Settings(p:WorkspaceProps){
 const {t,formatDate}=useI18n();
 const owner=p.data.membership.role==='OWNER',solo=p.data.shop.operation_mode==='SOLO',navigate=useNavigate();
 const [section,setSection]=useState<'home'|'profile'|'barbershop'|'plan'|'access'|'account'|'notifications'|'language'|'schedule'>('home');
 useEffect(()=>{window.scrollTo({top:0,behavior:'instant'});},[section]);
 const [displayName,setDisplayName]=useState(p.data.membership.display_name);
 const [phone,setPhone]=useState(p.data.membership.phone??'');
 const [avatarUrl,setAvatarUrl]=useState(p.data.membership.avatar_url??'');
 const [avatarPath,setAvatarPath]=useState(p.data.membership.avatar_asset_path??'');
 const [title,setTitle]=useState(p.data.shop.public_title??p.data.shop.name);
 const [description,setDescription]=useState(p.data.shop.public_description??'');
 const [logoUrl,setLogoUrl]=useState(p.data.shop.logo_url??'');
 const [coverUrl,setCoverUrl]=useState(p.data.shop.cover_url??'');
 const [backgroundUrl,setBackgroundUrl]=useState(p.data.shop.background_url??'');
 const [accentColor,setAccentColor]=useState(p.data.shop.custom_accent??p.data.shop.accent_color??'#ffffff');
 const [busy,setBusy]=useState(false),[accountEmail,setAccountEmail]=useState('');
 const origin=typeof window==='undefined'?'':window.location.origin;
 const links={gestao:`${origin}/acesso/gestao`,equipe:`${origin}/acesso/equipe`,clientes:`${origin}/${p.data.shop.slug}`};

 useEffect(()=>{let active=true;if(!supabase)return;void supabase.auth.getUser().then(({data})=>{if(active)setAccountEmail(data.user?.email??'');});return()=>{active=false;};},[]);

 async function saveContact(){
  setBusy(true);
  try{await api('/profile/contact',p.data.shop.id,{displayName,phone},'PATCH');await p.refresh();p.notify(t('settings.profileUpdated'));}
  catch(e){p.notify((e as Error).message);}
  finally{setBusy(false);}
 }
 async function uploadAvatar(file:File|undefined){
  if(!file||!supabase)return;setBusy(true);
  try{
   const optimized=await optimizeImage(file,'avatar');
   const user=(await supabase.auth.getUser()).data.user;if(!user)throw Error(t('settings.reloginPhoto'));
   const path=`${p.data.shop.id}/${user.id}/avatar-${Date.now()}.webp`;
   const up=await supabase.storage.from('profile-avatars').upload(path,optimized,{contentType:'image/webp',cacheControl:'31536000',upsert:false});if(up.error)throw up.error;
   const url=supabase.storage.from('profile-avatars').getPublicUrl(path).data.publicUrl;
   await api('/profile/avatar',p.data.shop.id,{avatarUrl:url,avatarPath:path},'PATCH');
   if(avatarPath&&avatarPath!==path)await supabase.storage.from('profile-avatars').remove([avatarPath]);
   setAvatarUrl(url);setAvatarPath(path);await p.refresh();p.notify(t('settings.photoUpdated'));
  }catch{p.notify(t('settings.photoFailed'));}finally{setBusy(false);}
 }
 async function saveBrand(){
  setBusy(true);
  try{await api('/shop/branding',p.data.shop.id,{title,description,logoUrl,coverUrl,backgroundUrl,accentColor},'PATCH');await p.refresh();p.notify(t('settings.brandUpdated'));}
  catch(e){p.notify((e as Error).message);}
  finally{setBusy(false);}
 }
 async function uploadBrand(file:File|undefined,kind:'logo'|'cover'|'background'){
  if(!file||!supabase)return;setBusy(true);
  try{const optimized=await optimizeImage(file,kind);const user=(await supabase.auth.getUser()).data.user;if(!user)throw Error(t('settings.reloginImage'));const path=`${p.data.shop.id}/${user.id}/settings-${kind}-${Date.now()}.webp`;const up=await supabase.storage.from('branding-assets').upload(path,optimized,{contentType:'image/webp',cacheControl:'31536000',upsert:false});if(up.error)throw up.error;const url=supabase.storage.from('branding-assets').getPublicUrl(path).data.publicUrl;if(kind==='logo')setLogoUrl(url);if(kind==='cover')setCoverUrl(url);if(kind==='background')setBackgroundUrl(url);p.notify(t('settings.imageReady'));}catch{p.notify(t('settings.imageFailed'));}finally{setBusy(false);}
 }
 async function copy(value:string){
  try{await navigator.clipboard.writeText(value);p.notify(t('settings.linkCopied'));}
  catch{p.notify(t('settings.copyFailed'));}
 }


 const sections=[
  ['profile',t('settings.profile'),UserRound],
  ...(owner?[['barbershop',solo?t('settings.professionalProfile'):t('settings.business'),Store] as const,['plan',t('settings.fioPlan'),Crown] as const]:[]),
  ...(p.data.membership.role!=='CLIENT'?[['access',t('settings.accessApp'),ShieldCheck] as const]:[]),
  ['account',t('settings.accountSecurity'),KeyRound],
  ['notifications',t('settings.notifications'),MessageCircle],
  ['language',t('settings.language'),Languages],
  ...(owner&&!solo?[['schedule',t('settings.teamSchedule'),CalendarDays] as const]:[]),
 ] as const;

 return <>
  <button className="settings-back" type="button" onClick={()=>section==='home'?navigate(p.base):setSection('home')}><ArrowLeft size={16}/>{t('settings.back')}</button>
  <PageTitle eyebrow={t('settings.title').toUpperCase()} title={t('settings.title')} description={t('settings.description')}/>
  <div className={`settings-workspace category-settings ${section==='home'?'at-home':'in-category'}`}>
   <nav className="settings-nav" aria-label={t('settings.title')}>
    {sections.map(([key,label,Icon])=><button key={key} type="button" className={section===key?'active':''} onClick={()=>setSection(key)}><Icon size={17}/><span>{label}</span></button>)}
   </nav>

   <div className="settings-content">{section==='schedule'&&owner&&<StaffSchedule {...p}/>} {section==='notifications'&&<PushSettings {...p}/>} {section==='language'&&<section className="settings-card"><LanguageSettings onSave={async preferences=>{if(!supabase)throw new Error(t('errors.generic'));await saveLocalePreferences(supabase,p.data.shop.id,preferences);p.notify(t('language.saved'));}}/></section>}<div className="settings-shortcuts">{owner&&!solo&&<button className="secondary" onClick={()=>navigate(p.base+'/equipe')}><Users size={17}/>{t("settings.team")}</button>}<button className="secondary" onClick={()=>{const next=document.documentElement.dataset.theme==='light'?'dark':'light';window.dispatchEvent(new CustomEvent('fio-theme-change',{detail:next}));}}><Palette size={17}/>{t('settings.appearance')}</button><button className="secondary" onClick={()=>navigate(p.base+'/suporte')}><CircleHelp size={17}/>{t("settings.help")}</button></div>
    {section==='profile'&&<>
     <section className="settings-card settings-profile-card">
      <div className="settings-profile-head">
       <span className="avatar settings-avatar">{avatarUrl?<img src={avatarUrl} alt={t('settings.profile')}/>:p.data.membership.display_name.split(' ').map(n=>n[0]).slice(0,2).join('')}</span>
       <div><h2>{p.data.membership.display_name}</h2><p className="muted">{owner?(solo?t('settings.soloRole'):t('settings.ownerRole')):p.data.membership.role==='BARBER'?t('settings.staffRole'):t('settings.clientRole')}</p></div>
      </div>
      <label className="profile-photo-action"><ImagePlus size={16}/><span>{t('settings.profilePhoto')}</span><input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void uploadAvatar(e.target.files?.[0])}/></label>
      {accountEmail&&<div className="settings-readonly"><span>{t('settings.accountEmail')}</span><strong>{accountEmail}</strong></div>}
      <Field label={t('settings.yourName')}><input minLength={2} maxLength={100} value={displayName} onChange={e=>setDisplayName(e.target.value)}/></Field>
      <Field label={t('settings.phone')}><input type="tel" inputMode="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder={t('ws.phonePlaceholder')}/></Field>
      <button className="primary" disabled={busy||displayName.trim().length<2} onClick={saveContact}>{busy?t('settings.saving'):t('settings.saveProfile')}</button>
     </section>
     <section className="settings-card">
      <div className="section-title"><h2>{t('settings.app')}</h2><span className="muted">{owner?t('settings.ownerApp'):p.data.membership.role==='BARBER'?t('settings.staffApp'):t('settings.clientApp')}</span></div>
      <p className="muted">{t('settings.appDesc')}</p>
      <button className="secondary" onClick={()=>void p.installApp?.()}><Download size={16}/>{p.canInstall?t('settings.install'):t('settings.howInstall')}</button>
     </section>
    </>}

    {section==='barbershop'&&owner&&<>
     <section className="settings-card branding-card">
      <div className="section-title"><h2>{solo?t('settings.identityProfessional'):t('settings.identityShop')}</h2><span className="muted">{t('settings.clientView')}</span></div>
      <Field label={t('settings.displayName')}><input maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}/></Field>
      <Field label={t('settings.descriptionField')}><textarea maxLength={280} value={description} onChange={e=>setDescription(e.target.value)} placeholder={t('settings.descriptionPlaceholder')}/></Field>
      <div className="branding-upload-grid">
       <label className="branding-upload"><span>{t('settings.logo')}</span>{logoUrl&&<img className="branding-thumbnail" src={logoUrl} alt={t('settings.previewLogo')}/>}<small>{logoUrl?t('settings.selectedImage'):t('settings.chooseGallery')}</small><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void uploadBrand(e.target.files?.[0],'logo')}/></label>
       <label className="branding-upload"><span>{t('settings.cover')}</span>{coverUrl&&<img className="branding-thumbnail" src={coverUrl} alt={t('settings.previewCover')}/>}<small>{coverUrl?t('settings.selectedImage'):t('settings.chooseGallery')}</small><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void uploadBrand(e.target.files?.[0],'cover')}/></label>
       <label className="branding-upload"><span>{t('settings.background')}</span>{backgroundUrl&&<img className="branding-thumbnail" src={backgroundUrl} alt={t('settings.previewBackground')}/>}<small>{backgroundUrl?t('settings.selectedImage'):t('settings.chooseGallery')}</small><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void uploadBrand(e.target.files?.[0],'background')}/></label>
      </div>
      <Field label={t('settings.primaryColor')}><div className="color-field"><input type="color" value={accentColor} onChange={e=>setAccentColor(e.target.value)}/><input value={accentColor} maxLength={7} pattern="#[0-9A-Fa-f]{6}" onChange={e=>setAccentColor(e.target.value)}/></div></Field>
      <div className="branding-preview" style={{'--preview-accent':accentColor,'--preview-accent-contrast':accentContrast(accentColor),backgroundImage:backgroundUrl?`linear-gradient(#0009,#000b),url(${backgroundUrl})`:undefined} as CSSProperties}>
       <span style={{backgroundImage:logoUrl?`url(${logoUrl})`:undefined}}>{!logoUrl?'LOGO':''}</span>
       <div><strong>{title||p.data.shop.name}</strong><small>{description||t('settings.previewDesc')}</small></div>
       <button type="button">{t('settings.book')}</button>
      </div>
      <button className="primary" disabled={busy} onClick={saveBrand}><Palette size={16}/>{busy?t('settings.saving'):t('settings.saveIdentity')}</button>
     </section>
     <section className="settings-card">
      <div className="section-title"><h2>{t('settings.siteApp')}</h2><span className="muted">{t('settings.siteAppDesc')}</span></div>
      <div className="share-links">
       <button onClick={()=>copy(links.clientes)}><LinkIcon size={17}/><div><span>{t('settings.publicLink')}</span><small>{links.clientes}</small></div><Copy size={16}/></button>
      </div>
      <p className="muted settings-help">{t('settings.logoIdentifies')}</p>
     </section>
    </>}

    {section==='plan'&&owner&&<>
     <section className="settings-card">
      <div className="section-title"><h2>{t('settings.subscription')}</h2><span className="muted">{p.data.plan}</span></div>
      <div className="settings-plan-summary"><span className="settings-plan-icon"><Crown size={20}/></span><div><strong>FIO {p.data.plan}</strong><small>{p.data.fioSubscription.status==='trialing'&&p.data.fioSubscription.trial_ends_at?t('settings.currentTrialUntil',{date:formatDate(p.data.fioSubscription.trial_ends_at)}):p.data.fioSubscription.current_period_end?t('settings.currentPeriodUntil',{date:formatDate(p.data.fioSubscription.current_period_end)}):t('settings.currentShopPlan')}</small></div></div>
      <p className="muted">{t('settings.subscriptionDesc')}</p>
      <button className="primary" onClick={()=>navigate(`${p.base}/plano-fio`)}><Crown size={16}/>{t('settings.viewPlans')}</button>
     </section>
    </>}

    {section==='access'&&p.data.membership.role!=='CLIENT'&&<>
     <section className="settings-card">
      <div className="section-title"><h2>{t('settings.accessLinks')}</h2><span className="muted">{t('settings.readyShare')}</span></div>
      <div className="share-links">
       {owner&&<button onClick={()=>copy(links.gestao)}><LinkIcon size={17}/><div><span>{t('settings.management')}</span><small>{links.gestao}</small></div><Copy size={16}/></button>}
       {owner&&!solo&&<button onClick={()=>copy(links.equipe)}><LinkIcon size={17}/><div><span>{t('settings.teamApp')}</span><small>{links.equipe}</small></div><Copy size={16}/></button>}
       <button onClick={()=>copy(links.clientes)}><LinkIcon size={17}/><div><span>{t('settings.clientLink')}</span><small>{links.clientes}</small></div><Copy size={16}/></button>
      </div>
     </section>
     {owner&&!solo&&<section className="settings-card">
      <div className="section-title"><h2>{t('settings.permissions')}</h2><span className="muted">{t('settings.permissionsDesc')}</span></div>
      <p className="muted">{t('settings.permissionsText')}</p>
      <button className="secondary" onClick={()=>navigate(`${p.base}/equipe`)}><Users size={16}/>{t('settings.openTeam')}</button>
     </section>}
    </>}

    {section==='account'&&<>
     <section className="settings-card">
      <div className="section-title"><h2>{t('settings.changePassword')}</h2><span className="muted">{t('settings.protect')}</span></div>
      <p>{t('settings.changePasswordText')}</p>
      <a className="primary" href={`/login?mode=forgot&audience=${owner?'owner':p.data.membership.role==='BARBER'?'staff':'client'}&email=${encodeURIComponent(accountEmail)}&shop=${encodeURIComponent(p.data.shop.slug)}`}>{t('settings.changePasswordAction')}</a>
     </section>
     <section className="settings-card">
      <div className="section-title"><h2>{t('settings.session')}</h2></div>
      <p className="muted">{t('settings.sessionText')}</p>
      <button className="secondary" onClick={()=>void supabase?.auth.signOut()}><LogOut size={16}/>{t('settings.signOut')}</button>
     </section>
     <section className="settings-card settings-danger-zone">
      <div className="section-title"><h2>{t('settings.deleteAccount')}</h2><span className="muted">{t('settings.permanent')}</span></div>
      <p className="muted">{t('settings.deleteText')}</p>
      <button className="danger" type="button" onClick={()=>p.notify(t('settings.deleteNotice'))}>{t('settings.deleteAccount')}</button>
     </section>
    </>}
   </div>
  </div>
  <section className="settings-card settings-meta">
   <div><span>{solo?t('settings.profileMeta'):t('settings.shopMeta')}</span><strong>{p.data.shop.name}</strong></div>
   <div><span>{t('settings.fioPlan')}</span><strong>{p.data.plan}</strong></div>
   <div><span>{t('settings.assistant')}</span><strong>{p.data.aiEnabled?t('settings.included'):t('settings.unavailable')}</strong></div>
  </section>
 </>;
}









