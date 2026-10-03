import { WhatsAppIcon } from '../components/WhatsAppIcon';
import { useEffect,useMemo,useState,type CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowRight,Clock3,Download,ExternalLink,Info,MapPin,Search,Scissors,Share2,Smartphone,SquarePlus,Users,X } from 'lucide-react';
import { whatsappUrl } from '../../shared/phone';
import { InAppBrowserBanner } from '../components/InAppBrowserBanner';
import {useI18n} from '../i18n';

type PublicShop={id:string;name:string;slug:string;operation_mode?:'SHOP'|'SOLO';public_title?:string|null;public_description?:string|null;logo_url?:string|null;cover_url?:string|null;background_url?:string|null;accent_color?:string|null;theme_mode?:'light'|'dark';palette_key?:string|null;custom_accent?:string|null;whatsapp?:string|null;instagram?:string|null;address?:string|null};
type PublicPalette={light_background:string;light_surface:string;light_text:string;light_text_muted:string;light_accent:string;dark_background:string;dark_surface:string;dark_text:string;dark_text_muted:string;dark_accent:string};
type PublicData={shop:PublicShop;palette?:PublicPalette|null;services:{id:string;name:string;description?:string|null;duration_minutes:number;price_cents:number}[];team:{user_id:string;display_name:string;role:'OWNER'|'BARBER';avatar_url?:string|null}[];subscriptionPlans:{id:string;name:string;description?:string|null;cuts:number;validity_days:number;price_cents:number;active:boolean}[]};
type InstallPromptEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
type PortalTab='services'|'details'|'team';
type InstallPlatform='android'|'windows'|'mac'|'iphone';
type ClientPlatform=InstallPlatform|'other';

function pathSlug(pathname:string){
 const parts=pathname.split('/').filter(Boolean);
 if(parts[0]==='barbearia'||parts[0]==='b')return parts[1]??'';
 return parts[0]??'';
}

function standaloneMode(){
 return typeof window!=='undefined'&&(window.matchMedia?.('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true);
}

function detectClientPlatform():ClientPlatform{
 if(typeof navigator==='undefined')return 'other';
 const ua=navigator.userAgent.toLowerCase();
 const iPadDesktop=navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
 if(/iphone|ipad|ipod/.test(ua)||iPadDesktop)return 'iphone';
 if(/android/.test(ua))return 'android';
 if(/windows/.test(ua))return 'windows';
 if(/macintosh|mac os x/.test(ua))return 'mac';
 return 'other';
}


function publicMapsUrl(address:string){
 const value=address.trim();
 return value?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`:null;
}

function publicInstagramUrl(instagram:string){
 const raw=instagram.trim();
 if(!raw)return null;
 try{
  if(/^https?:\/\//i.test(raw)){
   const url=new URL(raw);
   if(/(^|\.)instagram\.com$/i.test(url.hostname))return url.toString();
  }
 }catch{/* usa o identificador abaixo */}
 const handle=raw.replace(/^@+/, '').replace(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i,'').split(/[/?#]/)[0]?.trim();
 return handle?`https://www.instagram.com/${encodeURIComponent(handle)}/`:null;
}

function publicWhatsappUrl(phone:string|undefined|null,message:string){
 const base=whatsappUrl(phone);
 if(!base)return null;
 return `${base}${base.includes('?')?'&':'?'}text=${encodeURIComponent(message)}`;
}

function accentContrast(hex:string){
 const value=hex.replace('#','');
 if(!/^[0-9a-f]{6}$/i.test(value))return '#080808';
 const r=parseInt(value.slice(0,2),16),g=parseInt(value.slice(2,4),16),b=parseInt(value.slice(4,6),16);
 return (r*299+g*587+b*114)/1000<145?'#ffffff':'#080808';
}

export function PublicPortal(){
 const {t,locale,formatCurrency}=useI18n();
 const {pathname}=useLocation(),slug=pathSlug(pathname);
 const [data,setData]=useState<PublicData|null>(null),[error,setError]=useState(''),[installEvent,setInstallEvent]=useState<InstallPromptEvent|null>(null),[installGuide,setInstallGuide]=useState(false),[installGate,setInstallGate]=useState(false),[installing,setInstalling]=useState(false),[installMessage,setInstallMessage]=useState(''),[tab,setTab]=useState<PortalTab>('services'),[query,setQuery]=useState('');
 const standalone=standaloneMode();
 const clientPlatform=detectClientPlatform();

 useEffect(()=>{
  if(!slug){setError(t('public.invalidAddress'));return;}
  const manifest=document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  const previous=manifest?.href;
  if(manifest)manifest.href=`/api/public/manifest/${encodeURIComponent(slug)}?v=client-brand-v2`;
  type InstallWindow=Window&{__fioInstallPrompt?:InstallPromptEvent|null};
  const installWindow=window as InstallWindow;
  const syncInstallPrompt=()=>setInstallEvent(installWindow.__fioInstallPrompt??null);
  const listener=(event:Event)=>{event.preventDefault();installWindow.__fioInstallPrompt=event as InstallPromptEvent;setInstallEvent(event as InstallPromptEvent);};
  syncInstallPrompt();
  window.addEventListener('beforeinstallprompt',listener);
  window.addEventListener('fio-install-ready',syncInstallPrompt);
  let active=true;const controller=new AbortController();
  setData(null);setError('');
  fetch(`/api/public/shop/${encodeURIComponent(slug)}`,{signal:controller.signal,cache:'no-store'}).then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.message||t('public.openError'));return body as PublicData;}).then(result=>{if(active)setData(result);}).catch(()=>{if(active)setError(t('public.openNowError'));});
  return()=>{active=false;controller.abort();window.removeEventListener('beforeinstallprompt',listener);window.removeEventListener('fio-install-ready',syncInstallPrompt);if(manifest&&previous)manifest.href=previous;};
 },[slug,t]);

 const title=useMemo(()=>data?.shop.public_title||data?.shop.name||'FIO',[data]);
 useEffect(()=>{
  if(!data)return;
  const oldTitle=document.title;document.title=title;
  let apple=document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  const created=!apple;
  const oldHref=apple?.href;
  if(!apple){apple=document.createElement('link');apple.rel='apple-touch-icon';document.head.appendChild(apple);}
  let favicon=document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  const faviconCreated=!favicon;
  const oldFavicon=favicon?.href;
  if(!favicon){favicon=document.createElement('link');favicon.rel='icon';document.head.appendChild(favicon);}
  if(data.shop.logo_url){apple.href=data.shop.logo_url;favicon.href=data.shop.logo_url;}
  return()=>{document.title=oldTitle;if(created)apple?.remove();else if(apple&&oldHref)apple.href=oldHref;if(faviconCreated)favicon?.remove();else if(favicon&&oldFavicon)favicon.href=oldFavicon;};
 },[data,title]);

 const filteredServices=useMemo(()=>{const q=query.trim().toLocaleLowerCase(locale==='en'?'en-US':locale);return !q?data?.services??[]:(data?.services??[]).filter(service=>`${service.name} ${service.description??''}`.toLocaleLowerCase(locale==='en'?'en-US':locale).includes(q));},[data?.services,query,locale]);
 const goClient=()=>window.location.assign(`/login?shop=${encodeURIComponent(slug)}&audience=client`);
 function requireApp(_reason:string){
  if(standalone){goClient();return;}
  setInstallMessage('');
  setInstallGate(true);
 }
 async function installPlatform(platform:InstallPlatform){
  if(standalone){goClient();return;}
  setInstallMessage('');
  if(platform==='iphone'){
   setInstallGate(false);
   setInstallGuide(true);
   return;
  }
  if(clientPlatform!=='other'&&clientPlatform!==platform){
   const labels:Record<InstallPlatform,string>={android:'Android',windows:'Windows',mac:'Mac',iphone:'iPhone'};
   setInstallMessage(t('public.openOnDevice',{platform:labels[platform]}));
   setInstallGate(true);
   return;
  }
  if(installing)return;
  type InstallWindow=Window&{__fioInstallPrompt?:InstallPromptEvent|null};
  const installWindow=window as InstallWindow;
  const prompt=installEvent??installWindow.__fioInstallPrompt??null;
  if(!prompt){
   setInstallMessage(platform==='mac'
    ?t('public.installMacUnavailable')
    :t('public.installUnavailable'));
   setInstallGate(true);
   return;
  }
  setInstalling(true);
  try{
   await prompt.prompt();
   const choice=await prompt.userChoice;
   installWindow.__fioInstallPrompt=null;
   setInstallEvent(null);
   if(choice.outcome==='accepted')setInstallGate(false);
   else setInstallMessage(t('public.installCancelled'));
  }finally{setInstalling(false);}
 }
 function openInstallChooser(_reason=t('public.chooseDeviceReason')){
  if(standalone){goClient();return;}
  setInstallMessage('');
  setInstallGate(true);
 }

 if(error)return <div className="public-portal centered-state"><img src="/FIOlogo/FIObranco.png" alt="FIO"/><h1>{t('public.openFailed')}</h1><p>{error}</p></div>;
 if(!data)return <div className="public-portal centered-state"><img className="pulse-mark" src="/FIOlogo/FIObranco.png" alt="FIO"/><p>{t('public.preparing')}</p></div>;

 const dark=data.shop.theme_mode!=='light',p=data.palette;const accent=data.shop.custom_accent||data.shop.accent_color||(dark?p?.dark_accent:p?.light_accent)||'#ff8a00';
 const portalStyle={'--shop-accent':accent,'--shop-accent-contrast':accentContrast(accent),'--public-bg':dark?p?.dark_background||'#080808':p?.light_background||'#f5f5f2','--public-surface':dark?p?.dark_surface||'#111111':p?.light_surface||'#ffffff','--public-text':dark?p?.dark_text||'#f5f5f5':p?.light_text||'#111111','--public-muted':dark?p?.dark_text_muted||'#8d8d8d':p?.light_text_muted||'#666666',backgroundImage:data.shop.background_url?`linear-gradient(${dark?'rgba(0,0,0,.82),rgba(0,0,0,.9)':'rgba(245,245,242,.88),rgba(245,245,242,.94)'}),url(${data.shop.background_url})`:undefined,backgroundSize:data.shop.background_url?'460px auto':undefined,backgroundAttachment:data.shop.background_url?'fixed':undefined} as CSSProperties;
 const providerLabel=data.shop.operation_mode==='SOLO'?t('public.provider.solo'):t('public.provider.shop');
 const mapsHref=data.shop.address?publicMapsUrl(data.shop.address):null;
 const instagramHref=data.shop.instagram?publicInstagramUrl(data.shop.instagram):null;
 const contactHref=publicWhatsappUrl(data.shop.whatsapp,t('public.whatsappMessage',{title}));

 return <div className="public-portal branded-portal booking-showcase" style={portalStyle}>
  <InAppBrowserBanner/>
  <header className="booking-showcase-hero" style={data.shop.cover_url?{backgroundImage:`linear-gradient(180deg,rgba(0,0,0,.16),rgba(0,0,0,.84)),url(${data.shop.cover_url})`}:undefined}>
   <div className="booking-showcase-top">
    <span className="booking-showcase-badge">{providerLabel}</span>
    <div className="booking-showcase-actions">
     <button type="button" className="booking-install-top" onClick={goClient}>{t('role.clientArea')}</button>
     <button type="button" className="booking-install-top" onClick={()=>openInstallChooser()}><Download size={15}/>{standalone?t('public.openApp'):t('public.downloadApp')}</button>
    </div>
   </div>
   <div className="booking-showcase-identity">
    <div className="booking-showcase-logo">{data.shop.logo_url?<img src={data.shop.logo_url} alt={title}/>:<Scissors size={34}/>}</div>
    <div><h1>{title}</h1>{data.shop.address&&<p><MapPin size={13}/>{data.shop.address}</p>}<span>{data.shop.public_description||t('public.defaultDesc')}</span></div>
   </div>
  </header>

  <nav className="booking-showcase-tabs" aria-label={t('public.infoAria')}>
   <button className={tab==='services'?'active':''} onClick={()=>setTab('services')}><Scissors size={14}/>{t('public.services')}</button>
   <button className={tab==='details'?'active':''} onClick={()=>setTab('details')}><Info size={14}/>{t('public.details')}</button>
   <button className={tab==='team'?'active':''} onClick={()=>setTab('team')}><Users size={14}/>{t('public.professionals')}</button>
  </nav>

  <main className="booking-showcase-content">
   {!standalone&&<section className="booking-app-card booking-app-card-platforms">
    <span className="booking-app-icon">{data.shop.logo_url?<img src={data.shop.logo_url} alt=""/>:<Smartphone size={20}/>}</span>
    <div><strong>{t('public.installTitle',{title})}</strong><small>{t('public.installDesc',{kind:data.shop.operation_mode==='SOLO'?t('public.kind.solo'):t('public.kind.shop')})}</small></div>
    <div className="booking-platform-buttons" aria-label={t('public.platformAria')}>
     <button className={clientPlatform==='windows'?'brand-button recommended':''} onClick={()=>void installPlatform('windows')}><Download size={14}/>Windows</button>
     <button className={clientPlatform==='android'?'brand-button recommended':''} onClick={()=>void installPlatform('android')}><Download size={14}/>Android</button>
     <button className={clientPlatform==='mac'?'brand-button recommended':''} onClick={()=>void installPlatform('mac')}><Download size={14}/>Mac</button>
     <button className={clientPlatform==='iphone'?'brand-button recommended':''} onClick={()=>void installPlatform('iphone')}><Smartphone size={14}/>iPhone</button>
    </div>
   </section>}

   {tab==='services'&&<section className="booking-services-section">
    <label className="booking-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('public.searchService')} aria-label={t('public.searchServiceAria')}/></label>
    <div className="booking-service-list">
     {filteredServices.map(service=><article key={service.id} className="booking-service-row">
      <span className="booking-service-icon"><Scissors size={18}/></span>
      <div className="booking-service-main"><strong>{service.name}</strong>{service.description&&<p>{service.description}</p>}<div><b>{formatCurrency(service.price_cents/100,'BRL')}</b><span><Clock3 size={12}/>{service.duration_minutes} min</span></div></div>
      <button className="booking-service-action" onClick={()=>requireApp(t('public.installForService',{service:service.name,title}))}>{t('public.book')}</button>
     </article>)}
     {!filteredServices.length&&<p className="public-empty">{t('public.noService')}</p>}
    </div>
   </section>}

   {tab==='details'&&<section className="booking-details-grid">
    {mapsHref?<a href={mapsHref} target="_blank" rel="noreferrer" aria-label={t('public.openMap',{title})}><span><MapPin size={17}/></span><div><small>{t('public.local')}</small><strong>{data.shop.address}</strong></div><ExternalLink size={15}/></a>:<article><span><MapPin size={17}/></span><div><small>{t('public.local')}</small><strong>{t('public.addressAtService')}</strong></div></article>}
    {instagramHref&&<a href={instagramHref} target="_blank" rel="noreferrer" aria-label={t('public.openInstagram',{title})}><span>@</span><div><small>{t('public.instagram')}</small><strong>@{String(data.shop.instagram).replace(/^@+/,'').replace(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i,'').split(/[/?#]/)[0]}</strong></div><ExternalLink size={15}/></a>}
    {contactHref&&<a href={contactHref} target="_blank" rel="noreferrer" aria-label={t('public.whatsappAria',{title})}><span><WhatsAppIcon size={17}/></span><div><small>{t('public.contact')}</small><strong>{t('public.talkWhatsapp')}</strong></div><ExternalLink size={15}/></a>}
    <article className="booking-details-about"><div><small>{t('public.about')}</small><strong>{title}</strong><p>{data.shop.public_description||t('public.aboutDesc')}</p></div></article>
   </section>}

   {tab==='team'&&<section className="booking-team-list">
    {data.team.map(member=><article key={member.user_id}><span className="booking-team-avatar">{member.avatar_url?<img src={member.avatar_url} alt=""/>:member.display_name.split(' ').map(x=>x[0]).slice(0,2).join('')}</span><div><strong>{member.display_name}</strong><small>{member.role==='OWNER'?(data.shop.operation_mode==='SOLO'?t('public.role.ownerSolo'):t('public.role.ownerShop')):t('public.role.barber')}</small></div></article>)}
   </section>}

   {data.subscriptionPlans?.length>0&&tab==='details'&&<section className="booking-plans"><h2>{t('public.plans')}</h2>{data.subscriptionPlans.map(plan=><article key={plan.id}><div><strong>{plan.name}</strong><small>{t('public.cuts',{count:plan.cuts,suffix:plan.cuts===1?'':'s',days:plan.validity_days})}</small></div><b>{formatCurrency(plan.price_cents/100,'BRL')}</b></article>)}</section>}
  </main>

  <footer className="booking-powered">
   <div className="booking-powered-card">
    <span className="booking-powered-kicker">{t('public.powered')}</span>
    <strong>{t('public.createShop')}</strong>
    <p>{t('public.createShopDesc')}</p>
    <a href="/login?audience=owner&mode=signup">{t('public.startNow')} <ArrowRight size={15}/></a>
   </div>
  </footer>

  {installGate&&<div className="client-app-gate" role="dialog" aria-modal="true" aria-label={t('public.installAria')}><div className="client-app-gate-card">
   <button className="client-app-gate-close" aria-label={t('public.close')} onClick={()=>setInstallGate(false)}><X size={18}/></button>
   <span className="client-app-gate-logo">{data.shop.logo_url?<img src={data.shop.logo_url} alt=""/>:<Download size={23}/>}</span>
   <p className="eyebrow">{t('public.downloadEyebrow')}</p><h2>{t('public.downloadContinue',{title})}</h2><p>{t('public.chooseDevice')}</p>
   <div className="client-platform-grid" aria-label={t('public.deviceAria')}>
    <button className={clientPlatform==='windows'?'brand-button recommended':''} onClick={()=>void installPlatform('windows')} disabled={installing}><Download size={16}/><span>Windows</span>{clientPlatform==='windows'&&<small>{t('public.thisDevice')}</small>}</button>
    <button className={clientPlatform==='android'?'brand-button recommended':''} onClick={()=>void installPlatform('android')} disabled={installing}><Download size={16}/><span>Android</span>{clientPlatform==='android'&&<small>{t('public.thisDevice')}</small>}</button>
    <button className={clientPlatform==='mac'?'brand-button recommended':''} onClick={()=>void installPlatform('mac')} disabled={installing}><Download size={16}/><span>Mac</span>{clientPlatform==='mac'&&<small>{t('public.thisDevice')}</small>}</button>
    <button className={clientPlatform==='iphone'?'brand-button recommended':''} onClick={()=>void installPlatform('iphone')} disabled={installing}><Smartphone size={16}/><span>iPhone</span>{clientPlatform==='iphone'&&<small>{t('public.thisDevice')}</small>}</button>
   </div>
   {installing&&<p className="client-install-status">{t('public.openingInstall')}</p>}
   {installMessage&&<p className="client-install-status warning">{installMessage}</p>}
  </div></div>}

  {installGuide&&<div className="install-guide-overlay" role="dialog" aria-modal="true"><div className="install-guide-card client-install-guide"><button className="install-guide-close" aria-label={t('public.close')} onClick={()=>setInstallGuide(false)}><X size={18}/></button>
   <span className="client-guide-logo">{data.shop.logo_url?<img src={data.shop.logo_url} alt=""/>:<Download size={23}/>}</span>
   <h2>{t('public.installIphone')}</h2>
   <div className="install-guide-step"><Share2 size={20}/><span>{t('public.iphoneStep1')}</span></div><div className="install-guide-step"><SquarePlus size={20}/><span>{t('public.iphoneStep2')}</span></div><div className="install-guide-step"><Download size={20}/><span>{t('public.iphoneStep3',{title})}</span></div>
   <p>{t('public.personalized')}</p>
  </div></div>}
 </div>;
}

