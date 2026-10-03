import {AuthCaptcha,captchaSiteKey} from '../components/AuthCaptcha';
import { useEffect,useState,type FormEvent,type ReactNode } from 'react';
import { Link,NavLink,Navigate,useLocation,useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { LayoutDashboard, Store, Wallet, Activity, Settings, LogOut, ArrowLeft, ShieldCheck, MoreHorizontal, X, SlidersHorizontal, Download } from 'lucide-react';
import { api,supabase,RequestError } from '../lib/api';
import { Modal } from '../components/ui';
import type { PlatformAdmin,PlatformShop,SaasPlan,AuditEvent,Page,PlatformOverview,PlatformSection } from '../../shared/platform';
import './platform.css';
import { PlatformCopilot,PlatformAlerts,PlatformPush } from './PlatformCopilot';
import { Bell, Sparkles } from 'lucide-react';

const labels:Record<string,string>={active:'Ativa',inactive:'Inativa',trial:'Teste',trialing:'Teste',suspended:'Suspensa',past_due:'Inadimplente',cancelled:'Cancelada',scheduled:'Agendado',completed:'Concluído',in_service:'Em atendimento',OWNER:'Responsável',BARBER:'Barbeiro',CLIENT:'Cliente',PLATFORM_ADMIN:'Platform Admin',UNKNOWN:'Papel não registrado'};
const label=(s:string)=>labels[s]??s;
const money=(n:number|null)=>n===null?'Não definido':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
const date=(s:string|null)=>s?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(s)):'—';
const eventLabels:Record<string,string>={
 'appointment.completed':'Atendimento concluído','appointment.cancelled':'Agendamento cancelado','appointment.created':'Agendamento criado','memberships.insert':'Acesso criado','platform.shop.updated':'Barbearia atualizada','platform.plan.updated':'Plano atualizado','payment.recorded':'Pagamento registrado','reviews.insert':'Avaliação recebida','onboarding.activated':'Barbearia publicada'
};
const eventLabel=(value:string)=>value.startsWith('platform.ai')||value.startsWith('platform_ai')?'Copiloto FIO':eventLabels[value]??'Atividade do FIO';
const eventDescription=(value:string)=>/^Platform AI:\s*error$/i.test(value)?'Falha registrada no Copiloto FIO':/^Platform AI:/i.test(value)?value.replace(/^Platform AI:/i,'Copiloto FIO:').replace('tool_success','consulta concluída').replace('question','pergunta recebida').replace('answer','resposta enviada'):value;
type InstallPromptEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
function useResource<T>(path:string){
 const [state,setState]=useState<{data:T|null;error:string;code:string;loading:boolean}>({data:null,error:'',code:'',loading:true});
 const [revision,setRevision]=useState(0);
 useEffect(()=>{let alive=true;setState({data:null,error:'',code:'',loading:true});api<T>(path).then(data=>{if(alive)setState({data,error:'',code:'',loading:false});}).catch((e:Error)=>{if(alive)setState({data:null,error:e.message,code:e instanceof RequestError?e.code:'',loading:false});});return()=>{alive=false;};},[path,revision]);
 return {...state,reload:()=>setRevision(r=>r+1)};
}
function State({loading,error,empty=false,retry}:{loading?:boolean;error?:string;empty?:boolean;retry?:()=>void}){
 if(error)return <div className="pf-state" role="alert"><p>{error}</p>{retry&&<button onClick={retry}>Tentar novamente</button>}</div>;
 if(loading)return <p className="pf-state" role="status">Carregando…</p>;
 if(empty)return <div className="pf-state"><span>Sem registros por aqui.</span><small>Os dados aparecerão conforme a operação acontecer.</small></div>;
 return null;
}
function Pager({page,total,limit=25,onChange}:{page:number;total:number;limit?:number;onChange:(p:number)=>void}){return <div className="pf-pager"><small>{total} registros · página {page}</small><button disabled={page===1} onClick={()=>onChange(page-1)}>Anterior</button><button disabled={page*limit>=total} onClick={()=>onChange(page+1)}>Próxima</button></div>;}

export function PlatformLogin({session,ready}:{session:Session|null;ready:boolean}){
 const navigate=useNavigate(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [captchaToken,setCaptchaToken]=useState(''),[captchaAttempt,setCaptchaAttempt]=useState(0);
 useEffect(()=>{const m=document.querySelector<HTMLLinkElement>('link[rel="manifest"]');if(m)m.href='/manifest-platform.webmanifest';},[]);
 if(!ready)return <div className="pf-login"><State loading/></div>;
 if(session)return <Navigate replace to="/platform"/>;
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(captchaSiteKey&&!captchaToken){setError('Conclua a verificação de segurança.');return;}setBusy(true);setError('');const f=new FormData(e.currentTarget);try{if(!supabase)throw Error('O acesso está temporariamente indisponível.');const r=await supabase.auth.signInWithPassword({email:String(f.get('email')).trim(),password:String(f.get('password')),options:{captchaToken:captchaToken||undefined}});if(r.error)throw Error('Não foi possível entrar. Confira suas credenciais.');navigate('/platform',{replace:true});}catch(e){setError((e as Error).message);}finally{setBusy(false);setCaptchaToken('');setCaptchaAttempt(v=>v+1);}}
 return <main className="pf-login"><form onSubmit={submit}><Link className="pf-logo pf-logo-image" to="/" aria-label="FIO"><img src="/FIOlogo+nome/Branco.png" alt="FIO"/></Link><small>PLATFORM</small><h1>Administração do FIO</h1><p>Acesse com sua conta autorizada.</p><label>E-mail<input name="email" type="email" autoComplete="username" required/></label><label>Senha<input name="password" type="password" autoComplete="current-password" required/></label><Link to="/login?mode=forgot&audience=platform">Esqueci minha senha</Link>{captchaSiteKey&&<AuthCaptcha onToken={setCaptchaToken} attempt={captchaAttempt}/>} {error&&<p role="alert">{error}</p>}<button className="pf-primary" disabled={busy||Boolean(captchaSiteKey&&!captchaToken)}>{busy?'Entrando…':'Entrar'}</button><Link to="/login">Outros acessos</Link></form></main>;
}
export function PlatformApp({session,ready}:{session:Session|null;ready:boolean}){
 useEffect(()=>{const m=document.querySelector<HTMLLinkElement>('link[rel="manifest"]');if(m)m.href='/manifest-platform.webmanifest';},[]);
 if(!ready)return <div className="pf-login"><State loading/></div>;
 if(!session)return <Navigate replace to="/acesso/plataforma"/>;
 return <PlatformGate key={session.user.id}/>;
}
function PlatformGate(){
 const r=useResource<PlatformAdmin>('/platform/me');
 if(r.code==='AUTH_REQUIRED')return <main className="pf-login"><div><h1>Sessão expirada</h1><p>Entre novamente para continuar.</p><button onClick={()=>void supabase?.auth.signOut()}>Entrar novamente</button></div></main>;
 if(r.error)return <main className="pf-login"><div><ShieldCheck size={28}/><h1>{r.code==='FORBIDDEN'?'Acesso negado':'Não foi possível abrir o painel'}</h1><p role="alert">{r.error}</p>{r.code!=='FORBIDDEN'&&<button onClick={r.reload}>Tentar novamente</button>}<Link to="/">Voltar ao meu espaço</Link><button onClick={()=>void supabase?.auth.signOut()}>Sair desta conta</button></div></main>;
 if(!r.data)return <div className="pf-login"><State loading/></div>;
 return <PlatformWorkspace admin={r.data}/>;
}
const nav=[['','Visão geral',LayoutDashboard],['/barbearias','Barbearias',Store],['/assinaturas','Assinaturas',Wallet],['/suporte','Mensagens',Bell],['/atividade','Atividade',Activity],['/ai','Copiloto',Sparkles],['/alertas','Alertas',Bell],['/configuracoes','Configurações',Settings]] as const;
function PlatformWorkspace({admin}:{admin:PlatformAdmin}){
 const {pathname}=useLocation();
 const [mobileMenuOpen,setMobileMenuOpen]=useState(false),[installPrompt,setInstallPrompt]=useState<InstallPromptEvent|null>(null),[installHelp,setInstallHelp]=useState(false);
 let content:ReactNode;
 useEffect(()=>{setMobileMenuOpen(false);},[pathname]);
 useEffect(()=>{const listener=(event:Event)=>{event.preventDefault();setInstallPrompt(event as InstallPromptEvent);};window.addEventListener('beforeinstallprompt',listener);return()=>window.removeEventListener('beforeinstallprompt',listener);},[]);
 const installPlatform=async()=>{setMobileMenuOpen(false);if(installPrompt){await installPrompt.prompt();await installPrompt.userChoice;setInstallPrompt(null);return;}setInstallHelp(true);};

 if(pathname==='/platform')content=<Overview admin={admin}/>;
 else if(pathname==='/platform/barbearias')content=<Shops/>;
 else if(/^\/platform\/barbearias\/[^/]+$/.test(pathname))content=<ShopDetail key={pathname} id={pathname.split('/').at(-1)!}/>;
 else if(pathname==='/platform/suporte')content=<FeedbackInbox/>;
 else if(pathname==='/platform/assinaturas')content=<Subscriptions/>;
 else if(pathname==='/platform/atividade')content=<><Heading title="Atividade" note="Histórico administrativo da plataforma."/><ActivityList/></>;
 else if(pathname==='/platform/configuracoes')content=<><Configuration admin={admin} onInstall={()=>void installPlatform()} installReady={Boolean(installPrompt)}/><PlatformPush/></>;
 else if(pathname==='/platform/ai')content=<PlatformCopilot/>;
 else if(pathname==='/platform/alertas')content=<PlatformAlerts/>;
 else return <Navigate replace to="/platform"/>;

 const mobilePrimary=[['','Visão geral',LayoutDashboard],['/barbearias','Barbearias',Store],['/ai','Copiloto',Sparkles]] as const;
 const mobileMore=[['/assinaturas','Assinaturas',Wallet],['/suporte','Mensagens',Bell],['/atividade','Atividade',Activity],['/alertas','Alertas',Bell],['/configuracoes','Configurações',Settings]] as const;
 return <div className="pf-shell">
  <aside className="pf-sidebar">
   <Link className="pf-logo pf-logo-image" to="/platform" aria-label="FIO"><img src="/FIOlogo+nome/Branco.png" alt="FIO"/></Link>
   <small className="pf-kicker">PLATFORM</small>
   <nav className="pf-desktop-nav" aria-label="Administração da plataforma">{nav.map(([path,title,Icon])=><NavLink end={!path} key={path} to={'/platform'+path}><Icon size={18}/><span>{title}</span></NavLink>)}</nav>
   <footer><strong>{admin.display_name}</strong><small>Platform Admin</small><button onClick={()=>void supabase?.auth.signOut()}><LogOut size={16}/>Sair</button></footer>
  </aside>
  <nav className="pf-mobile-nav" aria-label="Navegação da plataforma">{mobilePrimary.map(([path,title,Icon])=><NavLink end={!path} key={path} to={'/platform'+path}><Icon size={20}/><span>{title}</span></NavLink>)}<button type="button" className={mobileMenuOpen?'active':''} aria-expanded={mobileMenuOpen} aria-controls="pf-mobile-more" onClick={()=>setMobileMenuOpen(v=>!v)}><MoreHorizontal size={20}/><span>Mais</span></button></nav>
  {mobileMenuOpen&&<div className="pf-mobile-overlay" onClick={()=>setMobileMenuOpen(false)}><section id="pf-mobile-more" className="pf-mobile-more" role="dialog" aria-modal="true" aria-label="Mais opções" onClick={e=>e.stopPropagation()}><header><div><strong>{admin.display_name}</strong><small>Platform Admin</small></div><button type="button" className="pf-mobile-close" aria-label="Fechar menu" onClick={()=>setMobileMenuOpen(false)}><X size={20}/></button></header><nav>{mobileMore.map(([path,title,Icon])=><NavLink key={path} to={'/platform'+path}><Icon size={20}/><span>{title}</span></NavLink>)}</nav><button className="pf-mobile-install" onClick={()=>void installPlatform()}><Download size={19}/>{installPrompt?'Instalar FIO Platform':'Como instalar o FIO Platform'}</button><button className="pf-mobile-logout" onClick={()=>void supabase?.auth.signOut()}><LogOut size={19}/>Sair da conta</button></section></div>}
  {installHelp&&<div className="pf-filter-overlay" onClick={()=>setInstallHelp(false)}><section className="pf-filter-sheet pf-install-sheet" role="dialog" aria-modal="true" aria-label="Instalar FIO Platform" onClick={e=>e.stopPropagation()}><header><div><strong>Instalar FIO Platform</strong><small>Abra seu painel direto da tela inicial.</small></div><button type="button" aria-label="Fechar" onClick={()=>setInstallHelp(false)}><X size={18}/></button></header><div className="pf-install-steps"><p><b>Android / computador:</b> abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.</p><p><b>iPhone:</b> abra no Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.</p></div></section></div>}
  <main className={pathname==='/platform/ai'?'pf-ai-main':undefined}>{content}</main>
 </div>;
}

function Heading({title,note,children}:{title:string;note?:string;children?:ReactNode}){return <header className="pf-heading"><div><h1>{title}</h1>{note&&<p>{note}</p>}</div>{children}</header>;}
function Overview({admin}:{admin:PlatformAdmin}){
 const r=useResource<PlatformOverview>('/platform/overview');
 const metrics=r.data?[
  {name:'Receita SaaS',value:'Indisponível',help:'Receita ainda não conciliada',text:true,href:''},
  {name:'Barbearias',value:r.data.activeShops,help:'Ativas',href:'/platform/barbearias'},
  {name:'Assinaturas',value:r.data.activeSubscriptions,help:'Ativas, incluindo gratuitas',href:'/platform/assinaturas'},
  {name:'Pendências',value:r.data.alerts,help:'Suspensas ou inadimplentes',href:'/platform/alertas'}
 ]:[];
 return <><Heading title={`Olá, ${admin.display_name.split(' ')[0]}`} note="Seu FIO, em um olhar."/><State loading={r.loading} error={r.error} retry={r.reload}/>{r.data&&<><div className="pf-metrics">{metrics.map(metric=><div className="pf-metric-card" key={metric.name}><small>{metric.name}</small><strong className={metric.text?'pf-metric-value pf-metric-text':'pf-metric-value'}>{metric.value}</strong><span>{metric.help}</span>{metric.href&&<Link className="pf-metric-more" to={metric.href}>Ver detalhes</Link>}</div>)}</div><section className="pf-panel pf-recent-panel"><div className="pf-panel-title"><h2>Atividade recente</h2><Link to="/platform/atividade">Ver tudo</Link></div><Events events={r.data.recent}/></section></>}</>;
}

function Events({events}:{events:AuditEvent[]}){return <><State empty={!events.length}/><div className="pf-events">{events.map(e=><article key={e.id}><time>{date(e.created_at)}</time><div><strong>{eventDescription(e.description)}</strong><span>{e.barbershops?.name??'Plataforma'} · {e.actor_name??'Sistema FIO'}</span><small>{label(e.actor_role)} · {eventLabel(e.event_type)}</small></div></article>)}</div></>;}
function Shops(){
 const [search,setSearch]=useState(''),[term,setTerm]=useState(''),[status,setStatus]=useState('all'),[page,setPage]=useState(1),[sort,setSort]=useState('newest');
 const shopParams=new URLSearchParams({page:String(page),sort});if(term.trim())shopParams.set('search',term.trim());if(status!=='all')shopParams.set('status',status);
 const r=useResource<Page<PlatformShop>>(`/platform/shops?${shopParams}`);
 return <><Heading title="Barbearias" note="Acompanhe os espaços que usam o FIO."/><form className="pf-filters" onSubmit={e=>{e.preventDefault();setTerm(search);setPage(1);}}><label>Pesquisar<input placeholder="Nome da barbearia" value={search} onChange={e=>setSearch(e.target.value)} maxLength={100}/></label><label>Status<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}>{['all','active','trial','suspended','past_due'].map(s=><option key={s} value={s}>{s==='all'?'Todas':label(s)}</option>)}</select></label><label>Ordem<select value={sort} onChange={e=>{setSort(e.target.value);setPage(1);}}><option value="newest">Novas barbearias primeiro</option><option value="name">Nome</option></select></label><button>Buscar</button></form><State loading={r.loading} error={r.error} retry={r.reload}/>{r.data&&<><State empty={!r.data.items.length}/><div className="pf-shops">{r.data.items.map(s=><Link to={`/platform/barbearias/${s.id}`} key={s.id}><div className="pf-shop-logo">{s.logo_url?<img src={s.logo_url} alt=""/>:<Store size={18}/>}</div><div><strong>{s.name}</strong>{Date.now()-Date.parse(s.created_at)<7*86400000&&<small>Nova · últimos 7 dias</small>}<small>{s.owner_name??'Responsável não registrado'}</small></div><span>{s.plan}<small>{label(s.status)}</small></span><time><small>Última atividade</small>{date(s.last_activity)}</time></Link>)}</div><Pager page={page} total={r.data.total} onChange={setPage}/></>}</>;
}
const tabs=[['summary','Resumo'],['team','Equipe'],['activity','Atividade']] as const;
function ShopDetail({id}:{id:string}){
 const r=useResource<PlatformShop>(`/platform/shops/${id}`),[tab,setTab]=useState<string>('summary'),[edit,setEdit]=useState(false);
 return <><Link className="pf-back" to="/platform/barbearias"><ArrowLeft size={16}/>Barbearias</Link><State loading={r.loading} error={r.error} retry={r.reload}/>{r.data&&<><Heading title={r.data.name} note={`${r.data.plan} · ${label(r.data.status)}`}><button onClick={()=>setEdit(true)}>Editar administração</button></Heading><nav className="pf-tabs" aria-label="Detalhes da barbearia">{tabs.map(([key,name])=><button key={key} aria-pressed={key===tab} onClick={()=>setTab(key)}>{name}</button>)}</nav>{tab==='summary'?<section className="pf-panel"><h2>Resumo</h2><ShopContact shop={r.data}/><dl className="pf-summary"><dt>Responsável</dt><dd>{r.data.owner_name??'Não registrado'}</dd><dt>Identificador público</dt><dd>{r.data.slug}</dd><dt>Plano SaaS</dt><dd>{r.data.plan}</dd><dt>Assinatura FIO</dt><dd>{label(r.data.billing_status)}</dd><dt>Fim do período</dt><dd>{date(r.data.current_period_end)}</dd><dt>Última atividade</dt><dd>{date(r.data.last_activity)}</dd></dl></section>:tab==='activity'?<ActivityList shop={id}/>:<ShopSection key={tab} id={id} section={tab as PlatformSection}/>} {edit&&<ShopEditor shop={r.data} close={()=>setEdit(false)} done={()=>{setEdit(false);r.reload();}}/>}</>}</>;
}
const columns:Record<PlatformSection,[string,string][]>= {
 team:[['display_name','Nome'],['role','Papel'],['active','Ativo']],clients:[['name','Nome'],['phone','Contato'],['created_at','Cadastro']],agenda:[['starts_at','Início'],['ends_at','Fim'],['status','Status'],['price_cents','Valor']],subscriptions:[['name','Plano de cortes'],['remaining_cuts','Cortes restantes'],['status','Status'],['expires_at','Validade']],reviews:[['rating','Nota'],['comment','Comentário'],['created_at','Data']],
};
function cell(value:unknown,key:string):ReactNode{if(value===null||value===undefined)return '—';if(typeof value==='boolean')return value?'Sim':'Não';if(key.endsWith('_cents'))return money(Number(value));if(key.endsWith('_at')||key==='current_period_end')return date(String(value));return label(String(value));}
function DataTable({items,cols}:{items:Record<string,unknown>[];cols:[string,string][]}){return <><State empty={!items.length}/>{items.length>0&&<div className="pf-table-wrap"><table><thead><tr>{cols.map(([k,n])=><th key={k}>{n}</th>)}</tr></thead><tbody>{items.map((row,i)=><tr key={String(row.id??row.user_id??i)}>{cols.map(([k])=><td key={k}>{cell(row[k],k)}</td>)}</tr>)}</tbody></table></div>}</>;}
function ShopSection({id,section}:{id:string;section:PlatformSection}){
 const [page,setPage]=useState(1),r=useResource<Page<Record<string,unknown>>>(`/platform/shops/${id}/${section}?page=${page}`);
 return <section className="pf-panel">{section==='subscriptions'&&<p>Pacotes de cortes e saldo de utilização dos clientes desta barbearia.</p>}<State loading={r.loading} error={r.error} retry={r.reload}/>{r.data&&<><DataTable items={r.data.items} cols={columns[section]}/><Pager page={page} total={r.data.total} onChange={setPage}/></>}</section>;
}
function ShopEditor({shop,close,done}:{shop:PlatformShop;close:()=>void;done:()=>void}){
 const plans=useResource<SaasPlan[]>('/platform/plans'),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [name,setName]=useState(shop.name),[status,setStatus]=useState(shop.platform_status),[planId,setPlanId]=useState(shop.plan_id),[billingStatus,setBilling]=useState(shop.billing_status),[period,setPeriod]=useState(shop.current_period_end?.slice(0,10)??'');
 async function save(){setBusy(true);setError('');try{await api(`/platform/shops/${shop.id}`,undefined,{name,status,planId,billingStatus,periodEnd:period===(shop.current_period_end?.slice(0,10)??'')?shop.current_period_end:period?new Date(`${period}T23:59:59Z`).toISOString():null,confirmed:true},'PATCH');done();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <Modal title={confirm?'Confirmar alteração':'Administração da barbearia'} onClose={()=>{if(!busy)close();}}><div className="pf-form">{confirm?<><p>Salvar alterações em <strong>{name}</strong>?</p><p>{label(status)} · {plans.data?.find(p=>p.id===planId)?.name} · {label(billingStatus)}</p>{status==='suspended'&&<p>O acesso operacional da equipe e dos clientes será suspenso.</p>}<small>A alteração será registrada em seu nome.</small><button disabled={busy} onClick={()=>setConfirm(false)}>Revisar</button><button disabled={busy} onClick={()=>void save()}>{busy?'Salvando…':'Confirmar e salvar'}</button></>:<form onSubmit={e=>{e.preventDefault();setConfirm(true);}}><label>Nome<input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label><label>Status da barbearia<select value={status} onChange={e=>setStatus(e.target.value)}>{['active','trial','suspended'].map(s=><option key={s} value={s}>{label(s)}</option>)}</select></label><label>Plano FIO<select required value={planId} onChange={e=>setPlanId(e.target.value)}>{plans.data?.filter(p=>p.active||p.id===shop.plan_id).map(p=><option key={p.id} value={p.id}>{p.name}{!p.active?' (inativo)':''}</option>)}</select></label><State error={plans.error} loading={plans.loading} retry={plans.reload}/><label>Status da assinatura<select value={billingStatus} onChange={e=>setBilling(e.target.value)}>{['active','inactive','trialing','past_due','cancelled'].map(s=><option key={s} value={s}>{label(s)}</option>)}</select></label><label>Fim do período (UTC, opcional)<input type="date" value={period} onChange={e=>setPeriod(e.target.value)}/></label><button disabled={!plans.data}>Revisar alteração</button></form>}{error&&<p role="alert">{error}</p>}</div></Modal>;
}
function Subscriptions(){
 const [status,setStatus]=useState('all'),[page,setPage]=useState(1),r=useResource<Page<Record<string,unknown>>>(`/platform/subscriptions?page=${page}&status=${status}`);
 return <><Heading title="Assinaturas" note="Assinaturas das barbearias no FIO."/><label className="pf-filter">Status<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}>{['all','active','inactive','trialing','past_due','cancelled'].map(s=><option key={s} value={s}>{s==='all'?'Todas':label(s)}</option>)}</select></label><State loading={r.loading} error={r.error} retry={r.reload}/>{r.data&&<><DataTable items={r.data.items.map(s=>({...s,shop:(s.barbershops as {name:string}|null)?.name}))} cols={ [['shop','Barbearia'],['plan','Plano SaaS'],['status','Status'],['current_period_end','Fim do período']]}/><Pager page={page} total={r.data.total} onChange={setPage}/></>}<p className="pf-note">A cobrança recorrente está integrada. Este painel mostra o estado administrativo; a visão financeira confirmada será exibida quando a conciliação de pagamentos estiver disponível aqui.</p></>;
}
function ActivityList({shop}:{shop?:string}){
 const [technical,setTechnical]=useState(false);
 const [query,setQuery]=useState(''),[reset,setReset]=useState(0),[page,setPage]=useState(1),[filtersOpen,setFiltersOpen]=useState(false);
 const r=useResource<Page<AuditEvent>>(`/platform/activity?technical=${technical}&page=${page}${shop?'&shop='+shop:''}${query?'&'+query:''}`);
 function filter(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget),params=new URLSearchParams();for(const [key,value] of f){const raw=String(value).trim();if(!raw)continue;params.set(key,key==='from'?new Date(raw+'T00:00:00').toISOString():key==='to'?new Date(raw+'T23:59:59.999').toISOString():raw);}setQuery(params.toString());setPage(1);setFiltersOpen(false);}
 function clear(){setQuery('');setPage(1);setReset(v=>v+1);setFiltersOpen(false);}
 return <>
  <p className="pf-note">Este histórico registra ações para investigar problemas e alterações. Uma conversa pode gerar vários registros; a contagem não representa erros.</p><label><input type="checkbox" checked={technical} onChange={e=>{setTechnical(e.target.checked);setPage(1);}}/> Incluir detalhes técnicos do Copiloto</label>
  <div className="pf-list-toolbar"><div><strong>{query?'Filtros aplicados':'Todos os registros'}</strong><small>{r.data?`${r.data.total} registro${r.data.total===1?'':'s'}`:'Escolha filtros somente quando precisar.'}</small></div><button type="button" onClick={()=>setFiltersOpen(true)}><SlidersHorizontal size={17}/>Filtrar</button></div>
  {query&&<div className="pf-filter-chips"><span>Filtro ativo</span><button type="button" onClick={clear}>Limpar</button></div>}
  <State loading={r.loading} error={r.error} retry={r.reload}/>
  {r.data&&<section className="pf-panel pf-activity-panel"><Events events={r.data.items}/><Pager page={page} total={r.data.total} onChange={setPage}/></section>}
  {filtersOpen&&<div className="pf-filter-overlay" onClick={()=>setFiltersOpen(false)}><form key={reset} className="pf-filter-sheet" onSubmit={filter} onClick={e=>e.stopPropagation()}><header><div><strong>Filtrar atividade</strong><small>Mostre apenas o que você quer investigar.</small></div><button type="button" aria-label="Fechar filtros" onClick={()=>setFiltersOpen(false)}><X size={18}/></button></header><div className="pf-filter-grid"><label>De<input type="date" name="from"/></label><label>Até<input type="date" name="to"/></label>{!shop&&<ActivityLookup kind="shop"/>}<ActivityLookup kind="user"/><label>Papel<select name="role"><option value="">Todos</option>{['PLATFORM_ADMIN','OWNER','BARBER','CLIENT','UNKNOWN'].map(v=><option key={v} value={v}>{label(v)}</option>)}</select></label><label>Tipo<select name="type"><option value="">Todos</option>{[["appointment.completed","Atendimento concluído"],["appointment.cancelled","Agendamento cancelado"],["appointment.created","Agendamento criado"],["memberships.insert","Vínculo criado"],["platform.shop.updated","Administração / plano"],["platform.plan.updated","Catálogo SaaS"],["payment.recorded","Pagamento registrado"],["reviews.insert","Avaliação criada"]].map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label></div><footer><button type="button" onClick={clear}>Limpar</button><button className="pf-primary" type="submit">Aplicar filtros</button></footer></form></div>}
 </>;
}
function ActivityLookup({kind}:{kind:'shop'|'user'}){
 const [search,setSearch]=useState(''),[term,setTerm]=useState(''),[items,setItems]=useState<{id:string;name:string}[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const timer=setTimeout(()=>setTerm(search.trim()),300);return()=>clearTimeout(timer);},[search]);
 useEffect(()=>{let active=true;if(term.length<2){setItems([]);setError('');setLoading(false);return()=>{active=false;};}setLoading(true);setError('');const path=kind==='shop'?'/platform/shops?limit=25&search='+encodeURIComponent(term):'/platform/actors?search='+encodeURIComponent(term);api<Page<PlatformShop>|{id:string;name:string}[]>(path).then(data=>{if(!active)return;const values=Array.isArray(data)?data:data.items;setItems(values.map(item=>({id:item.id,name:item.name})));}).catch(e=>{if(active)setError((e as Error).message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[kind,term]);
 return <div className="pf-lookup"><label>{kind==='shop'?'Barbearia':'Usuário'}<input aria-label={kind==='shop'?'Buscar barbearia':'Buscar usuário'} placeholder="Digite pelo menos 2 letras" value={search} maxLength={100} onChange={e=>setSearch(e.target.value)}/></label><select name={kind} aria-label={kind==='shop'?'Selecionar barbearia':'Selecionar usuário'} disabled={term.length<2||loading}><option value="">{term.length<2?'Digite para buscar':loading?'Buscando…':'Todos'}</option>{items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>{error&&<small role="alert">{error}</small>}</div>;
}

function Configuration({admin,onInstall,installReady}:{admin:PlatformAdmin;onInstall:()=>void;installReady:boolean}){
 const r=useResource<SaasPlan[]>('/platform/plans'),[edit,setEdit]=useState<SaasPlan|null>(null);
 return <><Heading title="Configurações" note="Catálogo de planos e acesso administrativo."/><section className="pf-panel pf-platform-install"><div><h2>FIO Platform no seu dispositivo</h2><p>Abra este painel direto pela tela inicial, sem procurar o link no navegador.</p></div><button onClick={onInstall}><Download size={17}/>{installReady?'Instalar FIO Platform':'Como instalar'}</button></section><section className="pf-panel"><h2>Seu acesso</h2><p>{admin.display_name} · Platform Admin</p><small>Administradores são cadastrados por um operador autorizado no Supabase.</small><p><button onClick={()=>void supabase?.auth.signOut()}>Sair desta conta</button></p></section><section className="pf-panel"><h2>Planos do FIO</h2><State loading={r.loading} error={r.error} retry={r.reload}/>{r.data?.map(p=><div className="pf-plan" key={p.id}><div><strong>{p.name}</strong><small>{money(p.price_cents)} · {p.active?'Disponível':'Inativo'}</small><small>IA: {p.features.ai_enabled?'habilitada':'desabilitada'} · {String(p.limits.ai_daily_limit??0)} solicitações/dia</small></div><button onClick={()=>setEdit(p)}>Editar</button></div>)}<p className="pf-note">Preço de catálogo. Limites de IA refletem a configuração existente; nenhuma cobrança é disparada.</p></section>{edit&&<PlanEditor plan={edit} close={()=>setEdit(null)} done={()=>{setEdit(null);r.reload();}}/>}</>;
}
function PlanEditor({plan,close,done}:{plan:SaasPlan;close:()=>void;done:()=>void}){
 const [name,setName]=useState(plan.name),[price,setPrice]=useState(plan.price_cents===null?'':String(plan.price_cents/100)),[active,setActive]=useState(plan.active),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(){setBusy(true);try{await api(`/platform/plans/${plan.id}`,undefined,{name,priceCents:price===''?null:Math.round(Number(price)*100),active,confirmed:true},'PATCH');done();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <Modal title={confirm?'Confirmar plano':'Editar plano SaaS'} onClose={()=>{if(!busy)close();}}><div className="pf-form">{confirm?<><p>{name} · {money(price===''?null:Math.round(Number(price)*100))} · {active?'Disponível':'Inativo'}</p><p>Alterar o catálogo não cobra nem cancela assinaturas existentes.</p><button disabled={busy} onClick={()=>setConfirm(false)}>Revisar</button><button disabled={busy} onClick={()=>void save()}>{busy?'Salvando…':'Confirmar e salvar'}</button></>:<form onSubmit={e=>{e.preventDefault();setConfirm(true);}}><label>Nome<input minLength={2} maxLength={100} required value={name} onChange={e=>setName(e.target.value)}/></label><label>Preço em R$ (vazio = não definido)<input type="number" min="0" max="100000" step="0.01" value={price} onChange={e=>setPrice(e.target.value)}/></label><label>Disponibilidade<select value={String(active)} onChange={e=>setActive(e.target.value==='true')}><option value="true">Disponível</option><option value="false">Inativo</option></select></label><button>Revisar alteração</button></form>}{error&&<p role="alert">{error}</p>}</div></Modal>;
}

function FeedbackInbox(){
 const [page,setPage]=useState(1),r=useResource<Page<{id:string;message:string;category:string;role:string;created_at:string;barbershop_id:string;barbershops:{name:string}|null}>>(`/platform/feedback?page=${page}`);
 return <><Heading title="Mensagens dos usuários" note="Sugestões, dúvidas e problemas enviados pelo suporte do FIO."/><State loading={r.loading} error={r.error} retry={r.reload}/>{r.data&&<><State empty={!r.data.items.length}/>{r.data.items.map(x=><section className="pf-panel" key={x.id}><small>{date(x.created_at)} · {x.category==='problem'?'Problema':x.category==='question'?'Dúvida':'Sugestão'} · {label(x.role)}</small><h2><Link to={`/platform/barbearias/${x.barbershop_id}`}>{x.barbershops?.name||'Abrir barbearia'}</Link></h2><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{x.message}</p></section>)}<Pager page={page} total={r.data.total} onChange={setPage}/></>}</>;
}
function ShopContact({shop}:{shop:PlatformShop}){
 const r=useResource<{display_name:string;phone:string|null}>(`/platform/shops/${shop.id}/contact`);
 const days=shop.current_period_end?Math.ceil((Date.parse(shop.current_period_end)-Date.now())/86400000):null;
 const quiet=shop.last_activity?Date.now()-Date.parse(shop.last_activity)>7*86400000:true;
 const [welcome,setWelcome]=useState(Date.now()-Date.parse(shop.created_at)<7*86400000),[expiry,setExpiry]=useState(days!==null&&days<=7),[inactive,setInactive]=useState(quiet);
 const intro=`Olá, ${r.data?.display_name||shop.owner_name||'tudo bem'}! Aqui é da equipe FIO.`;
 const message=[intro,welcome?'Vi que você criou sua conta no FIO. Conseguiu configurar sua barbearia?':'',expiry&&days!==null?`O período atual do seu ${shop.billing_status==='trialing'?'teste':'plano'} ${days<0?'terminou':'termina'} em ${date(shop.current_period_end)}. Consulte a situação em Plano FIO.`:'',inactive?'Não vimos atividade registrada recentemente. Está precisando de ajuda para usar o FIO?':'','Se tiver alguma dúvida, pode contar com a gente.'].filter(Boolean).join(' ');
 const raw=(r.data?.phone||'').replace(/\D/g,''),phone=raw.startsWith('55')?raw:`55${raw}`;
 return <section className="pf-contact"><h3>Acompanhamento</h3><p>{quiet?'Sem atividade registrada nos últimos 7 dias. Isso não prova abandono.':'Há atividade registrada recentemente.'}</p>{days!==null&&days<=7&&<p>{days<0?'Período encerrado.':'Período próximo do fim.'}</p>}<div className="pf-filters"><label><input type="checkbox" checked={welcome} onChange={e=>setWelcome(e.target.checked)}/>Boas-vindas</label><label><input type="checkbox" checked={expiry} onChange={e=>setExpiry(e.target.checked)} disabled={days===null}/>Fim do período</label><label><input type="checkbox" checked={inactive} onChange={e=>setInactive(e.target.checked)}/>Ajuda com o uso</label></div><p style={{whiteSpace:'pre-wrap'}}>{message}</p><State loading={r.loading} error={r.error} retry={r.reload}/>{raw.length>=10?<a className="pf-primary" href={`https://wa.me/${phone}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">Revisar mensagem no WhatsApp</a>:<p>Responsável sem telefone disponível.</p>}<small>A mensagem abre preenchida. Você revisa e decide enviar no WhatsApp.</small></section>;
}
