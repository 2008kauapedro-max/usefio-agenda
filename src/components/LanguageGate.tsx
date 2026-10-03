import React,{useEffect,useState} from 'react';
import {Check} from 'lucide-react';
import {LOCALE_OPTIONS,STORAGE_KEYS,type SupportedCurrency,type SupportedLocale} from '../i18n/config';
import {useI18n} from '../i18n/I18nProvider';

type PersistPreferencesInput={preferred_locale:SupportedLocale;preferred_region:string;preferred_currency:SupportedCurrency};
type Props={children:React.ReactNode;onPersistPreferences?:(preferences:PersistPreferencesInput)=>Promise<void>|void};

export function LanguageGate({children,onPersistPreferences}:Props){
 const {locale,region,ready,setLocale,t}=useI18n();
 const [open,setOpen]=useState(false),[saving,setSaving]=useState(false);
 useEffect(()=>{if(!ready||typeof window==='undefined')return;setOpen(localStorage.getItem(STORAGE_KEYS.languageGateDone)!=='1');},[ready]);
 async function finish(){setSaving(true);try{await onPersistPreferences?.({preferred_locale:locale,preferred_region:region,preferred_currency:'BRL'});localStorage.setItem(STORAGE_KEYS.languageGateDone,'1');setOpen(false);}finally{setSaving(false);}}
 function skip(){localStorage.setItem(STORAGE_KEYS.languageGateDone,'1');setOpen(false);}
 if(!ready)return null;
 return <>{children}{open&&<div className="language-gate-backdrop" role="dialog" aria-modal="true" aria-labelledby="fio-language-title"><section className="language-gate-card"><div><span className="eyebrow">FIO</span><h2 id="fio-language-title">{t('language.title')}</h2><p className="muted">{t('language.subtitle')}</p></div><div className="language-option-grid">{LOCALE_OPTIONS.map(option=><button key={option.value} type="button" className={`language-option ${option.value===locale?'selected':''}`} onClick={()=>setLocale(option.value,{persistLocal:true,updateDefaults:true})} aria-pressed={option.value===locale}><span className="language-flag" aria-hidden="true">{option.flag}</span><span><strong>{option.nativeLabel}</strong><small>{option.value}</small></span>{option.value===locale&&<Check size={17}/>}</button>)}</div><div className="language-gate-actions"><button type="button" className="secondary" onClick={skip} disabled={saving}>{t('common.skip')}</button><button type="button" className="primary" onClick={()=>void finish()} disabled={saving}>{saving?t('common.loading'):t('common.confirm')}</button></div></section></div>}</>;
}
