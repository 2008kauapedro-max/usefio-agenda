import React from 'react';
import {Check} from 'lucide-react';
import {LOCALE_OPTIONS,type SupportedCurrency,type SupportedLocale} from '../i18n/config';
import {useI18n} from '../i18n/I18nProvider';

type Props={onSave?:(preferences:{preferred_locale:SupportedLocale;preferred_region:string;preferred_currency:SupportedCurrency})=>Promise<void>|void};
export function LanguageSettings({onSave}:Props){
 const {locale,region,setLocale,setRegion,t}=useI18n();
 const [saving,setSaving]=React.useState(false),[saved,setSaved]=React.useState(false),[error,setError]=React.useState('');
 async function handleSave(){if(!onSave)return;setSaving(true);setSaved(false);setError('');try{await onSave({preferred_locale:locale,preferred_region:(region||'BR').trim().toUpperCase(),preferred_currency:'BRL'});setSaved(true);}catch(e){setError(e instanceof Error?e.message:t('common.tryAgain'));}finally{setSaving(false);}}
 return <div className="language-settings"><div className="section-title"><div><h2>{t('language.region')}</h2><p className="muted">{t('language.subtitle')}</p></div></div><div className="language-option-grid">{LOCALE_OPTIONS.map(option=><button key={option.value} type="button" className={`language-option ${option.value===locale?'selected':''}`} onClick={()=>{setSaved(false);setLocale(option.value,{persistLocal:true,updateDefaults:true});}} aria-pressed={option.value===locale}><span className="language-flag" aria-hidden="true">{option.flag}</span><span><strong>{option.nativeLabel}</strong><small>{option.value}</small></span>{option.value===locale&&<Check size={17}/>}</button>)}</div><div className="form-grid language-region-grid"><label className="field"><span>{t('language.regionLabel')}</span><input value={region} onChange={e=>{setSaved(false);setRegion(e.target.value);}} maxLength={2} autoCapitalize="characters"/></label><div className="settings-readonly"><span>{t('language.currencyLabel')}</span><strong>BRL</strong><small>{t('language.currencyBrazilOnly')}</small></div></div>{onSave&&<div className="language-settings-actions"><span className={error?'language-save-error':'language-saved'} role="status">{error||(saved?t('language.saved'):'')}</span><button type="button" className="primary" onClick={()=>void handleSave()} disabled={saving}>{saving?t('common.saving'):t('common.save')}</button></div>}</div>;
}
