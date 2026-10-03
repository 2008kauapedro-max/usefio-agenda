import {useState} from 'react';
import {detectInAppBrowser,dismissalKey,isDismissed,externalBrowserUrl} from '../../shared/in-app-browser';
import {useI18n} from '../i18n';
export function InAppBrowserBanner(){
 const {t}=useI18n();
 const browser=detectInAppBrowser(navigator.userAgent);
 const [closed,setClosed]=useState(()=>{try{return isDismissed(sessionStorage.getItem(dismissalKey));}catch{return false;}}),[help,setHelp]=useState(false);
 if(!browser||closed)return null;
 function close(){setClosed(true);try{sessionStorage.setItem(dismissalKey,String(Date.now()+12*3600000));}catch{/* Optional storage may be blocked in WebViews. */}}
 return <aside className="in-app-banner" aria-label={t('inapp.aria')}><div><strong>{t('inapp.browser',{browser})}</strong><p>{t('inapp.desc')}</p><a href={externalBrowserUrl(location.href)} target="_blank" rel="noopener noreferrer" onClick={()=>setHelp(true)}>{t('inapp.open')}</a>{help&&<p role="status">{/iPhone|iPad|iPod/i.test(navigator.userAgent)?t('inapp.iosHelp'):t('inapp.androidHelp')}</p>}</div><button aria-label={t('inapp.closeAria')} onClick={close}>×</button></aside>;
}
