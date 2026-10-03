import {useI18n} from '../i18n';
import {useEffect,useRef,useState} from 'react';

type Turnstile={render:(element:HTMLElement,options:Record<string,unknown>)=>string;remove:(id:string)=>void};
declare global {interface Window {turnstile?:Turnstile}}
export const captchaSiteKey=String(import.meta.env.VITE_TURNSTILE_SITE_KEY??'').trim();
let loading:Promise<Turnstile>|undefined;
function loadTurnstile(){
 if(window.turnstile)return Promise.resolve(window.turnstile);
 if(loading)return loading;
 loading=new Promise<Turnstile>((resolve,reject)=>{
  const script=document.createElement('script');
  const fail=()=>{script.remove();loading=undefined;reject(new Error('CAPTCHA_UNAVAILABLE'));};
  const timer=window.setTimeout(fail,15000);
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async=true;
  script.onload=()=>{clearTimeout(timer);if(window.turnstile)resolve(window.turnstile);else fail();};
  script.onerror=()=>{clearTimeout(timer);fail();};
  document.head.append(script);
 });
 return loading;
}

export function AuthCaptcha({onToken,attempt}:{onToken:(token:string)=>void;attempt:number}){
 const {t}=useI18n();
 const container=useRef<HTMLDivElement>(null);
 const [failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 const [ready,setReady]=useState(false),[verified,setVerified]=useState(false);
 const [compact,setCompact]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(max-width: 480px)').matches);
 useEffect(()=>{
  const media=window.matchMedia('(max-width: 480px)');
  const update=()=>setCompact(media.matches);
  update();media.addEventListener('change',update);
  return()=>media.removeEventListener('change',update);
 },[]);
 useEffect(()=>{
  let active=true,widget:string|undefined,api:Turnstile|undefined;
  onToken('');setFailed(false);setReady(false);setVerified(false);
  void loadTurnstile().then(turnstile=>{
   if(!active||!container.current)return;
   api=turnstile;
   // Compact is the provider's accessible narrow layout; never crop its iframe.
   widget=turnstile.render(container.current,{sitekey:captchaSiteKey,theme:'auto',size:compact?'compact':'flexible',execution:'render',appearance:'always',retry:'auto',refreshExpired:'auto',
    callback:(token:string)=>{if(active){setFailed(false);setVerified(true);onToken(token);}},
    'expired-callback':()=>{if(active){onToken('');setVerified(false);}},
    'timeout-callback':()=>{if(active){onToken('');setVerified(false);setFailed(true);}},
    'error-callback':()=>{if(active){onToken('');setVerified(false);setFailed(true);}}
   });
   setReady(true);
  }).catch(()=>{if(active)setFailed(true);});
  return()=>{active=false;if(widget!==undefined)api?.remove(widget);};
 },[onToken,attempt,retry,compact]);
 return <div className="auth-captcha">
  <div className="auth-captcha-widget" ref={container}/>
  {verified&&<p className="auth-captcha-status" role="status"><span aria-hidden="true">✓</span> {t('captcha.verified')}</p>}
  {failed&&<p role="alert" className="auth-captcha-error">{t('captcha.failed')}</p>}
  {!ready&&!failed&&<p className="auth-captcha-hint">{t('captcha.loading')}</p>}
  {failed&&<button type="button" className="text-button auth-captcha-retry" onClick={()=>setRetry(v=>v+1)}>{t('captcha.retry')}</button>}
 </div>;
}
