import { useEffect,useRef,useState,type FormEvent,type ReactNode } from 'react';
import { ArrowUp, Plus, Sparkles, History, WifiOff, LockKeyhole, TriangleAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api,RequestError } from '../lib/api';
import type { Role,Plan } from '../../shared/domain';
import {useChatViewport} from './useChatViewport';
import { Modal } from './ui';
import {useI18n} from '../i18n';

interface Message { id:string;role:'user'|'assistant';content:string }
const suggestionKeys:Record<Role,string[]>={
 OWNER:['ai.suggestion.owner1','ai.suggestion.owner2','ai.suggestion.owner3'],
 BARBER:['ai.suggestion.barber1','ai.suggestion.barber2','ai.suggestion.barber3'],
 CLIENT:['ai.suggestion.client1','ai.suggestion.client2','ai.suggestion.client3']
};
function InlineMarkdown({text}:{text:string}){
 const parts:ReactNode[]=[];const re=/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;let last=0,m:RegExpExecArray|null,i=0;
 while((m=re.exec(text))){if(m.index>last)parts.push(text.slice(last,m.index));const token=m[0];parts.push(token.startsWith('**')?<strong key={i++}>{token.slice(2,-2)}</strong>:<code key={i++}>{token.slice(1,-1)}</code>);last=m.index+token.length;}if(last<text.length)parts.push(text.slice(last));return <>{parts}</>;
}
function SafeMarkdown({text}:{text:string}){return <div className="fio-markdown">{text.split(/\n{2,}/).map((b,i)=><p key={i}>{b.split('\n').map((l,j,a)=><span key={j}><InlineMarkdown text={l}/>{j<a.length-1&&<br/>}</span>)}</p>)}</div>;}

export function AssistantMessage({message}:{message:Message}){const {t}=useI18n();return <article className={`message ${message.role}`}><span className="message-author">{message.role==='assistant'?<><Sparkles size={15}/> FIO IA</>:t('ai.user')}</span><div>{message.role==='assistant'?<SafeMarkdown text={message.content}/>:message.content}</div></article>;}
export function AssistantSuggestions({role,onSelect}:{role:Role;onSelect:(text:string)=>void}){const {t}=useI18n();return <div className="suggestions">{suggestionKeys[role].map(key=>{const text=t(key);return <button key={key} onClick={()=>onSelect(text)}>{text}<ArrowUp size={16}/></button>;})}</div>;}
export function AssistantEmptyState({role,onSelect}:{role:Role;onSelect:(text:string)=>void}){const {t}=useI18n();const description=role==='OWNER'?t('ai.ownerDesc'):role==='BARBER'?t('ai.barberDesc'):t('ai.clientDesc');return <div className="assistant-empty"><div className="ai-symbol"><Sparkles size={20} strokeWidth={1.5}/></div><div className="assistant-empty-copy"><strong>{t('ai.greeting')}</strong><p className="muted">{description}</p><AssistantSuggestions role={role} onSelect={onSelect}/></div></div>;}
export function AssistantErrorState({error,onRetry}:{error:RequestError;onRetry?:()=>void}){const {t}=useI18n();const Icon=error.code==='OFFLINE'?WifiOff:error.code==='PLAN_REQUIRED'?LockKeyhole:TriangleAlert;return <div className="notice" role="alert"><Icon size={18}/><span>{error.message}</span>{onRetry&&<button type="button" className="notice-retry" onClick={onRetry}>{t('ai.retry')}</button>}</div>;}
export function AssistantComposer({value,onChange,onSubmit,busy}:{value:string;onChange:(v:string)=>void;onSubmit:(e:FormEvent)=>void;busy:boolean}){const {t}=useI18n();return <form className="composer" onSubmit={onSubmit}><textarea aria-label={t('ai.messageLabel')} placeholder={t('ai.placeholder')} maxLength={2000} rows={1} value={value} onChange={e=>onChange(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(value.trim()&&!busy)onSubmit(e);}}}/><button className="send-button" aria-label={t('ai.send')} disabled={!value.trim()||busy}><ArrowUp size={20}/></button></form>;}
export function AssistantChat({role,plan,aiEnabled,shopId,demo,base,shopName,shopLogo}:{role:Role;plan:Plan;aiEnabled:boolean;shopId:string;demo:boolean;base:string;shopName?:string;shopLogo?:string}) {
 const {locale,t}=useI18n();
 const [messages,setMessages]=useState<Message[]>([]),[value,setValue]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<RequestError|null>(null),[conversationId,setConversationId]=useState<string>(),[history,setHistory]=useState<{id:string;title:string}[]|null>(null),[failedText,setFailedText]=useState<string>();
 useChatViewport();
 const scroll=useRef<HTMLDivElement>(null),follow=useRef(true),navigate=useNavigate();
 useEffect(()=>{if(follow.current&&scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight;},[messages,busy]);
 async function send(text:string,retry=false){if(!text.trim()||busy)return;setError(null);setFailedText(undefined);
  if(demo){setError(new RequestError('AI_UNAVAILABLE',t('ai.demoUnavailable')));return;}
  if(!aiEnabled){setError(new RequestError('PLAN_REQUIRED',t('ai.planRequired')));return;}
  const message=text.trim();follow.current=true;setBusy(true);if(!retry)setMessages(prev=>[...prev,{id:crypto.randomUUID(),role:'user',content:message}]);setValue('');
  try{const result=await api<{conversationId:string;message:string}>('/assistant',shopId,{message,locale,...(conversationId?{conversationId}:{})});setConversationId(result.conversationId);setMessages(prev=>[...prev,{id:crypto.randomUUID(),role:'assistant',content:result.message}]);}
  catch(e){setFailedText(message);setError(e instanceof RequestError?e:new RequestError('ERROR',t('ai.genericError')));}finally{setBusy(false);}
 }
 async function submit(e:FormEvent){e.preventDefault();await send(value);}
 async function showHistory(){if(demo){setHistory([]);return;}try{setHistory(await api('/conversations',shopId));}catch(e){setError(e as RequestError);}}
 async function openConversation(id:string){try{follow.current=true;setMessages(await api(`/conversations/${id}`,shopId));setFailedText(undefined);setConversationId(id);setHistory(null);setError(null);}catch(e){setError(e as RequestError);}}
 return <div className="assistant-page assistant-chat-screen"><div className="assistant-toolbar"><div className="assistant-toolbar-title">{role==='CLIENT'&&shopLogo&&<img className="client-chat-logo" src={shopLogo} alt=""/>}<div><strong>{role==='CLIENT'&&shopName?shopName:t('ai.title')}</strong><span className="assistant-online"><i/>{demo?t('ai.demo'):!aiEnabled?t('ai.requiresPro'):error?t('ai.unavailable'):t('ai.ready')}</span></div>{role!=='CLIENT'&&<small>{plan}</small>}</div><div><button className="icon-button" aria-label={t('ai.history')} disabled={busy} onClick={showHistory}><History size={20}/></button><button className="icon-button" aria-label={t('ai.newChat')} disabled={busy} onClick={()=>{follow.current=true;setValue('');setMessages([]);setConversationId(undefined);setError(null);setFailedText(undefined);}}><Plus size={21}/></button></div></div><div className="message-scroll" ref={scroll} role="log" aria-label={t('ai.chatLabel')} aria-live="polite" onScroll={()=>{const el=scroll.current;if(el)follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;}}>{messages.length===0?<AssistantEmptyState role={role} onSelect={setValue}/>:<div className="messages">{messages.map(m=><AssistantMessage key={m.id} message={m}/>)}<button className="text-button" onClick={()=>navigate(`${base}/agenda`)}>{t('ai.openAgenda')}</button></div>}{busy&&<div className="thinking" role="status">{t('ai.thinking')}<span>•••</span></div>}</div><div className="composer-area">{error&&<AssistantErrorState error={error} onRetry={failedText&&!busy?()=>void send(failedText,true):undefined}/>}<AssistantComposer value={value} onChange={setValue} onSubmit={submit} busy={busy}/><p>{t('ai.disclaimer')}</p></div>{history&&<Modal title={t('ai.conversations')} onClose={()=>setHistory(null)}>{history.length===0?<p className="muted">{t('ai.noConversations')}</p>:history.map(h=><button key={h.id} className="history-item" onClick={()=>openConversation(h.id)}>{h.title}</button>)}</Modal>}</div>;
}
