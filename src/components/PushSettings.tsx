import {useI18n} from '../i18n';
import {useEffect,useState} from 'react';
import type {WorkspaceProps} from '../pages/Workspace';
import {api} from '../lib/api';
export function PushSettings(p:WorkspaceProps){
 const {t,formatDate}=useI18n();
 const [changes,setChanges]=useState(true),[reminders,setReminders]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[enabled,setEnabled]=useState(false),[config,setConfig]=useState<{configured:boolean;publicKey:string}|null>(null);
 useEffect(()=>{let alive=true;if(!p.demo)void api<{configured:boolean;publicKey:string}>('/push/config',p.data.shop.id).then(c=>{if(alive)setConfig(c);}).catch(e=>{if(alive)setMessage(e.message);});return()=>{alive=false;};},[p.demo,p.data.shop.id]);
 const supported='serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
 useEffect(()=>{let alive=true;if(supported&&!p.demo)void Promise.all([navigator.serviceWorker.getRegistration().then(r=>r?.pushManager.getSubscription()),api<{endpoint:string;enabled:boolean;changes:boolean;reminders:boolean}[]>('/push/preferences',p.data.shop.id)]).then(([s,rows])=>{if(!alive)return;const stored=rows.find(r=>r.endpoint===s?.endpoint);setEnabled(Boolean(stored?.enabled));if(stored){setChanges(stored.changes);setReminders(stored.reminders);}}).catch(e=>{if(alive)setMessage(e.message);});return()=>{alive=false;};},[supported,p.demo,p.data.shop.id]);
 async function enable(){setBusy(true);setMessage('');try{
  if(p.demo)throw Error(t('push.demoDisabled'));
  if(!config?.configured)throw Error(t('push.notConfigured'));
  const permission=await Notification.requestPermission();if(permission!=='granted')throw Error(t('push.permissionDenied'));
  const registration=await navigator.serviceWorker.ready;
  const key=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  const subscription=await registration.pushManager.getSubscription()??await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  const json=subscription.toJSON();await api('/push/devices',p.data.shop.id,{optIn:true,endpoint:subscription.endpoint,keys:json.keys,changes,reminders});setEnabled(true);setMessage(t('push.saved'));
 }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 async function disable(){setBusy(true);try{const r=await navigator.serviceWorker.getRegistration(),s=await r?.pushManager.getSubscription();if(s)await api('/push/devices',p.data.shop.id,{endpoint:s.endpoint},'DELETE');setEnabled(false);setMessage(t('push.disabled'));}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 return <section className="settings-card"><h2>{t('push.title')}</h2><p>{t('push.desc')}</p><label className="check-row"><input type="checkbox" checked={changes} onChange={e=>setChanges(e.target.checked)}/>{t('push.changes')}</label><label className="check-row"><input type="checkbox" checked={reminders} onChange={e=>setReminders(e.target.checked)}/>{t('push.reminders')}</label>{supported?<div className="modal-actions"><button className="primary" disabled={busy||!config?.configured} onClick={()=>void enable()}>{enabled?t('push.saveActivate'):t('push.activate')}</button>{enabled&&<button className="secondary" disabled={busy} onClick={()=>void disable()}>{t('push.disable')}</button>}</div>:<p>{t('push.unsupported')}</p>}{!config?.configured&&<p className="muted">{t('push.configMissing')}</p>}<h3>{t('push.recent')}</h3>{p.data.notifications.length?p.data.notifications.map(n=><article key={n.id} className="schedule-block"><div><strong>{n.title}</strong><p>{n.body}</p><small>{formatDate(n.created_at,{dateStyle:'short',timeStyle:'short'})}</small></div><a className="secondary" href={p.base+'/agenda'+(n.appointment_id?'?appointment='+n.appointment_id:'')}>{t('push.openAgenda')}</a></article>):<p>{t('push.none')}</p>}<p className="muted">{t('push.deliveryNote')}</p>{message&&<p role="status" className="notice">{message}</p>}</section>;
}

