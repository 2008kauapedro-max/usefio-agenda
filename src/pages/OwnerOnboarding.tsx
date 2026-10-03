import { useI18n } from '../i18n';
import { useEffect,useMemo,useRef,useState,type ChangeEvent } from 'react';
import { Check,ChevronLeft,ChevronRight,Copy,ExternalLink,ImagePlus,Plus,Share2,Trash2 } from 'lucide-react';
import { api,supabase } from '../lib/api';
import { optimizeImage } from '../lib/images';
import { QRCodeSVG } from 'qrcode.react';

type Service={id?:string;_key:string;name:string;description?:string|null;duration_minutes:number;price_cents:number;active:boolean;_durationInput?:string;_priceInput?:string};
type DaySchedule={weekday:number;enabled:boolean;opensAt:string;closesAt:string};
type Snapshot={
 progress:{current_step:number;completed_steps:number[];draft:Record<string,unknown>}|null;
 shop:{id:string;name:string;slug:string;operation_mode?:'SHOP'|'SOLO';onboarding_completed:boolean;onboarding_step:number;whatsapp:string|null;instagram:string|null;address:string|null;theme_mode:'light'|'dark';palette_key:string;custom_accent:string|null;logo_asset_path:string|null;cover_asset_path:string|null;background_asset_path:string|null};
 services:Omit<Service,'_key'>[];
 hours:{weekday:number;opens_at:string;closes_at:string}[];
 amenities:string[];
 palettes:Palette[];
 owner:{display_name:string;phone?:string|null};
};
type Palette={palette_key:string;label:string;light_background:string;light_surface:string;light_text:string;light_text_muted:string;light_accent:string;dark_background:string;dark_surface:string;dark_text:string;dark_text_muted:string;dark_accent:string};
type Props={onDone:()=>void;shopId?:string};

const amenityOptions=[['wifi','onboarding.amenityWifi'],['parking','onboarding.amenityParking'],['accessibility','onboarding.amenityAccessibility'],['kids','onboarding.amenityKids'],['air-conditioning','onboarding.amenityAir']] as const;
const weekdays=[['1','onboarding.dayMonShort','onboarding.dayMon'],['2','onboarding.dayTueShort','onboarding.dayTue'],['3','onboarding.dayWedShort','onboarding.dayWed'],['4','onboarding.dayThuShort','onboarding.dayThu'],['5','onboarding.dayFriShort','onboarding.dayFri'],['6','onboarding.daySatShort','onboarding.daySat'],['0','onboarding.daySunShort','onboarding.daySun']] as const;
const suggestedServices=[['onboarding.serviceCut',30,3500],['onboarding.serviceBeard',30,2500],['onboarding.serviceCutBeard',60,5500]] as const;
const slugify=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);
const cleanInstagram=(value:string)=>value.trim().replace(/^@+/,'').replace(/\s+/g,'');
const host=()=>typeof window==='undefined'?'usefio.vercel.app':window.location.host;
const newKey=()=>crypto.randomUUID();
type Translate=(key:string,vars?:Record<string,string|number>)=>string;
const serviceDefaults=(t:Translate):Service[]=>suggestedServices.map(([nameKey,duration,price])=>({_key:newKey(),name:t(nameKey),description:'',duration_minutes:duration,price_cents:price,active:true}));
const scheduleDefaults=():DaySchedule[]=>weekdays.map(([value])=>({weekday:Number(value),enabled:Number(value)!==0,opensAt:'09:00',closesAt:'19:00'}));
const assetUrl=(path:string|null)=>path&&import.meta.env.VITE_SUPABASE_URL?`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/branding-assets/${path}`:'';

function scheduleSummary(days:DaySchedule[],t:Translate){
 const enabled=weekdays.map(([value,labelKey])=>({label:t(labelKey),day:days.find(d=>d.weekday===Number(value))})).filter(x=>x.day?.enabled&&x.day.opensAt<x.day.closesAt) as {label:string;day:DaySchedule}[];
 if(!enabled.length)return [t('onboarding.noHours')];
 const groups:{from:string;to:string;opensAt:string;closesAt:string}[]=[];
 for(const item of enabled){
  const prev=groups.at(-1);
  if(prev&&prev.opensAt===item.day.opensAt&&prev.closesAt===item.day.closesAt){prev.to=item.label;}
  else groups.push({from:item.label,to:item.label,opensAt:item.day.opensAt,closesAt:item.day.closesAt});
 }
 return groups.map(g=>`${g.from===g.to?g.from:`${g.from}–${g.to}`} · ${g.opensAt}–${g.closesAt}`);
}

export function OwnerOnboarding({onDone,shopId:initialShopId}:Props){
 const {t,formatCurrency}=useI18n();
 const [shopId,setShopId]=useState(initialShopId??''),[step,setStep]=useState(1),[completed,setCompleted]=useState<number[]>([]),[draft,setDraft]=useState<Record<string,unknown>>({}),[snapshot,setSnapshot]=useState<Snapshot|null>(null),[loading,setLoading]=useState(Boolean(initialShopId)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[success,setSuccess]=useState(false);
 const [operationMode,setOperationMode]=useState<'SHOP'|'SOLO'>('SHOP'),[name,setName]=useState(''),[slug,setSlug]=useState(''),[slugTouched,setSlugTouched]=useState(false),[displayName,setDisplayName]=useState(''),[whatsapp,setWhatsapp]=useState(''),[instagram,setInstagram]=useState(''),[address,setAddress]=useState(''),[amenities,setAmenities]=useState<string[]>([]),[services,setServices]=useState<Service[]>(()=>serviceDefaults(t)),[schedules,setSchedules]=useState<DaySchedule[]>(scheduleDefaults),[hoursSaved,setHoursSaved]=useState(false),[paletteKey,setPaletteKey]=useState('fio-black'),[themeMode,setThemeMode]=useState<'light'|'dark'>('dark'),[customAccent,setCustomAccent]=useState('#ffffff'),[logoPath,setLogoPath]=useState<string|null>(null),[coverPath,setCoverPath]=useState<string|null>(null),[backgroundPath,setBackgroundPath]=useState<string|null>(null);
 const publicLink=shopId&&slug?`${window.location.origin}/${slug}`:'';
 const qrRef=useRef<HTMLDivElement>(null);

 useEffect(()=>{window.scrollTo({top:0,behavior:'auto'});},[step]);

 useEffect(()=>{
  if(shopId||!supabase)return;
  let active=true;
  void supabase.auth.getUser().then(({data:{user}})=>{
   if(!active||!user)return;
   const meta=user.user_metadata as Record<string,unknown>;
   const metaName=[meta?.display_name,meta?.full_name,meta?.name].find(v=>typeof v==='string'&&v.trim().length>=2);
   const accountPhone=typeof meta?.account_phone==='string'?meta.account_phone.trim():'';
   if(metaName)setDisplayName(current=>current||String(metaName).trim());
   if(accountPhone)setWhatsapp(current=>current||accountPhone);
  });
  return()=>{active=false;};
 },[shopId]);

 useEffect(()=>{
  if(!shopId)return;
  let active=true;
  setLoading(true);
  api<Snapshot>('/onboarding/progress',shopId).then(s=>{
   if(!active)return;
   setSnapshot(s);
   const d=s.progress?.draft??{};
   setStep(s.progress?.current_step??s.shop.onboarding_step??1);
   setCompleted(s.progress?.completed_steps??[]);
   setDraft(d);
   setOperationMode(s.shop.operation_mode??'SHOP');setName(s.shop.name);setSlug(s.shop.slug);setWhatsapp(s.shop.whatsapp??s.owner.phone??'');setInstagram(cleanInstagram(s.shop.instagram??''));setAddress(s.shop.address??'');setAmenities(s.amenities);
   setServices(s.services.length?s.services.map(service=>({...service,_key:service.id??newKey()})):serviceDefaults(t));
   const nextSchedules=scheduleDefaults();
   for(const hour of s.hours){const target=nextSchedules.find(x=>x.weekday===hour.weekday);if(target){target.enabled=true;target.opensAt=hour.opens_at.slice(0,5);target.closesAt=hour.closes_at.slice(0,5);}}
   if(s.hours.length){for(const day of nextSchedules)if(!s.hours.some(h=>h.weekday===day.weekday))day.enabled=false;}
   setSchedules(nextSchedules);setHoursSaved(s.hours.length>0);
   setPaletteKey(s.shop.palette_key);setThemeMode(s.shop.theme_mode);setCustomAccent(s.shop.custom_accent??'#ffffff');setLogoPath(s.shop.logo_asset_path);setCoverPath(s.shop.cover_asset_path);setBackgroundPath(s.shop.background_asset_path);setDisplayName(s.owner.display_name??'');setLoading(false);
  }).catch(e=>{if(active){setError((e as Error).message);setLoading(false);}});
  return()=>{active=false;};
 },[shopId]);

 const palettes=snapshot?.palettes??[];
 const selectedPalette=palettes.find(p=>p.palette_key===paletteKey);
 const previewStyle=useMemo(()=>{const p=selectedPalette;const dark=themeMode==='dark';return {'--ob-bg':customAccent&&paletteKey==='custom'?(dark?'#101010':'#f7f7f4'):(dark?p?.dark_background??'#080808':p?.light_background??'#f5f5f2'),'--ob-surface':dark?p?.dark_surface??'#111':p?.light_surface??'#fff','--ob-text':dark?p?.dark_text??'#fff':p?.light_text??'#111','--ob-muted':dark?p?.dark_text_muted??'#999':p?.light_text_muted??'#666','--ob-accent':paletteKey==='custom'?customAccent:(dark?p?.dark_accent??'#fff':p?.light_accent??'#111')} as React.CSSProperties;},[selectedPalette,paletteKey,themeMode,customAccent]);
 const logoPreview=assetUrl(logoPath);
 const validService=(s:Service)=>s.name.trim().length>=2&&s.duration_minutes>=10&&s.duration_minutes<=240&&s.price_cents>=0;
 const serviceDuration=(s:Service)=>s._durationInput??String(s.duration_minutes);
 const servicePrice=(s:Service)=>s._priceInput??(s.price_cents/100).toFixed(2);
 const updateDuration=(key:string,raw:string)=>setServices(xs=>xs.map(x=>x._key===key?{...x,_durationInput:raw,duration_minutes:raw===''?0:Number(raw)}:x));
 const updatePrice=(key:string,raw:string)=>setServices(xs=>xs.map(x=>x._key===key?{...x,_priceInput:raw,price_cents:raw===''?0:Math.round(Number(raw.replace(',','.'))*100)}:x));
 const validSchedules=schedules.filter(d=>d.enabled&&d.opensAt<d.closesAt);
 const savedActiveServices=services.filter(s=>s.id&&s.active&&validService(s));
 const missingRequirements=[!whatsapp.replace(/\D/g,'').match(/^\d{10,15}$/)?t('onboarding.reqWhatsapp'):null,!savedActiveServices.length?t('onboarding.reqService'):null,!hoursSaved||!validSchedules.length?t('onboarding.reqHours'):null,!logoPath?(operationMode==='SOLO'?t('onboarding.reqProLogo'):t('onboarding.reqShopLogo')):null].filter(Boolean) as string[];

 async function saveSetup(id:string,next:number,markComplete:boolean,extra:Record<string,unknown>={}){
  const nextCompleted=markComplete?Array.from(new Set([...completed,step])).sort():completed.filter(x=>x!==step);
  const nextDraft={...draft,...extra};
  await api('/onboarding/setup',id,{setup:{name:name.trim(),slug,whatsapp:whatsapp.trim(),instagram:cleanInstagram(instagram),address:address.trim(),themeMode,paletteKey,customAccent:paletteKey==='custom'?customAccent:null,amenities,logoAssetPath:logoPath,coverAssetPath:coverPath,backgroundAssetPath:backgroundPath},step:next,completedSteps:nextCompleted,draft:nextDraft});
  setCompleted(nextCompleted);setDraft(nextDraft);setStep(next);
 }

 async function createFirst(){
  setBusy(true);setError('');setNotice('');
  try{
   let ownerName=displayName.trim();
   if(!ownerName&&supabase){const current=await supabase.auth.getUser();const user=current.data.user;const meta=user?.user_metadata as Record<string,unknown>|undefined;const fromMeta=[meta?.display_name,meta?.full_name,meta?.name].find(v=>typeof v==='string'&&v.trim().length>=2);const fromEmail=user?.email?.split('@')[0]?.replace(/[._-]+/g,' ').trim();ownerName=typeof fromMeta==='string'?fromMeta.trim():(fromEmail&&fromEmail.length>=2?fromEmail:t('onboarding.ownerFallback'));}
   if(!ownerName)ownerName=t('onboarding.ownerFallback');setDisplayName(ownerName);
   const r=await api<{barbershopId:string}>('/onboarding',undefined,{mode:'create',name:name.trim(),slug,displayName:ownerName,operationMode,phone:whatsapp.trim()});
   setShopId(r.barbershopId);sessionStorage.setItem('fio-shop',r.barbershopId);return r.barbershopId;
  }catch(e){setError((e as Error).message);return '';}finally{setBusy(false);}
 }

 async function continueFromFirst(){
  const id=shopId||await createFirst();if(!id)return;
  setBusy(true);setError('');
  try{await saveSetup(id,2,true);setServices(list=>list.length?list:serviceDefaults(t));}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }

 async function persistServices(){
  if(!shopId)return false;
  const active=services.filter(s=>s.active);
  if(!active.length||active.some(s=>!validService(s))){setError(t('onboarding.serviceValidation'));return false;}
  setBusy(true);setError('');
  try{
   const next:Service[]=[];
   for(const s of services){
    if(!validService(s)||(!s.id&&!s.active))continue;
    const r=await api<Omit<Service,'_key'>>('/onboarding/services',shopId,{id:s.id,name:s.name.trim(),description:s.description?.trim()??'',durationMinutes:s.duration_minutes,priceCents:s.price_cents,active:s.active});
    next.push({...r,_key:s._key});
   }
   setServices(next);return true;
  }catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}
 }

 async function persistHours(){
  if(!shopId)return false;
  if(!validSchedules.length){setError(t('onboarding.hoursValidation'));return false;}
  setBusy(true);setError('');
  try{await api('/onboarding/hours',shopId,{days:schedules.map(d=>({weekday:d.weekday,enabled:d.enabled,opensAt:d.opensAt,closesAt:d.closesAt}))});setHoursSaved(true);return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}
 }

 async function nextStep(){
  setNotice('');setError('');
  if(step===1){await continueFromFirst();return;}
  if(!shopId)return;
  if(step===2){if(!await persistServices())return;await saveSetup(shopId,3,true);return;}
  if(step===3){if(!await persistHours())return;await saveSetup(shopId,4,true);return;}
  if(step===4){if(!logoPath){setError(t('onboarding.logoRequired'));return;}await saveSetup(shopId,5,true);}
 }

 async function skipStep(){
  if(!shopId||step<2||step>4)return;
  setBusy(true);setError('');
  try{const skipped=Array.from(new Set([...(Array.isArray(draft.skippedSteps)?draft.skippedSteps as number[]:[]),step]));await saveSetup(shopId,step+1,false,{skippedSteps:skipped});setNotice(t('onboarding.skipped'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }

 async function upload(e:ChangeEvent<HTMLInputElement>,kind:'logo'|'cover'|'background'){
  const file=e.target.files?.[0];if(!file||!shopId||!supabase)return;
  setBusy(true);setError('');
  try{
   const optimized=await optimizeImage(file,kind);
   const user=(await supabase.auth.getUser()).data.user;if(!user)throw Error(t('onboarding.signInAgain'));
   const path=`${shopId}/${user.id}/${kind}-${Date.now()}.webp`;
   const r=await supabase.storage.from('branding-assets').upload(path,optimized,{upsert:false,contentType:'image/webp',cacheControl:'31536000'});if(r.error)throw r.error;
   kind==='logo'?setLogoPath(path):kind==='cover'?setCoverPath(path):setBackgroundPath(path);
  }catch(e){setError((e as Error).message||t('onboarding.imageFailed'));}finally{setBusy(false);}
 }

 async function activate(){
  if(!shopId)return;
  if(missingRequirements.length){setError(t('onboarding.beforePublish',{items:missingRequirements.join(', ')}));return;}
  setBusy(true);setError('');
  try{await saveSetup(shopId,5,true);await api('/onboarding/activate',shopId,{});setSuccess(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }

 const copy=async()=>{if(publicLink)await navigator.clipboard?.writeText(publicLink);};
 const share=async()=>{if(publicLink&&navigator.share)await navigator.share({title:name,text:t('onboarding.shareText',{url:publicLink}),url:publicLink});else await copy();};
 const downloadQr=()=>{
  const svg=qrRef.current?.querySelector('svg');if(!svg||!publicLink)return;
  const source=`<?xml version="1.0" encoding="UTF-8"?>${new XMLSerializer().serializeToString(svg)}`;
  const url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=`${slug||'fio'}-qr-code.svg`;document.body.appendChild(anchor);anchor.click();anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const canContinue=step===1?Boolean(name.trim().length>=2&&/^[a-z0-9-]{3,60}$/.test(slug)&&whatsapp.replace(/\D/g,'').length>=10):step===2?services.some(s=>s.active&&validService(s)):step===3?validSchedules.length>0:step===4?Boolean(paletteKey&&logoPath):true;

 if(loading)return <div className="owner-onboarding ob-loading">{t('onboarding.loading')}</div>;
 if(success)return <div className="owner-onboarding ob-success"><span className="ob-success-mark"><Check/></span><p className="eyebrow">{t('onboarding.readyEyebrow')}</p><h1>{operationMode==='SOLO'?t('onboarding.soloReady'):t('onboarding.shopReady')}</h1><p className="ob-muted">{t('onboarding.spaceAvailable')}</p><div className="ob-success-actions"><a href={`/${slug}`} target="_blank" rel="noreferrer"><ExternalLink size={16}/>{t('onboarding.viewClient')}</a><button onClick={()=>void copy()}><Copy size={16}/>{t('onboarding.copyLink')}</button><button onClick={()=>void share()}><Share2 size={16}/>{t('onboarding.share')}</button><button onClick={onDone}>{t('onboarding.enterManagement')}</button></div><div className="ob-qr"><div className="ob-qr-code" ref={qrRef} aria-label={t('onboarding.qrLabel')}><QRCodeSVG value={publicLink} size={180} level="M" includeMargin bgColor="#ffffff" fgColor="#000000"/></div><button type="button" className="secondary" onClick={downloadQr}>{t('onboarding.downloadQr')}</button></div></div>;
 if(!shopId&&step!==1)return null;

 return <main className="owner-onboarding" style={previewStyle}>
  <header className="ob-header"><img className="ob-fio-logo" src={themeMode==='dark'?'/FIOlogo+nome/Branco.png':'/FIOlogo+nome/Preto.png'} alt="FIO"/><button className="ob-exit" onClick={()=>void supabase?.auth.signOut()}>{t('onboarding.exit')}</button></header>
  <section className="ob-progress"><div><span>{t('onboarding.step',{step})}</span><strong>{[operationMode==='SOLO'?t('onboarding.stepProfile'):t('onboarding.stepShop'),t('onboarding.stepServices'),t('onboarding.stepHours'),t('onboarding.stepIdentity'),t('onboarding.stepReview')][step-1]}</strong></div><div className="ob-progress-track"><i style={{width:`${step/5*100}%`}}/></div></section>
  <section className="ob-content">
   {notice&&<p className="ob-notice" role="status">{notice}</p>}
   {step===1&&<>
    <p className="ob-eyebrow">{t('onboarding.workEyebrow')}</p><h1>{t('onboarding.chooseSpace')}</h1><p className="ob-muted">{t('onboarding.workDesc')}</p>
    <div className="ob-mode-grid">
     <button type="button" disabled={Boolean(shopId)} className={operationMode==='SHOP'?'selected':''} onClick={()=>setOperationMode('SHOP')}><strong>{t('onboarding.shopTeam')}</strong><span>{t('onboarding.shopTeamDesc')}</span></button>
     <button type="button" disabled={Boolean(shopId)} className={operationMode==='SOLO'?'selected':''} onClick={()=>setOperationMode('SOLO')}><strong>{t('onboarding.solo')}</strong><span>{t('onboarding.soloDesc')}</span></button>
    </div>
    <label>{operationMode==='SOLO'?t('onboarding.professionalName'):t('onboarding.shopName')}<input autoFocus value={name} maxLength={100} placeholder={operationMode==='SOLO'?t('onboarding.professionalNamePlaceholder'):t('onboarding.shopNamePlaceholder')} onChange={e=>{const next=e.target.value;setName(next);if(!shopId&&!slugTouched)setSlug(slugify(next));}}/></label>
    <label>WhatsApp<input value={whatsapp} inputMode="tel" type="tel" placeholder="(11) 99999-9999" onChange={e=>setWhatsapp(e.target.value)}/></label>
    <label>Instagram <small>{t('onboarding.instagramHint')}</small><div className="ob-instagram-field"><span>@</span><input value={instagram} autoCapitalize="none" autoCorrect="off" placeholder="sua_barbearia" onChange={e=>setInstagram(cleanInstagram(e.target.value))}/></div></label>
    <label>{operationMode==='SOLO'?t('onboarding.soloAddress'):t('onboarding.address')} <small>{t('onboarding.optional')}</small><input value={address} placeholder={operationMode==='SOLO'?t('onboarding.soloAddressPlaceholder'):t('onboarding.addressPlaceholder')} onChange={e=>setAddress(e.target.value)}/></label>
    <label>{t('onboarding.siteLink')}<div className="ob-public-link-field"><span>{host()}/</span><input className="ob-slug" value={slug} maxLength={60} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="nome-da-barbearia" onChange={e=>{setSlugTouched(true);setSlug(slugify(e.target.value));}}/></div><small className="ob-link-preview">{t('onboarding.yourLink')} <b>{host()}/{slug||'nome-da-barbearia'}</b></small></label>
    {operationMode==='SHOP'&&<div className="ob-amenities"><span>{t('onboarding.amenities')} <small>{t('onboarding.amenitiesHint')}</small></span><div>{amenityOptions.map(([key,labelKey])=><button type="button" className={amenities.includes(key)?'selected':''} key={key} onClick={()=>setAmenities(a=>a.includes(key)?a.filter(x=>x!==key):[...a,key])}>{amenities.includes(key)?<Check size={14}/>:null}{t(labelKey)}</button>)}</div></div>}
   </>}

   {step===2&&<>
    <p className="ob-eyebrow">{t('onboarding.servicesEyebrow')}</p><h1>{t('onboarding.whatOffer')}</h1><p className="ob-muted">{t('onboarding.servicesDesc')}</p>
    <div className="ob-service-list">{services.map((s,index)=><article className="ob-service-card" key={s.id??s._key}>
     <div className="ob-service-card-head"><strong>{t('onboarding.serviceNumber',{number:index+1})}</strong><button type="button" className={s.active?'ob-service-status is-active':'ob-service-status'} onClick={()=>setServices(xs=>xs.map(x=>x._key===s._key?{...x,active:!x.active}:x))}>{s.active?t('onboarding.active'):t('onboarding.inactive')}</button></div>
     <label>{t('onboarding.serviceName')}<input value={s.name} placeholder={t('onboarding.serviceNamePlaceholder')} onChange={e=>setServices(xs=>xs.map(x=>x._key===s._key?{...x,name:e.target.value}:x))}/></label>
     <label>{t('onboarding.description')} <small>{t('onboarding.optional')}</small><textarea value={s.description??''} maxLength={500} rows={2} placeholder={t('onboarding.serviceDescPlaceholder')} onChange={e=>setServices(xs=>xs.map(x=>x._key===s._key?{...x,description:e.target.value}:x))}/></label>
     <div className="ob-service-fields"><label>{t('onboarding.duration')} <span className="ob-input-suffix"><input inputMode="numeric" min="10" max="240" step="5" value={serviceDuration(s)} onFocus={e=>e.currentTarget.select()} onChange={e=>updateDuration(s._key,e.target.value.replace(/\D/g,'').slice(0,3))} onBlur={()=>setServices(xs=>xs.map(x=>x._key===s._key?{...x,_durationInput:undefined}:x))}/><small>min</small></span></label><label>{t('onboarding.price')} <span className="ob-input-prefix"><small>R$</small><input inputMode="decimal" value={servicePrice(s)} onFocus={e=>e.currentTarget.select()} onChange={e=>updatePrice(s._key,e.target.value.replace(/[^0-9,.]/g,'').replace(/([,.].*)[,.]/g,'$1').slice(0,9))} onBlur={()=>setServices(xs=>xs.map(x=>x._key===s._key?{...x,_priceInput:undefined}:x))}/></span></label></div>
     {!s.id&&services.length>1&&<button type="button" className="ob-remove-service" onClick={()=>setServices(xs=>xs.filter(x=>x._key!==s._key))}><Trash2 size={15}/>{t('onboarding.remove')}</button>}
    </article>)}</div>
    <button type="button" className="ob-add" onClick={()=>setServices(xs=>[...xs,{_key:newKey(),name:'',description:'',duration_minutes:30,price_cents:0,active:true}])}><Plus size={16}/>{t('onboarding.addService')}</button>
   </>}

   {step===3&&<>
    <p className="ob-eyebrow">{t('onboarding.hoursEyebrow')}</p><h1>{operationMode==='SOLO'?t('onboarding.soloHoursTitle'):t('onboarding.shopHoursTitle')}</h1><p className="ob-muted">{t('onboarding.hoursDesc')}</p>
    <div className="ob-owner"><span className="ob-avatar">{(displayName||snapshot?.owner.display_name||t('onboarding.you')).split(' ').map(x=>x[0]).slice(0,2).join('')}</span><div><strong>{displayName||snapshot?.owner.display_name||t('onboarding.you')}</strong><small>{operationMode==='SOLO'?t('onboarding.professional'):t('onboarding.owner')}</small></div></div>
    <div className="ob-schedule-list">{weekdays.map(([value,labelKey,longLabelKey])=>{const day=schedules.find(d=>d.weekday===Number(value))!;return <article className={`ob-schedule-row ${day.enabled?'is-open':''}`} key={value}><button type="button" className="ob-day-toggle" onClick={()=>{setHoursSaved(false);setSchedules(xs=>xs.map(x=>x.weekday===day.weekday?{...x,enabled:!x.enabled}:x));}}><span><strong>{t(labelKey)}</strong><small>{t(longLabelKey)}</small></span><b>{day.enabled?t('onboarding.open'):t('onboarding.closed')}</b></button>{day.enabled&&<div className="ob-day-times"><label>{t('onboarding.opensAt')}<input type="time" value={day.opensAt} onChange={e=>{setHoursSaved(false);setSchedules(xs=>xs.map(x=>x.weekday===day.weekday?{...x,opensAt:e.target.value}:x));}}/></label><label>{t('onboarding.closesAt')}<input type="time" value={day.closesAt} onChange={e=>{setHoursSaved(false);setSchedules(xs=>xs.map(x=>x.weekday===day.weekday?{...x,closesAt:e.target.value}:x));}}/></label></div>}</article>;})}</div>
    <p className="ob-muted ob-small">{t('onboarding.hoursHint')}</p>
   </>}

   {step===4&&<>
    <p className="ob-eyebrow">{t('onboarding.identityEyebrow')}</p><h1>{operationMode==='SOLO'?t('onboarding.soloIdentityTitle'):t('onboarding.shopIdentityTitle')}</h1><p className="ob-muted">{t('onboarding.identityDesc')}</p>
    <div className="ob-palette-grid">{palettes.map(p=><button type="button" className={paletteKey===p.palette_key?'selected':''} key={p.palette_key} onClick={()=>setPaletteKey(p.palette_key)} style={{'--swatch':themeMode==='dark'?p.dark_accent:p.light_accent} as React.CSSProperties}><i/><span>{p.label}</span></button>)}<button type="button" className={paletteKey==='custom'?'selected':''} onClick={()=>setPaletteKey('custom')}><i style={{background:customAccent}}/><span>{t('onboarding.custom')}</span></button></div>
    {paletteKey==='custom'&&<label>{t('onboarding.primaryColor')}<input type="color" value={customAccent} onChange={e=>setCustomAccent(e.target.value)}/></label>}
    <div className="ob-theme"><button type="button" className={themeMode==='dark'?'selected':''} onClick={()=>setThemeMode('dark')}>{t('onboarding.dark')}</button><button type="button" className={themeMode==='light'?'selected':''} onClick={()=>setThemeMode('light')}>{t('onboarding.light')}</button></div>
    <div className="ob-upload-grid"><label><span><ImagePlus size={17}/>{t('onboarding.logo')} <small>{t('onboarding.required')}</small></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void upload(e,'logo')}/>{logoPath?<small>{t('onboarding.uploadedApp')}</small>:<small>{operationMode==='SOLO'?t('onboarding.chooseProLogo'):t('onboarding.chooseShopLogo')}</small>}</label><label><span><ImagePlus size={17}/>{t('onboarding.cover')} <small>{t('onboarding.optional')}</small></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void upload(e,'cover')}/>{coverPath&&<small>{t('onboarding.uploaded')}</small>}</label><label><span><ImagePlus size={17}/>{t('onboarding.background')} <small>{t('onboarding.optional')}</small></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void upload(e,'background')}/>{backgroundPath&&<small>{t('onboarding.uploaded')}</small>}</label></div>
    <div className="ob-preview"><div className="ob-preview-logo">{logoPreview?<img src={logoPreview} alt={t('onboarding.logoPreview')}/>:<span>LOGO</span>}</div><div><small>{t('onboarding.clientPreview')}</small><strong>{name||(operationMode==='SOLO'?t('onboarding.yourProfile'):t('onboarding.yourShop'))}</strong><span>{services.find(s=>s.active)?.name||t('onboarding.serviceCut')} · {formatCurrency((services.find(s=>s.active)?.price_cents??3500)/100)}</span></div><button type="button" style={{background:'var(--ob-accent)'}}>{t('onboarding.book')}</button></div>
   </>}

   {step===5&&<>
    <p className="ob-eyebrow">{t('onboarding.reviewEyebrow')}</p><h1>{t('onboarding.reviewTitle')}</h1><p className="ob-muted">{t('onboarding.reviewDesc')}</p>
    <div className="ob-review"><div><strong>{name||(operationMode==='SOLO'?t('onboarding.yourProfile'):t('onboarding.yourShop'))}</strong><span>{t(savedActiveServices.length===1?'onboarding.serviceSaved':'onboarding.servicesSaved',{count:savedActiveServices.length})}</span>{scheduleSummary(schedules,t).map(line=><span key={line}>{line}</span>)}<span>{whatsapp?t('onboarding.whatsappConfigured'):t('onboarding.whatsappPending')}</span><span>{logoPath?t('onboarding.logoReady'):t('onboarding.logoPending')}</span></div><div className="ob-review-preview" style={previewStyle}><strong>{name||(operationMode==='SOLO'?t('onboarding.yourProfile'):t('onboarding.yourShop'))}</strong><small>{selectedPalette?.label??t('onboarding.custom')} · {t('onboarding.theme',{theme:themeMode==='dark'?t('onboarding.dark').toLowerCase():t('onboarding.light').toLowerCase()})}</small></div></div>
    {missingRequirements.length?<div className="ob-required"><strong>{t('onboarding.missing')}</strong>{missingRequirements.map(item=><span key={item}>• {item}</span>)}</div>:<div className="ob-ready"><Check size={17}/><span>{t('onboarding.ready')}</span></div>}
   </>}
   {error&&<p className="ob-error" role="alert">{error}</p>}
  </section>
  <footer className="ob-footer">
   <button type="button" className="ob-secondary" disabled={step===1||busy} onClick={()=>{setError('');setNotice('');setStep(s=>Math.max(1,s-1));}}><ChevronLeft size={17}/>{t('onboarding.back')}</button>
   {step>=2&&step<=4&&<button type="button" className="ob-skip" disabled={busy} onClick={()=>void skipStep()}>{t('onboarding.skip')}</button>}
   {step<5?<button type="button" className="ob-primary" disabled={!canContinue||busy} onClick={()=>void nextStep()}>{busy?t('onboarding.saving'):t('onboarding.continue')}<ChevronRight size={17}/></button>:<button type="button" className="ob-primary" disabled={busy||missingRequirements.length>0} onClick={()=>void activate()}>{busy?t('onboarding.activating'):t('onboarding.activate')}<Check size={17}/></button>}
  </footer>
 </main>;
}
