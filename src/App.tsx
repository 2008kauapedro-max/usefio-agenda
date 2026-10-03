import { useI18n } from './i18n';
import { loadLocalePreferences,saveLocalePreferences } from './i18n/supabaseLocale';
import {appointmentLink} from './lib/appointment-link';
import { clientContext,rememberClientShop } from './lib/client-context';
import { useCallback,useEffect,useRef,useState,lazy,Suspense } from 'react';
import { Link,NavLink,Navigate,useLocation,useNavigate } from 'react-router-dom';
import { LayoutDashboard,CalendarDays,Sparkles,Users,Scissors,UserRound,Wallet,LogOut,Menu,X,Images,Megaphone,Sun,Moon,Crown,CircleHelp,Settings,MoreHorizontal } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import type { Bootstrap,Membership,Role } from '../shared/domain';
import { planAllows,type FioFeature } from '../shared/entitlements';
import { roleHome } from '../shared/domain';
import { api,supabase } from './lib/api';
import { AuthPage,EmailConfirmationPage,Onboarding } from './pages/Auth';
import { Agenda,Customers,Dashboard,Services,Settings as SettingsPage,Subscriptions,Team,Communication,Support,type WorkspaceProps } from './pages/Workspace';
import { AssistantChat } from './components/AssistantChat';
import { Feed } from './pages/Feed';
import { PublicPortal } from './pages/PublicPortal';
import { GuidedTour } from './components/GuidedTour';
import { FioPlans } from './pages/FioPlans';
const PlatformApp=lazy(()=>import('./pages/Platform').then(m=>({default:m.PlatformApp})));
const PlatformLogin=lazy(()=>import('./pages/Platform').then(m=>({default:m.PlatformLogin})));


function AppLoading(){
 const {t}=useI18n();
 return <div className="fio-loading-screen" role="status" aria-label={t('app.loadingAria')}><img src="/FIOlogo/FIObranco.png" alt=""/></div>;
}

type NavItem={path:string;label:string;icon:typeof LayoutDashboard;roles:Role[];feature?:FioFeature};
const navItems:NavItem[]=[
 {path:'',label:'Visão geral',icon:LayoutDashboard,roles:['OWNER','BARBER','CLIENT']},
 {path:'/agenda',label:'Agenda',icon:CalendarDays,roles:['OWNER','BARBER','CLIENT']},
 {path:'/assistente',label:'Assistente',icon:Sparkles,roles:['OWNER','BARBER','CLIENT'],feature:'assistant'},
 {path:'/feed',label:'Feed',icon:Images,roles:['OWNER','BARBER','CLIENT'],feature:'feed'},
 {path:'/clientes',label:'Clientes',icon:Users,roles:['OWNER']},
 {path:'/equipe',label:'Equipe',icon:UserRound,roles:['OWNER','BARBER']},
 {path:'/profissionais',label:'Profissionais',icon:UserRound,roles:['CLIENT']},
 {path:'/servicos',label:'Serviços',icon:Scissors,roles:['OWNER','BARBER','CLIENT']},
 {path:'/assinaturas',label:'Pacotes de cortes',icon:Wallet,roles:['OWNER','CLIENT']},
 {path:'/comunicacao',label:'Comunicação',icon:Megaphone,roles:['OWNER'],feature:'communication'},
 {path:'/plano-fio',label:'Plano FIO',icon:Crown,roles:['OWNER']},
 {path:'/configuracoes',label:'Configurações',icon:Settings,roles:['OWNER','BARBER','CLIENT']},
 {path:'/suporte',label:'Ajuda e suporte',icon:CircleHelp,roles:['OWNER','BARBER','CLIENT']}
];

type Theme='dark'|'light';
type InstallPromptEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};

export default function App(){
 const {t,locale,region,setLocale,setRegion,setCurrency}=useI18n();
 const location=useLocation(),navigate=useNavigate();
 const isPlatform=location.pathname==='/acesso/plataforma'||location.pathname==='/platform'||location.pathname.startsWith('/platform/');
 const reservedPublicSlugs=new Set(['owner','barber','client','login','reset-password','confirm-email','acesso','b','barbearia','platform','api']);
 const singleSlug=location.pathname.match(/^\/([a-z0-9-]{3,60})\/?$/)?.[1]??'';
 const isCleanPublicSlug=Boolean(singleSlug&&!reservedPublicSlugs.has(singleSlug));
 const isPublicPortal=location.pathname.startsWith('/b/')||location.pathname.startsWith('/barbearia/')||isCleanPublicSlug;
 const demo=false,demoRole='OWNER' as Role;
 const [session,setSession]=useState<Session|null>(null),[authReady,setAuthReady]=useState(!supabase),[memberships,setMemberships]=useState<Membership[]|null>(null),[onboardingShopId,setOnboardingShopId]=useState(''),[clientJoinPending,setClientJoinPending]=useState(false),[shopId,setShopId]=useState(sessionStorage.getItem('fio-shop')??''),[data,setData]=useState<Bootstrap|null>(null),[error,setError]=useState(''),[toast,setToast]=useState(''),[menu,setMenu]=useState(false);
 const [theme,setTheme]=useState<Theme>(()=>(localStorage.getItem('fio-theme')==='light'?'light':'dark'));
 const [installPrompt,setInstallPrompt]=useState<InstallPromptEvent|null>(null);
 const sidebarNavRef=useRef<HTMLElement>(null);
 const localeLoadedRef=useRef('');
 const activeRole=data?.membership.role;
 const navLabel=(path:string)=>t(({
  '':'nav.overview',
  '/agenda':'nav.agenda',
  '/assistente':'nav.assistant',
  '/feed':'nav.feed',
  '/clientes':'nav.clients',
  '/equipe':'nav.team',
  '/profissionais':'nav.professionals',
  '/servicos':'nav.services',
  '/assinaturas':'nav.packages',
  '/comunicacao':'nav.communication',
  '/plano-fio':'nav.fioPlan',
  '/configuracoes':'nav.settings',
  '/suporte':'nav.support'
 } as Record<string,string>)[path]??'nav.overview');

 useEffect(()=>{
  const client=supabase;
  if(!client||!data?.shop.id||!data.membership.user_id)return;
  const key=`${data.shop.id}:${data.membership.user_id}`;
  if(localeLoadedRef.current===key)return;
  let active=true;
  void loadLocalePreferences(client,data.shop.id,data.membership.user_id).then(async pref=>{
   if(!active||!pref)return;
   if(pref.explicit){
    setLocale(pref.preferred_locale,{persistLocal:true,updateDefaults:false});
    setRegion(pref.preferred_region);
    setCurrency('BRL');
   }else{
    await saveLocalePreferences(client,data.shop.id,{preferred_locale:locale,preferred_region:(region||'BR').trim().toUpperCase(),preferred_currency:'BRL'});
   }
   localeLoadedRef.current=key;
  }).catch(()=>{localeLoadedRef.current=key;});
  return()=>{active=false;};
 },[data?.shop.id,data?.membership.user_id,setLocale,setRegion,setCurrency]);
 useEffect(()=>{const change=(e:Event)=>setTheme((e as CustomEvent<Theme>).detail);window.addEventListener('fio-theme-change',change);return()=>window.removeEventListener('fio-theme-change',change);},[]);
 useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('fio-theme',theme);},[theme]);
 useEffect(()=>{
  type InstallWindow=Window&{__fioInstallPrompt?:InstallPromptEvent|null};
  const installWindow=window as InstallWindow;
  const syncPrompt=()=>setInstallPrompt(installWindow.__fioInstallPrompt??null);
  const onInstall=(event:Event)=>{event.preventDefault();installWindow.__fioInstallPrompt=event as InstallPromptEvent;setInstallPrompt(event as InstallPromptEvent);};
  const onInstalled=()=>{installWindow.__fioInstallPrompt=null;setInstallPrompt(null);};
  syncPrompt();
  window.addEventListener('beforeinstallprompt',onInstall);
  window.addEventListener('fio-install-ready',syncPrompt);
  window.addEventListener('fio-app-installed',onInstalled);
  return()=>{window.removeEventListener('beforeinstallprompt',onInstall);window.removeEventListener('fio-install-ready',syncPrompt);window.removeEventListener('fio-app-installed',onInstalled);};
 },[]);
 useEffect(()=>{if(!supabase)return;supabase.auth.getSession().then(({data:{session}})=>{setSession(session);setAuthReady(true);});const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>{if(s)try{const started=Number(localStorage.getItem('fio-tour:google-signup-started'));const created=Date.parse(s.user.created_at);if(s.user.app_metadata.provider==='google'&&Number.isFinite(started)){if(Number.isFinite(created)&&created>=started-60_000&&created<=started+15*60_000)localStorage.setItem(`fio-tour:new-account:${s.user.id}`,'pending');localStorage.removeItem('fio-tour:google-signup-started');}}catch{}setSession(s);setAuthReady(true);if(!s){setData(null);setMemberships(null);}});return()=>subscription.unsubscribe();},[]);
 const loadMemberships=useCallback(async()=>{try{
  const m=await api<Membership[]>('/memberships');setMemberships(m);
  const clientSlug=clientContext(window.location.pathname,window.location.search);
  if(clientSlug)rememberClientShop(clientSlug);
  const requestedShop=new URLSearchParams(window.location.search).get('shopId');
  let preferredShop=m.some(x=>x.barbershop_id===requestedShop)?requestedShop!:'';let needsClientJoin=false;
  if(clientSlug&&!preferredShop){
   try{
    const response=await fetch(`/api/public/shop/${encodeURIComponent(clientSlug)}`),body=await response.json();
    if(!response.ok)throw new Error(t('app.publicShopOpenFailed'));
    const targetId=String(body?.shop?.id??'');
    if(!targetId)throw new Error(t('app.shopNotFound'));
    if(targetId){const membership=m.find(x=>x.barbershop_id===targetId);if(membership&&membership.role!=='CLIENT')throw new Error('CLIENT_ACCOUNT_REQUIRED');if(membership)preferredShop=targetId;else needsClientJoin=true;}
   }catch(e){if((e as Error).message==='CLIENT_ACCOUNT_REQUIRED')throw new Error(t('app.clientAccountRequired'));throw new Error(t('app.publicShopOpenFailed'));}
  }
  setClientJoinPending(needsClientJoin);
  const owner=m.find(x=>x.role==='OWNER');
  if(owner&&!clientSlug){try{const snapshot=await api<{shop:{onboarding_completed:boolean}}>('/onboarding/progress',owner.barbershop_id);setOnboardingShopId(snapshot.shop.onboarding_completed?'':owner.barbershop_id);}catch{setOnboardingShopId('');}}else setOnboardingShopId('');
  setShopId(prev=>{const next=preferredShop||(m.some(x=>x.barbershop_id===prev)?prev:m[0]?.barbershop_id??'');if(next)sessionStorage.setItem('fio-shop',next);return next;});setError('');
 }catch(e){setError((e as Error).message);}},[]);
 useEffect(()=>{if(session&&!demo&&!isPlatform&&!isPublicPortal)void loadMemberships();},[session?.user.id,demo,isPlatform,isPublicPortal,loadMemberships]);
 const refresh=useCallback(async()=>{if(demo||!shopId)return;const next=await api<Bootstrap>('/bootstrap',shopId);setData(next);setError('');},[demo,shopId]);
 useEffect(()=>{if(session&&shopId&&!isPlatform&&!isPublicPortal&&!onboardingShopId){setData(null);void refresh().catch(e=>setError(e.message));}},[shopId,session?.user.id,refresh,isPlatform,isPublicPortal,onboardingShopId]);
 useEffect(()=>{if(!session||!shopId||isPlatform||isPublicPortal||onboardingShopId)return;void refresh().catch(()=>undefined);},[location.pathname,session?.user.id,shopId,isPlatform,isPublicPortal,onboardingShopId,refresh]);
 useEffect(()=>{if(!session||!shopId||isPlatform||isPublicPortal||onboardingShopId)return;const sync=()=>void refresh().catch(()=>undefined);const visible=()=>{if(document.visibilityState==='visible')sync();};window.addEventListener('focus',sync);window.addEventListener('online',sync);document.addEventListener('visibilitychange',visible);const timer=window.setInterval(sync,60000);return()=>{window.removeEventListener('focus',sync);window.removeEventListener('online',sync);document.removeEventListener('visibilitychange',visible);window.clearInterval(timer);};},[session?.user.id,shopId,isPlatform,isPublicPortal,onboardingShopId,refresh]);
 useEffect(()=>{
  if(!supabase||!session||!shopId||isPlatform||isPublicPortal||onboardingShopId)return;
  let refreshTimer:number|undefined;
  const scheduleRefresh=(showNew:boolean,createdBy?:string)=>{
   if(refreshTimer)window.clearTimeout(refreshTimer);
   refreshTimer=window.setTimeout(()=>{
    void refresh().catch(()=>undefined);
    if(showNew&&activeRole!=='CLIENT'&&createdBy!==session.user.id)setToast(t('app.newAppointment'));
   },180);
  };
  const channel=supabase.channel(`fio-appointments-${shopId}-${session.user.id}`)
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'appointments',filter:`barbershop_id=eq.${shopId}`},payload=>{const record=payload.new as {created_by?:string};scheduleRefresh(true,record.created_by);})
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'appointments',filter:`barbershop_id=eq.${shopId}`},()=>scheduleRefresh(false))
   .subscribe();
  return()=>{if(refreshTimer)window.clearTimeout(refreshTimer);void supabase?.removeChannel(channel);};
 },[session?.user.id,shopId,isPlatform,isPublicPortal,onboardingShopId,refresh,activeRole]);

 useEffect(()=>{setMenu(false);},[location.pathname]);
 useEffect(()=>{
  if(!menu)return;
  const previous=document.activeElement as HTMLElement|null;
  const panel=sidebarNavRef.current?.closest('aside');
  const frame=requestAnimationFrame(()=>{sidebarNavRef.current?.scrollTo({top:0});panel?.querySelector<HTMLElement>('button,a')?.focus();});
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setMenu(false);if(e.key==='Tab'&&panel){const nodes=Array.from(panel.querySelectorAll<HTMLElement>('a,button,select')).filter(n=>n.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
  document.addEventListener('keydown',key);return()=>{cancelAnimationFrame(frame);document.removeEventListener('keydown',key);previous?.focus();};
 },[menu]);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),5000);return()=>clearTimeout(timer);},[toast]);
 useEffect(()=>{if(data?.membership.role==='CLIENT')rememberClientShop(data.shop.slug);},[data?.membership.role,data?.shop.slug]);
 useEffect(()=>{
  const manifest=document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if(!manifest||!data||isPlatform||isPublicPortal)return;
  manifest.href=data.membership.role==='OWNER'?'/manifest-owner.webmanifest':data.membership.role==='BARBER'?'/manifest-staff.webmanifest':`/api/public/manifest/${encodeURIComponent(data.shop.slug)}?v=client-brand-v2`;
 },[data?.membership.role,data?.shop.slug,isPlatform,isPublicPortal]);

 if(location.pathname==='/acesso/plataforma')return <Suspense fallback={<AppLoading/>}><PlatformLogin session={session} ready={authReady}/></Suspense>;
 if(isPlatform)return <Suspense fallback={<AppLoading/>}><PlatformApp session={session} ready={authReady}/></Suspense>;
 if(isPublicPortal)return <PublicPortal/>;
 if(location.pathname==='/acesso/gestao')return <Navigate replace to="/login?audience=owner"/>;
 if(location.pathname==='/acesso/equipe')return <Navigate replace to="/login?audience=staff"/>;
 if(location.pathname==='/confirm-email')return <EmailConfirmationPage/>;
 if(location.pathname==='/login')return <AuthPage/>;
 if(location.pathname==='/reset-password')return <AuthPage reset/>;
 if(location.pathname==='/'&&!authReady)return <AppLoading/>;
 if(!demo&&!authReady)return <AppLoading/>;
 if(!demo&&!session){
  const audience=location.pathname.startsWith('/owner')?'owner':location.pathname.startsWith('/barber')?'staff':location.pathname.startsWith('/client')?'client':new URLSearchParams(location.search).get('audience')||(clientContext(location.pathname,location.search)?'client':'');
  const params=new URLSearchParams();const next=appointmentLink(location.pathname+location.search);if(next)params.set('next',next);if(audience)params.set('audience',audience);const shop=clientContext(location.pathname,location.search);if(shop)params.set('shop',shop);
  return <Navigate replace to={`/login${params.toString()?`?${params.toString()}`:''}`}/>;
 }
 if(error)return <div className="full-error"><h1>{t('app.openFailed')}</h1><p role="alert">{error}</p><button className="primary" onClick={()=>{setError('');void loadMemberships().then(refresh).catch(e=>setError(e.message));}}>{t('app.tryAgain')}</button><button className="secondary" onClick={()=>void supabase?.auth.signOut({scope:'local'})}>{t('app.signOut')}</button><Link to="/login">{t('app.backToAccess')}</Link></div>;
 if(!demo&&memberships===null)return <AppLoading/>;
 if(!demo&&(memberships?.length===0||Boolean(onboardingShopId)||clientJoinPending))return <Onboarding shopId={onboardingShopId||undefined} onDone={()=>void loadMemberships()}/>;
 if(!data)return <AppLoading/>;
 if(location.pathname==='/')return <Navigate replace to={roleHome(data.membership.role)+location.search}/>;

 const role=data.membership.role,base=roleHome(role),page=location.pathname.slice(base.length),solo=data.shop.operation_mode==='SOLO',items=navItems.filter(n=>n.roles.includes(role)&&(!n.feature||planAllows(data.plan,n.feature))&&!(solo&&n.path==='/equipe'));
 if(!location.pathname.startsWith(base+'/')&&location.pathname!==base)return <Navigate replace to={base}/>;
 if(page!==''&&page!=='/configuracoes'&&!items.some(n=>n.path===page))return <Navigate replace to={base}/>;
 const props:WorkspaceProps={data,demo,base,refresh,notify:setToast,updateDemo:fn=>setData(d=>d?fn(d):d),canInstall:Boolean(installPrompt),installApp:async()=>{
  type InstallWindow=Window&{__fioInstallPrompt?:InstallPromptEvent|null};
  const prompt=installPrompt??(window as InstallWindow).__fioInstallPrompt??null;
  if(!prompt){setToast(t('app.installUnavailable'));return;}
  await prompt.prompt();
  await prompt.userChoice;
  (window as InstallWindow).__fioInstallPrompt=null;
  setInstallPrompt(null);
 }};
 let content;
 switch(page){
  case '/agenda':content=<Agenda {...props}/>;break;
  case '/clientes':content=<Customers {...props}/>;break;
  case '/equipe':content=<Team {...props}/>;break;
   case '/profissionais':content=<Team {...props}/>;break;
  case '/servicos':content=<Services {...props}/>;break;
  case '/assinaturas':content=<Subscriptions {...props}/>;break;
  case '/comunicacao':content=<Communication {...props}/>;break;
  case '/plano-fio':content=<FioPlans {...props}/>;break;
  case '/configuracoes':content=<SettingsPage {...props}/>;break;
  case '/suporte':content=<Support {...props}/>;break;
  case '/feed':content=<Feed {...props}/>;break;
  case '/assistente':content=<AssistantChat role={role} plan={data.plan} aiEnabled={data.aiEnabled} shopId={data.shop.id} shopName={data.shop.public_title||data.shop.name} shopLogo={data.shop.logo_url||undefined} demo={demo} base={base}/>;break;
  default:content=<Dashboard {...props}/>;
 }
 const toggleTheme=()=>setTheme(t=>t==='dark'?'light':'dark');
 return <div className={`app-shell ${role==='CLIENT'?'client-shell':''} ${page==='/assistente'?'chat-shell':''}`}>
  {menu&&<button className="menu-backdrop" aria-label={t('app.closeMenu')} onClick={()=>setMenu(false)}/>}
  <aside className={`sidebar ${menu?'is-open':''}`}>
   <div className="sidebar-brand sidebar-shop-brand">
    <Link to={base} className="sidebar-shop-link" aria-label={t('app.openShop',{name:data.shop.name})}>
     <span className="sidebar-shop-logo">
      {data.shop.logo_url?<img src={data.shop.logo_url} alt=""/>:<Scissors size={18}/>}
     </span>
     <span className="sidebar-shop-copy">
      <strong>{data.shop.public_title||data.shop.name}</strong>
      <small>{role==='OWNER'?(solo?t('role.fioSolo'):t('role.fioManagement')):role==='BARBER'?t('role.fioTeam'):t('role.clientArea')}</small>
     </span>
    </Link>
    <button className="icon-button close-menu" aria-label={t('app.closeNavigation')} onClick={()=>setMenu(false)}><X size={20}/></button>
   </div>
   <p className="nav-label">{t('nav.navigation')}</p>
   <nav ref={sidebarNavRef} aria-label={t('app.mainNavigation')}>{items.filter(n=>!['/configuracoes','/suporte'].includes(n.path)).map(n=><NavLink data-tour={`nav${n.path.replace('/','-')}`} end={n.path===''} className={({isActive})=>`nav-link ${isActive?'active':''}`} to={base+n.path} key={n.path}><n.icon size={19} strokeWidth={1.6}/>{navLabel(n.path)}{n.path==='/assistente'&&<span className="ai-tag">IA</span>}</NavLink>)}</nav>
   <div className="sidebar-bottom">
    <NavLink className="nav-link" to={`${base}/configuracoes`}>
     <Settings size={19}/>{t('nav.settings')}
    </NavLink>
    <NavLink className="nav-link" to={`${base}/suporte`}>
     <CircleHelp size={19}/>{t("nav.support")}
    </NavLink>
    {role!=='CLIENT'&&memberships&&memberships.length>1?<label className="field">{t('app.switchBusiness')}<select value={shopId} onChange={e=>{sessionStorage.setItem('fio-shop',e.target.value);setShopId(e.target.value);}}>{memberships.map(m=><option key={m.barbershop_id} value={m.barbershop_id}>{m.role} · {m.barbershop_id.slice(0,8)}</option>)}</select></label>:null}
    <button className="nav-link theme-toggle" onClick={toggleTheme}>{theme==='dark'?<Sun size={19}/>:<Moon size={19}/>} {theme==='dark'?t('nav.lightTheme'):t('nav.darkTheme')}</button>
    <div className="profile">
     <NavLink data-tour="profile" className="profile-account" to={`${base}/configuracoes`} aria-label={t('app.openProfile')}>
      <span className="avatar small">{data.membership.avatar_url?<img src={data.membership.avatar_url} alt=""/>:data.membership.display_name.split(' ').map(n=>n[0]).slice(0,2).join('')}</span>
      <span className="profile-copy"><strong>{data.membership.display_name}</strong><small>{role==='OWNER'?(solo?t('role.solo'):t('role.owner')):role==='BARBER'?t('role.barber'):t('role.client')} · {t('nav.settings')}</small></span>
     </NavLink>
     <button className="icon-button" aria-label={t('app.signOut')} title={t('app.signOut')} onClick={()=>{if(demo)navigate('/login');else void supabase?.auth.signOut();}}><LogOut size={17}/></button>
    </div>
   </div>
  </aside>
  <div className="workspace" inert={menu}>
   <header className="topbar"><div className="mobile-brand">{role==='CLIENT'?<Link to={base} className="client-mobile-brand">{data.shop.logo_url?<img src={data.shop.logo_url} alt=""/>:<Scissors size={24}/>}<span>{data.shop.public_title||data.shop.name}</span></Link>:<Link to={base} className="sidebar-logo" aria-label="FIO"><img src={theme==='dark'?'/FIOlogo+nome/Branco.png':'/FIOlogo+nome/Preto.png'} alt="FIO"/></Link>}</div><div className="breadcrumb"><span>{data.shop.name}</span><span>/</span><strong>{page==='/configuracoes'?t('nav.settings'):navLabel(page)}</strong></div><div className="header-right">{role==='OWNER'?<NavLink to={`${base}/plano-fio`} className="plan-badge plan-badge-link">FIO {data.plan}</NavLink>:role==='BARBER'?<span className="plan-badge">FIO {data.plan}</span>:null}<button className="icon-button compact-theme" aria-label={theme==='dark'?t('app.useLightTheme'):t('app.useDarkTheme')} onClick={toggleTheme}>{theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</button><button className="icon-button mobile-menu-button" aria-label={t('app.openMenu')} onClick={()=>setMenu(true)}><Menu size={22}/></button></div></header>
   <main key={`${base}:${shopId}:${page}`} className={page==='/assistente'?'chat-main assistant-chat-main':'main-content'}>{content}</main>
   <nav className="bottom-nav" aria-label={t('app.mobileNavigation')}>
    <NavLink end to={base}><LayoutDashboard size={21}/><span>{t('nav.home')}</span></NavLink>
    <NavLink to={base+'/agenda'}><CalendarDays size={21}/><span>{t("nav.agenda")}</span></NavLink>
    {planAllows(data.plan,'assistant')?<NavLink to={base+'/assistente'}><Sparkles size={21}/><span>{t("nav.assistant")}</span></NavLink>:<NavLink to={base+'/servicos'}><Scissors size={21}/><span>{t('nav.services')}</span></NavLink>}
    <button className={menu||!['','/agenda','/assistente','/servicos'].includes(page)?'active':''} aria-label={t('app.moreOptions')} aria-expanded={menu} onClick={()=>setMenu(!menu)}><MoreHorizontal size={21}/><span>{t("nav.more")}</span></button>
   </nav>
  </div>
  <GuidedTour key={`${shopId}:${data.membership.user_id}:${role}`} userId={data.membership.user_id} shopId={shopId} role={role} base={base} openMenu={setMenu}/>
  {toast&&<div className={`toast ${/não foi|falh|erro|indisponível|expir|aguarde|pendente/i.test(toast)?'is-error':'is-success'}`} role="status">{toast}<button aria-label={t('app.closeNotice')} onClick={()=>setToast('')}><X size={16}/></button></div>}
 </div>;
}



