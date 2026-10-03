import { useI18n } from '../i18n';
import {appointmentLink} from '../lib/appointment-link';
import { clientContext,rememberClientShop } from '../lib/client-context';
import { ShopIdentity } from '../components/ShopIdentity';
import {AuthCaptcha,captchaSiteKey} from '../components/AuthCaptcha';
import { useEffect,useState,type FormEvent } from 'react';
import { Link,useLocation,useNavigate } from 'react-router-dom';
import { supabase,api,getRememberSession,setRememberSession } from '../lib/api';
import { Field } from '../components/ui';
import { CheckCircle2,Eye,EyeOff,LoaderCircle } from 'lucide-react';
import { OwnerOnboarding } from './OwnerOnboarding';

type AuthMode='login'|'signup'|'forgot';

export function AuthPage({reset=false}:{reset?:boolean}) {
 const {t}=useI18n();
 const location=useLocation(),navigate=useNavigate();
 const params=new URLSearchParams(location.search);
 const shop=clientContext(location.pathname,location.search);
 const audience=params.get('audience')||(shop?'client':'');
 useEffect(()=>{if(shop)rememberClientShop(shop);},[shop]);
 const [clientShopName,setClientShopName]=useState('');
 useEffect(()=>{
  if(audience!=='client'||!shop){setClientShopName('');return;}
  const controller=new AbortController();let active=true;
  fetch(`/api/public/shop/${encodeURIComponent(shop)}`,{signal:controller.signal,cache:'no-store'})
   .then(async r=>{if(!r.ok)throw Error();return r.json();})
   .then(body=>{if(active)setClientShopName(body?.shop?.public_title||body?.shop?.name||'');})
   .catch(()=>undefined);
  return()=>{active=false;controller.abort();};
 },[audience,shop]);
 const requestedMode=params.get('mode');
 const initialMode:AuthMode=requestedMode==='forgot'?'forgot':requestedMode==='signup'?'signup':'login';

 const [mode,setMode]=useState<AuthMode>(initialMode);
 const [email,setEmail]=useState(params.get('email')??'');
 const [signupPhone,setSignupPhone]=useState('');
 const [password,setPassword]=useState('');
 const [confirmPassword,setConfirmPassword]=useState('');
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const [resetReady,setResetReady]=useState(!reset);
 const [resetInvalid,setResetInvalid]=useState(false);
 const [showPassword,setShowPassword]=useState(false);
 const [showConfirmPassword,setShowConfirmPassword]=useState(false);
 const [remember,setRemember]=useState(()=>getRememberSession());
 const [captchaToken,setCaptchaToken]=useState(''),[captchaAttempt,setCaptchaAttempt]=useState(0);
 useEffect(()=>{const restore=()=>setBusy(false);window.addEventListener('pageshow',restore);return()=>window.removeEventListener('pageshow',restore);},[]);
 const needsCaptcha=Boolean(captchaSiteKey)&&!reset;
 useEffect(()=>{setCaptchaToken('');setCaptchaAttempt(v=>v+1);},[mode,reset]);

 useEffect(()=>{
  if(!reset||!supabase)return;
  const authClient=supabase;
  let active=true;

  const check=async()=>{
   const {data:{session}}=await authClient.auth.getSession();
   if(!active)return;
   if(session){
    setResetReady(true);
    setResetInvalid(false);
   }else{
    window.setTimeout(async()=>{
     const {data:{session:lateSession}}=await authClient.auth.getSession();
     if(!active)return;
     setResetReady(Boolean(lateSession));
     setResetInvalid(!lateSession);
    },900);
   }
  };

  void check();

  const {data:{subscription}}=authClient.auth.onAuthStateChange((event,session)=>{
   if(!active)return;
   if(event==='PASSWORD_RECOVERY'||session){
    setResetReady(true);
    setResetInvalid(false);
   }
  });

  return()=>{
   active=false;
   subscription.unsubscribe();
  };
 },[reset]);

 useEffect(()=>{
  if(reset||mode!=='login'||!supabase)return;
  let active=true;
  let redirected=false;
  const goToAccount=(sessionExists:boolean)=>{
   if(!active||!sessionExists||redirected)return;
   redirected=true;
   if(appointmentLink(params.get('next')))navigate(appointmentLink(params.get('next'))!,{replace:true});
   else if(audience==='platform')navigate('/platform',{replace:true});
   else if(audience==='owner')navigate('/owner',{replace:true});
   else if(audience==='staff')navigate('/barber',{replace:true});
   else if(audience==='client')navigate(shop?`/?shop=${encodeURIComponent(shop)}&audience=client`:'/client',{replace:true});
   else navigate('/',{replace:true});
  };
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>goToAccount(Boolean(session)));
  void supabase.auth.getSession().then(({data:{session}})=>goToAccount(Boolean(session)));
  return()=>{active=false;subscription.unsubscribe();};
 },[reset,mode,audience,shop,navigate]);

 useEffect(()=>{
  if(reset)return;
  const callbackParams=new URLSearchParams(location.search);
  const fragmentParams=new URLSearchParams(location.hash.replace(/^#/,'').replace(/^\?/,'') );
  const oauthError=callbackParams.get('error_description')||callbackParams.get('error')||callbackParams.get('error_code')||fragmentParams.get('error_description')||fragmentParams.get('error')||fragmentParams.get('error_code');
  if(!oauthError)return;
  setMessage(oauthError==='access_denied'?t('auth.oauthCancelled'):t('auth.oauthFailed'));
  for(const params of [callbackParams,fragmentParams]){params.delete('error');params.delete('error_description');params.delete('error_code');}
  const cleanSearch=callbackParams.toString();
  const cleanHash=fragmentParams.toString();
  navigate({pathname:location.pathname,search:cleanSearch?`?${cleanSearch}`:'',hash:cleanHash?`#${cleanHash}`:''},{replace:true});
 },[location.pathname,location.search,location.hash,navigate,reset]);

 const destination=()=>{
  if(audience==='platform')return '/acesso/plataforma';
  if(audience==='owner')return '/acesso/gestao';
  if(audience==='staff')return '/acesso/equipe';
  if(audience==='client')return `/login?audience=client${shop?`&shop=${encodeURIComponent(shop)}`:''}`;
  return '/login';
 };

 async function signInWithGoogle(){
  setMessage('');
  if(!supabase){setMessage(t('auth.openLoginFailed'));return;}
  setRememberSession(remember);setBusy(true);
  try{
   const query=new URLSearchParams();
   query.set('audience',audience||'owner');
   if(shop)query.set('shop',shop);
   const redirectTo=`${window.location.origin}/login${query.toString()?`?${query.toString()}`:''}`;
   try{localStorage.setItem('fio-tour:google-signup-started',String(Date.now()));}catch{}
   const result=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo,queryParams:{prompt:'select_account'}}});
   if(result.error)throw result.error;
  }catch{setMessage(t('auth.googleOpenFailed'));setBusy(false);}
 }

 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  const form=new FormData(e.currentTarget);
  const submittedPassword=String(form.get('password')??password);
  const submittedConfirmPassword=String(form.get('confirmPassword')??confirmPassword);
  setMessage('');

  if(!supabase){
   setMessage(t('auth.unavailable'));
   return;
  }

  if(reset){
   if(!resetReady){
    setMessage(t('auth.recoveryInvalid'));
    return;
   }
   if(submittedPassword.length<8){
    setMessage(t('auth.passwordMin'));
    return;
   }
   if(submittedPassword!==submittedConfirmPassword){
    setMessage(t('auth.passwordMismatch'));
    return;
   }
  }

  if(needsCaptcha&&!captchaToken){setMessage(t('auth.captchaRequired'));return;}
  setBusy(true);

  try{
   if(reset){
    const result=await supabase.auth.updateUser({password:submittedPassword});
    if(result.error){
     setMessage(t('auth.passwordChangeFailed'));
     return;
    }
    setMessage(t('auth.passwordChanged'));
    window.setTimeout(()=>navigate(destination(),{replace:true}),700);
    return;
   }

   if(mode==='forgot'){
    const query=new URLSearchParams();
    if(audience)query.set('audience',audience);
    if(shop)query.set('shop',shop);
    const suffix=query.toString()?`?${query.toString()}`:'';
    const redirect=`${window.location.origin}/reset-password${suffix}`;
    const result=await supabase.auth.resetPasswordForEmail(email,{redirectTo:redirect,captchaToken:captchaToken||undefined});

    if(result.error){
     setMessage(t('auth.resetSendFailed'));
     return;
    }

    setMessage(t('auth.resetSent'));
    return;
   }

   if(mode==='signup'){
    const phoneDigits=signupPhone.replace(/\D/g,'');
    if(phoneDigits.length<10||phoneDigits.length>13){
     setMessage(t('auth.phoneInvalid'));
     return;
    }
    setRememberSession(remember);
    const confirmationAudience=audience||'owner';
    const query=new URLSearchParams({audience:confirmationAudience,email:email.trim()});
    if(shop)query.set('shop',shop);
    const result=await supabase.auth.signUp({
     email,
     password,
     options:{captchaToken:captchaToken||undefined,emailRedirectTo:`${window.location.origin}/confirm-email?${query.toString()}`,data:{account_phone:signupPhone.trim()}}
    });

    if(result.error){
     setMessage(t('auth.signupFailed'));
     return;
    }
    if(result.data.user&&Array.isArray(result.data.user.identities)&&result.data.user.identities.length===0){
     setMode('login');
     setMessage(t('auth.existingAccount'));
     return;
    }

    // Só a conta criada nesta etapa recebe o tutorial de boas-vindas.
    // Usuários que já existiam e apenas fizerem login não verão a abertura automática.
    if(result.data.user?.identities?.length){
     try{localStorage.setItem(`fio-tour:new-account:${result.data.user.id}`,'pending');}catch{}
    }

    setMessage(t('auth.checkEmail'));
    return;
   }

   setRememberSession(remember);
   const result=await supabase.auth.signInWithPassword({email,password:submittedPassword,options:{captchaToken:captchaToken||undefined}});
   if(result.error){
    setMessage(t('auth.loginFailed'));
    return;
   }

   if(appointmentLink(params.get('next')))navigate(appointmentLink(params.get('next'))!,{replace:true});
   else if(audience==='platform')navigate('/platform',{replace:true});
   else if(audience==='owner')navigate('/owner',{replace:true});
   else if(audience==='staff')navigate('/barber',{replace:true});
   else if(audience==='client')navigate(shop?`/?shop=${encodeURIComponent(shop)}&audience=client`:'/client',{replace:true});
   else navigate('/',{replace:true});
  }catch{
   setMessage(t('auth.offline'));
  }finally{
   setBusy(false);
   setCaptchaToken('');setCaptchaAttempt(v=>v+1);
  }
 }

 const clientBrand=clientShopName||t('auth.clientBrandFallback');
 const heading=reset
  ?t('auth.headingReset')
  :mode==='signup'
   ?audience==='client'
    ?t('auth.headingClientSignup',{name:clientBrand})
    :(audience==='owner'||!audience)
     ?t('auth.headingOwnerSignup')
     :t('auth.headingSignup')
   :mode==='forgot'
    ?t('auth.headingForgot')
    :audience==='client'
     ?t('auth.headingClientLogin',{name:clientBrand})
     :(audience==='owner'||!audience)
      ?t('auth.headingOwnerLogin')
      :t('auth.headingLogin');

 const description=reset
  ?t('auth.descReset')
  :mode==='forgot'
   ?t('auth.descForgot')
   :audience==='client'
    ?t('auth.descClient',{name:clientBrand})
    :(audience==='owner'||!audience)
     ?t('auth.descOwner')
     :t('auth.descGeneric');

 if(reset&&!supabase){
  return <div className="auth-page">
   <Link className="auth-logo" to="/"><img src="/FIOlogo/FIObranco.png" alt="FIO"/></Link>
   <div className="auth-card">
    <p className="eyebrow">{t('auth.recoveryEyebrow')}</p>
    <h1>{t('auth.cannotOpen')}</h1>
    <p className="notice">{t('auth.unavailable')}</p>
   </div>
  </div>;
 }

 if(reset&&!resetReady&&!resetInvalid){
  return <div className="auth-page">
   <span className="auth-logo"><img src="/FIOlogo/FIObranco.png" alt="FIO"/></span>
   <div className="auth-card">
    <p className="eyebrow">{t('auth.recoveryEyebrow')}</p>
    <h1>{t('auth.validatingLink')}</h1>
    <p className="muted">{t('auth.justMoment')}</p>
   </div>
  </div>;
 }

 if(reset&&resetInvalid){
  return <div className="auth-page">
   <Link className="auth-logo" to={destination()}><img src="/FIOlogo/FIObranco.png" alt="FIO"/></Link>
   <div className="auth-card">
    <p className="eyebrow">{t('auth.recoveryEyebrow')}</p>
    <h1>{t('auth.linkInvalidTitle')}</h1>
    <p className="muted">{t('auth.linkInvalidDesc')}</p>
    <Link className="primary full" to={`/login?mode=forgot${audience?`&audience=${encodeURIComponent(audience)}`:''}${shop?`&shop=${encodeURIComponent(shop)}`:''}`}>{t('auth.requestNewLink')}</Link>
   </div>
   <p className="auth-footer">{t('auth.footer')}</p>
  </div>;
 }

 return <div className="auth-page auth-page--login">
  {shop?<ShopIdentity slug={shop}/>:<Link className="auth-logo" to="/"><img src="/FIOlogo/FIObranco.png" alt="FIO"/></Link>}

  <div className="auth-card auth-card--login">
   <p className="eyebrow">{reset?t('auth.recoveryEyebrow'):audience==='client'?t('auth.clientEyebrow'):(audience==='owner'||!audience)?(mode==='signup'?t('auth.createShopEyebrow'):t('auth.shopEyebrow')):t('auth.welcomeEyebrow')}</p>
   <h1>{heading}</h1>
   <p className="muted">{description}</p>

   <form onSubmit={submit}>
    {!reset&&<Field label={t('auth.email')}>
     <input
      type="email"
      autoComplete="email"
      value={email}
      onChange={e=>setEmail(e.target.value)}
      required
     />
    </Field>}

    {!reset&&mode==='signup'&&<Field label={t('auth.phone')}>
     <input
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder="(61) 99999-9999"
      minLength={8}
      maxLength={24}
      value={signupPhone}
      onChange={e=>setSignupPhone(e.target.value)}
      required
     />
     <small>{t('auth.onePhoneHint')}</small>
    </Field>}

    {(reset||mode!=='forgot')&&<Field label={reset?t('auth.newPassword'):t('auth.password')}>
      <div style={{position:'relative'}}>
       <input name="password" type={showPassword?'text':'password'} minLength={8}
        autoComplete={mode==='login'&&!reset?'current-password':'new-password'}
        value={password} onChange={e=>setPassword(e.target.value)}
        style={{paddingRight:48}} required />
       <button type="button" aria-label={showPassword?t('auth.hidePassword'):t('auth.showPassword')}
        title={showPassword?t('auth.hidePassword'):t('auth.showPassword')} onClick={()=>setShowPassword(v=>!v)}
        style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',display:'grid',placeItems:'center',width:32,height:32,padding:0,border:0,background:'transparent',color:'inherit',cursor:'pointer'}}>
        {showPassword?<EyeOff size={18}/>:<Eye size={18}/>}
       </button>
      </div>
     </Field>}

    {reset&&<Field label={t('auth.confirmNewPassword')}>
      <div style={{position:'relative'}}>
       <input name="confirmPassword" type={showConfirmPassword?'text':'password'} minLength={8}
        autoComplete="new-password" value={confirmPassword}
        onChange={e=>setConfirmPassword(e.target.value)}
        style={{paddingRight:48}} required />
       <button type="button" aria-label={showConfirmPassword?t('auth.hidePasswordConfirm'):t('auth.showPasswordConfirm')}
        title={showConfirmPassword?t('auth.hidePassword'):t('auth.showPassword')} onClick={()=>setShowConfirmPassword(v=>!v)}
        style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',display:'grid',placeItems:'center',width:32,height:32,padding:0,border:0,background:'transparent',color:'inherit',cursor:'pointer'}}>
        {showConfirmPassword?<EyeOff size={18}/>:<Eye size={18}/>}
       </button>
      </div>
     </Field>}

    {!reset&&mode==='login'&&<label className="remember-session"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/><span>{t('auth.remember')}</span></label>}

    {needsCaptcha&&<AuthCaptcha onToken={setCaptchaToken} attempt={captchaAttempt}/>}
    {message&&<p role="status" className="notice">{message}</p>}

    <button className="primary full" disabled={busy||(needsCaptcha&&!captchaToken)}>
     {busy
      ?t('auth.wait')
      :reset
       ?t('auth.saveNewPassword')
       :mode==='signup'
        ?t('auth.signUp')
        :mode==='forgot'
         ?t('auth.sendRecovery')
         :t('auth.signIn')}
    </button>
   </form>

   {!reset&&<div className="auth-options">
    {mode==='forgot'
     ?<button type="button" className="text-button" onClick={()=>{setMode('login');setMessage('');}}>{t('auth.backSignIn')}</button>
     :<>
       <button type="button" className="text-button" onClick={()=>{setMode(mode==='signup'?'login':'signup');setMessage('');}}>
        {mode==='signup'?t('auth.alreadyHave'):audience==='client'?t('auth.createClientAt',{name:clientBrand}):(audience==='owner'||!audience)?t('auth.createMyShop'):t('auth.createOne')}
       </button>
       <button type="button" className="text-button" onClick={()=>{setMode('forgot');setMessage('');}}>{t('auth.forgotPassword')}</button>
      </>}
   </div>}
   {!reset&&mode!=='forgot'&&<>
    <div className="auth-divider" style={{display:'flex',alignItems:'center',gap:16,margin:'22px 0',color:'#888',fontSize:13}}><span style={{flex:1,height:1,background:'currentColor',opacity:.3}}/><span>{t('auth.or')}</span><span style={{flex:1,height:1,background:'currentColor',opacity:.3}}/></div>
    <button type="button" className="oauth-button" disabled={busy} onClick={()=>void signInWithGoogle()}>
     <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false" style={{flexShrink:0}}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.87 46.98 24.55Z"/>
      <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/>
     </svg>
     {t('auth.continueWithGoogle')}
    </button>
   </>}


  </div>

  <p className="auth-footer">{t('auth.footer')}</p>
 </div>;
}

function ClientJoinOnboarding({onDone,slug}:{onDone:()=>void;slug:string}) {
 const {t}=useI18n();
 const [displayName,setDisplayName]=useState(''),[phone,setPhone]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{
  if(!supabase)return;
  let active=true;
  void supabase.auth.getUser().then(({data:{user}})=>{
   if(!active||!user)return;
   const meta=user.user_metadata as Record<string,unknown>;
   const metaName=[meta?.display_name,meta?.full_name,meta?.name].find(v=>typeof v==='string'&&v.trim().length>=2);
   const accountPhone=typeof meta?.account_phone==='string'?meta.account_phone.trim():'';
   if(metaName)setDisplayName(current=>current||String(metaName).trim());
   if(accountPhone)setPhone(current=>current||accountPhone);
  });
  return()=>{active=false;};
 },[]);
 async function submit(e:FormEvent){
  e.preventDefault();setBusy(true);setError('');
  try{
   const r=await api<{barbershopId:string}>('/onboarding',undefined,{mode:'join',slug,displayName:displayName.trim(),phone:phone.trim()});
   sessionStorage.setItem('fio-shop',r.barbershopId);
   if(phone.trim())await api('/profile/contact',r.barbershopId,{displayName:displayName.trim(),phone:phone.trim()},'PATCH');
   onDone();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="auth-page">
  <ShopIdentity slug={slug}/>
  <div className="auth-card">
   <p className="eyebrow">{t('auth.profileEyebrow')}</p><h1>{t('auth.profileQuestion')}</h1><p className="muted">{t('auth.profileDesc')}</p>
   <form onSubmit={submit}>
    <Field label={t('auth.yourName')}><input minLength={2} maxLength={100} autoComplete="name" required value={displayName} onChange={e=>setDisplayName(e.target.value)}/></Field>
    <Field label={t('auth.phone')}><input type="tel" inputMode="tel" autoComplete="tel" placeholder="(61) 99999-9999" minLength={8} maxLength={24} value={phone} onChange={e=>setPhone(e.target.value)} required/><small>{t('auth.phoneIdentityHint')}</small></Field>
    {error&&<p className="notice" role="alert">{error}</p>}
    <button className="primary full" disabled={busy}>{busy?t('auth.entering'):t('auth.enterShop')}</button>
   </form>
   <button type="button" className="text-button" onClick={()=>supabase?.auth.signOut()}>{t('auth.useAnother')}</button>
  </div>
  <p className="auth-footer">{t('auth.footer')}</p>
 </div>;
}

function LegacyOnboarding({onDone}:{onDone:()=>void}) {
 const {t}=useI18n();
 const params=new URLSearchParams(window.location.search),token=params.get('invite'),presetShop=params.get('shop')??'';
 const [mode,setMode]=useState<'create'|'join'|'invite'>(token?'invite':presetShop?'join':'create');
 const [name,setName]=useState(''),[slug,setSlug]=useState(presetShop),[displayName,setDisplayName]=useState(''),[phone,setPhone]=useState(''),[invite,setInvite]=useState(token??''),[error,setError]=useState(''),[busy,setBusy]=useState(false);

 async function submit(e:FormEvent){
  e.preventDefault();
  setBusy(true);
  setError('');
  try{
   const r=await api<{barbershopId:string}>('/onboarding',undefined,{mode,displayName,phone:phone.trim(),...(mode==='create'?{name,slug}:mode==='join'?{slug}:{token:invite})});
   sessionStorage.setItem('fio-shop',r.barbershopId);
   if(phone.trim())await api('/profile/contact',r.barbershopId,{displayName:displayName.trim(),phone:phone.trim()},'PATCH');
   onDone();
  }catch(e){
   setError((e as Error).message);
  }finally{
   setBusy(false);
  }
 }

 return <div className="auth-page">
  <span className="auth-logo"><img src="/FIOlogo/FIObranco.png" alt="FIO"/></span>
  <div className="auth-card">
   <p className="eyebrow">{t('auth.spaceEyebrow')}</p>
   <h1>{t('auth.connectPoints')}</h1>

   <div className="segmented">
    {([['create',t('auth.iAmOwner')],['join',t('auth.iAmClient')],['invite',t('auth.haveInvite')]] as const).map(([v,t])=>
     <button type="button" className={mode===v?'selected':''} key={v} onClick={()=>setMode(v)}>{t}</button>
    )}
   </div>

   <form onSubmit={submit}>
    <Field label={t('auth.yourName')}><input minLength={2} maxLength={100} required value={displayName} onChange={e=>setDisplayName(e.target.value)}/></Field>
    <Field label={t('auth.phone')}><input type="tel" inputMode="tel" placeholder="(61) 99999-9999" minLength={8} maxLength={24} value={phone} onChange={e=>setPhone(e.target.value)} required/><small>{t('auth.onePhoneHint')}</small></Field>
    {mode==='create'&&<Field label={t('auth.shopName')}><input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></Field>}
    {mode!=='invite'
     ?<Field label={t('auth.shopSlug')}><input required pattern="[a-z0-9-]{3,60}" placeholder="ex.: studio-011" value={slug} onChange={e=>setSlug(e.target.value.toLowerCase())}/></Field>
     :<Field label={t('auth.inviteCode')}><input required value={invite} onChange={e=>setInvite(e.target.value)}/></Field>}
    {error&&<p className="notice" role="alert">{error}</p>}
    <button className="primary full" disabled={busy}>{busy?t('auth.connecting'):t('common.continue')}</button>
   </form>

   <button className="text-button" onClick={()=>supabase?.auth.signOut()}>{t('auth.signOut')}</button>
  </div>
 </div>;
}


export function EmailConfirmationPage(){
 const {t}=useI18n();
 const location=useLocation(),navigate=useNavigate();
 const params=new URLSearchParams(location.search);
 const shop=clientContext(location.pathname,location.search);
 const audience=params.get('audience')||(shop?'client':'owner');
 const email=params.get('email')??'';
 const [state,setState]=useState<'checking'|'confirmed'|'invalid'>('checking');

 useEffect(()=>{
  if(!supabase){setState('invalid');return;}
  const authClient=supabase;
  let active=true;
  const finish=(ok:boolean)=>{if(active)setState(ok?'confirmed':'invalid');};
  const check=async()=>{
   const {data:{session}}=await authClient.auth.getSession();
   if(session){finish(true);return;}
   window.setTimeout(async()=>{
    const {data:{session:late}}=await authClient.auth.getSession();
    finish(Boolean(late));
   },1200);
  };
  void check();
  const {data:{subscription}}=authClient.auth.onAuthStateChange((_event,session)=>{if(session)finish(true);});
  return()=>{active=false;subscription.unsubscribe();};
 },[]);

 const back=async()=>{
  if(supabase)await supabase.auth.signOut({scope:'local'});
  const q=new URLSearchParams({audience});
  if(shop)q.set('shop',shop);
  if(email)q.set('email',email);
  navigate(`/login?${q.toString()}`,{replace:true});
 };

 return <div className="auth-page email-confirm-page">
  <span className="auth-logo"><img src="/FIOlogo/FIObranco.png" alt="FIO"/></span>
  <div className="auth-card email-confirm-card">
   {state==='checking'?<>
    <span className="email-confirm-icon is-loading"><LoaderCircle size={28}/></span>
    <p className="eyebrow">{t('auth.confirmingEmail')}</p>
    <h1>{t('auth.justMoment')}</h1>
    <p className="muted">{t('auth.finishingAccess')}</p>
   </>:state==='confirmed'?<>
    <span className="email-confirm-icon"><CheckCircle2 size={30}/></span>
    <p className="eyebrow">{t('auth.emailConfirmed')}</p>
    <h1>{t('auth.accessReady')}</h1>
    <p className="muted">{t('auth.accessReadyDesc')}</p>
    <button className="primary full" onClick={()=>void back()}>{t('auth.backSignIn')}</button>
   </>:<>
    <p className="eyebrow">{t('auth.emailConfirmation')}</p>
    <h1>{t('auth.confirmFailed')}</h1>
    <p className="muted">{t('auth.confirmFailedDesc')}</p>
    <button className="primary full" onClick={()=>void back()}>{t('auth.backSignIn')}</button>
   </>}
  </div>
  <p className="auth-footer">{t('auth.footer')}</p>
 </div>;
}

export function Onboarding({onDone,shopId}:{onDone:()=>void;shopId?:string}) {
 const {t}=useI18n();
 const params=new URLSearchParams(window.location.search),shop=clientContext(window.location.pathname,window.location.search),audience=params.get('audience');
 if(shop)return <ClientJoinOnboarding onDone={onDone} slug={shop}/>;
 if(audience==='client'||window.location.pathname.startsWith('/client'))return <div className="auth-page"><div className="auth-card"><h1>{t('auth.clientLinkTitle')}</h1><p>{t('auth.clientLinkDesc')}</p><button className="secondary" onClick={()=>void supabase?.auth.signOut()}>{t('auth.signOut')}</button></div></div>;
 return <OwnerOnboarding onDone={onDone} shopId={shopId}/>;
}

