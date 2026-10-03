import { useEffect,useRef,useId,type ReactNode } from 'react';
import { X,ArrowUpRight,LoaderCircle } from 'lucide-react';
import {useI18n} from '../i18n';
export function Spinner(){const {t}=useI18n();return <div className="loading" role="status"><LoaderCircle className="spin" size={22}/> {t('ui.loading')}</div>;}
export function Empty({title,children}:{title:string;children?:ReactNode}){return <div className="empty"><span className="empty-mark">—</span><h3>{title}</h3>{children&&<p>{children}</p>}</div>;}
export function PageTitle({eyebrow,title,description,action}:{eyebrow:string;title:string;description?:string;action?:ReactNode}){return <div className="page-title"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description&&<p className="muted">{description}</p>}</div>{action}</div>;}
export function Modal({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}) {
 const {t}=useI18n();
 const ref=useRef<HTMLDialogElement>(null);
 const titleId=useId();
 useEffect(()=>{const d=ref.current;d?.showModal();return()=>d?.close();},[]);
 return <dialog ref={ref} aria-labelledby={titleId} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===ref.current)onClose();}}><div className="modal-head"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label={t('ui.close')} onClick={onClose}><X size={20}/></button></div>{children}</dialog>;
}
export function ArrowLink({children,onClick}:{children:ReactNode;onClick:()=>void}){return <button className="text-button" onClick={onClick}>{children}<ArrowUpRight size={16}/></button>;}
export function Field({label,children}:{label:string;children:ReactNode}){return <label className="field"><span>{label}</span>{children}</label>;}
