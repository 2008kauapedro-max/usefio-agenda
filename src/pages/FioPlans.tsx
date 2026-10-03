import { useEffect,useMemo,useState } from 'react';
import { ArrowRight,Check,Copy,Crown,Gift,Info,RefreshCw,ShieldCheck,WalletCards } from 'lucide-react';
import { FIO_PLAN_CATALOG,SALE_BILLING_CYCLES,type BillingCycle } from '../../shared/fio-plans';
import { api,RequestError } from '../lib/api';
import { QRCodeSVG } from 'qrcode.react';
import { billingLocksNewSubscription,usablePix,type BillingState,type PaidPlan } from '../../shared/billing-state';
import type { WorkspaceProps } from './Workspace';
import { Modal,PageTitle } from '../components/ui';
import { useI18n } from '../i18n';

export function FioPlans(p:WorkspaceProps){
 const {t,formatCurrency,formatDate}=useI18n();
 const date=(value?:string|null)=>value?formatDate(value,{day:'2-digit',month:'short',year:'numeric'}):'';
 const amount=(cents:number)=>formatCurrency(cents/100,'BRL');
 const cycleLabel=(value:BillingCycle)=>t(`fp.cycle.${value}`);
 const cycleSuffix=(value:BillingCycle)=>t(`fp.suffix.${value}`);
 const providerStatus=(value:string)=>t(`fp.billingStatus.${['pending_first_payment','active','overdue','suspended','cancelled'].includes(value)?value:'default'}`);
 const checkoutMessage=(_error:unknown)=>t('fp.billingError');
 const [changePlan,setChangePlan]=useState<PaidPlan|null>(null),[changeAccepted,setChangeAccepted]=useState(false);
 const [cycle,setCycle]=useState<BillingCycle>('monthly');
 const [busy,setBusy]=useState(false);
 const [choiceOpen,setChoiceOpen]=useState(false);
 const [checkoutPlan,setCheckoutPlan]=useState<PaidPlan|null>(null);
 const [document,setDocument]=useState('');
 const [acceptedTerms,setAcceptedTerms]=useState(false);
 const [billing,setBilling]=useState<BillingState|null>(null);
 const [billingLoaded,setBillingLoaded]=useState(false);
 const [billingConfigured,setBillingConfigured]=useState(false);
 const [checkoutError,setCheckoutError]=useState('');
 const [checkoutCode,setCheckoutCode]=useState('');
 const sub=p.data.fioSubscription;
 const trialUsed=Boolean(sub.trial_ends_at);
 const trialActive=sub.status==='trialing'&&Boolean(sub.trial_ends_at)&&new Date(sub.trial_ends_at!)>new Date();
 const activeDefinition=useMemo(()=>FIO_PLAN_CATALOG.find(x=>x.code===p.data.plan)??FIO_PLAN_CATALOG[0],[p.data.plan]);
  const billingLocked=billingLocksNewSubscription(billing);
 useEffect(()=>{
  let active=true;
  void api<{configured:boolean;subscription:BillingState|null}>('/saas/billing',p.data.shop.id).then(result=>{
   if(!active)return;
   setBilling(result.subscription);setBillingConfigured(result.configured);setBillingLoaded(true);
  }).catch(error=>{if(active)setCheckoutError(checkoutMessage(error));});
  return()=>{active=false;};
 },[p.data.shop.id]);

 async function startTrial(){
  setBusy(true);setCheckoutError('');setCheckoutCode('');
  try{
   await api('/saas/trial',p.data.shop.id,{confirmed:true});
   await p.refresh();setChoiceOpen(false);
   p.notify(t('fp.trialStarted'));
  }catch{p.notify(t('fp.trialFailed'));}
  finally{setBusy(false);}
 }
 function selectPaid(code:PaidPlan){
  if(!billingLoaded||!billingConfigured||billingLocked){setCheckoutError(t('fp.currentChargeFirst'));return;}
  setChoiceOpen(false);setCheckoutPlan(code);setDocument('');setAcceptedTerms(false);setBilling(null);setCheckoutError('');setCheckoutCode('');
 }
 function closeCheckout(){if(busy)return;setCheckoutPlan(null);setCheckoutError('');setCheckoutCode('');}
 async function subscribe(){
  if(!checkoutPlan||!acceptedTerms||busy||billingLocked)return;
  setBusy(true);setCheckoutError('');
  try{
   const result=await api<BillingState>('/saas/subscribe',p.data.shop.id,{plan:checkoutPlan,cycle,document,acceptedTerms:true});
   setBilling(result);
   if(result.providerStatus==='active'||result.providerStatus==='overdue')await p.refresh();
   p.notify(result.providerStatus==='active'?t('fp.subscriptionConfirmed'):t('fp.chargeCreated'));
  }catch(error){setCheckoutError(checkoutMessage(error));setCheckoutCode(error instanceof RequestError?error.code:'');}
  finally{setBusy(false);}
 }
 async function recoverEnrollment(){
  if(busy)return;setBusy(true);setCheckoutError('');setCheckoutCode('');
  try{
   const result=await api<{configured:boolean;subscription:BillingState|null;cleared:boolean}>('/saas/recover-enrollment',p.data.shop.id,{confirmed:true});
   if(result.subscription){setBilling(result.subscription);setCheckoutPlan(result.subscription.plan);p.notify(t('fp.recovered'));}
   else{setBilling(null);p.notify(t('fp.previousCleared'));}
  }catch(error){setCheckoutError(checkoutMessage(error));setCheckoutCode(error instanceof RequestError?error.code:'');}
  finally{setBusy(false);}
 }
 async function refreshBilling(){
  setBusy(true);setCheckoutError('');
  try{
   const result=await api<{configured:boolean;subscription:BillingState|null}>('/saas/billing',p.data.shop.id);
   setBilling(result.subscription);setBillingConfigured(result.configured);setBillingLoaded(true);
   await p.refresh();
   if(result.subscription?.change)p.notify(t('fp.changeOngoing'));
   else if(result.subscription?.providerStatus==='active')p.notify(t('fp.paymentConfirmed'));
   else if(result.subscription?.providerStatus==='overdue')p.notify(t('fp.paymentPending'));
   else if(result.subscription)p.notify(providerStatus(result.subscription.providerStatus));
   else p.notify(result.configured?t('fp.noCharge'):t('fp.billingSupport'));
  }catch(error){setCheckoutError(checkoutMessage(error));}
  finally{setBusy(false);}
 }
 async function manageCharge(action:'cancel_pending'|'resend'|'cancel_active'){
  const question=action==='cancel_pending'?t('fp.confirmCancelPending'):action==='cancel_active'?t('fp.confirmCancelActive'):t('fp.confirmNewPix');
  if(!window.confirm(question))return;setBusy(true);setCheckoutError('');
  try{
   const result=await api<{subscription:BillingState|null}>('/saas/charge',p.data.shop.id,{action,confirmed:true});
   if(action==='cancel_pending'){setBilling(null);setCheckoutPlan(null);p.notify(t('fp.pendingCancelled'));}
   else if(action==='cancel_active'){setBilling(result.subscription);await p.refresh();p.notify(t('fp.subscriptionCancelled'));}
   else{setBilling(result.subscription);p.notify(t('fp.newPixReady'));}
  }catch(e){setCheckoutError(checkoutMessage(e));}finally{setBusy(false);}
 }
 async function requestRefund(){
  if(!billing?.refund?.eligible||busy)return;
  const deadline=billing.refund.deadline?date(billing.refund.deadline):t('fp.sevenDays');
  if(!window.confirm(t('fp.confirmRefund',{deadline})))return;
  setBusy(true);setCheckoutError('');
  try{
   const result=await api<{subscription:BillingState|null;refund:{code:string;status:string;requestedAt:string};cancellation:'cancelled'|'needs_attention'|'already_requested'}>('/saas/refund',p.data.shop.id,{confirmed:true});
   setBilling(result.subscription);await p.refresh();
   if(result.cancellation==='needs_attention')p.notify(t('fp.refundSupport'));
   else p.notify(t('fp.refundSent'));
  }catch(e){setCheckoutError(checkoutMessage(e));}finally{setBusy(false);}
 }
 async function confirmChange(){
  if(!changePlan||!changeAccepted||busy)return;setBusy(true);setCheckoutError('');
  try{const result=await api<{subscription:BillingState}>('/saas/change-plan',p.data.shop.id,{plan:changePlan,cycle,confirmed:true});setBilling(result.subscription);setChangePlan(null);setCheckoutPlan(result.subscription.plan);await p.refresh();p.notify(t('fp.changeRequested'));}catch(e){setCheckoutError(checkoutMessage(e));}finally{setBusy(false);}
 }
 async function copyPix(){
  if(!usablePix(billing)||!billing?.payment?.pixCode){p.notify(t('fp.pixUnavailable'));return;}
  try{if(!navigator.clipboard)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(billing.payment.pixCode);p.notify(t('fp.pixCopied'));}
  catch{p.notify(t('fp.pixCopyFailed'));}
 }

 return <>{p.data.aiLimits&&<p className="notice">{t('fp.aiLimit',{daily:p.data.aiLimits.ai_daily_limit,minute:p.data.aiLimits.ai_per_minute})}</p>}
  <PageTitle eyebrow={t('fp.eyebrow')} title={t('fp.title')} description={t('fp.desc')}/>

  <section className="fio-plan-current">
   <div className="fio-plan-current-icon"><Crown size={21}/></div>
   <div className="fio-plan-current-copy"><span>{t('fp.current')}</span><strong>{activeDefinition.name}</strong><small>{trialActive?t('fp.trialUntil',{date:date(sub.trial_ends_at)}):sub.current_period_end?t('fp.currentUntil',{date:date(sub.current_period_end)}):t('fp.noExpiry')}</small></div>
   <span className={`fio-billing-status ${trialActive?'is-trial':''}`}>{trialActive?t('fp.status.trial'):sub.status==='past_due'?t('fp.status.pending'):p.data.plan==='FREE'?t('fp.status.free'):sub.status==='cancelled'||sub.status==='inactive'?t('fp.status.inactive'):t('fp.status.active')}</span>
  </section>

  {(billing&&billing.providerStatus!=='cancelled'||!billingLoaded||!billingConfigured)&&<section className="fio-billing-resume" aria-label={t('fp.billingAria')}>
   <div><strong>{billing?providerStatus(billing.providerStatus):billingLoaded?(billingConfigured?t('fp.noneStarted'):t('fp.unavailable')):checkoutError?t('fp.queryFailed'):t('fp.checking')}</strong>
   <p className="muted">{billing?.providerStatus==='pending_first_payment'?t('fp.pendingPayment',{plan:billing.plan,cycle:cycleLabel(billing.cycle),amount:amount(billing.amountCents)}):billing?t('fp.currentCharge',{plan:billing.plan,cycle:cycleLabel(billing.cycle),amount:amount(billing.amountCents)}):t('fp.checkBeforeNew')}</p></div>
   <div className="page-actions">{billing&&<button className="primary" disabled={busy} onClick={()=>{setCheckoutPlan(billing.plan);setCheckoutError('');}}>{t('fp.details')}</button>}{billing?.providerStatus==='pending_first_payment'&&!billing.change&&<button className="danger" disabled={busy} onClick={()=>void manageCharge('cancel_pending')}>{t('fp.cancelEnrollment')}</button>}<button className="secondary" disabled={busy} onClick={()=>void refreshBilling()}><RefreshCw size={16}/>{busy?t('fp.querying'):t('fp.refreshStatus')}</button></div>
  </section>}
  {billing?.change&&<p className="notice">{t('fp.changePending',{plan:billing.change.plan,cycle:cycleLabel(billing.change.cycle)})}</p>}
  {checkoutError&&!checkoutPlan&&!changePlan&&<p className="fio-checkout-error" role="alert">{checkoutError}</p>}

  <section className="fio-cycle-section">
   <div className="fio-cycle-heading"><div><span className="eyebrow">{t('fp.billingPeriod')}</span><h2>{t('fp.howPay')}</h2></div><small>{t('fp.reviewBefore')}</small></div>
   <div className="fio-cycle-picker" role="tablist" aria-label={t('fp.subscriptionPeriod')}>
    {SALE_BILLING_CYCLES.map(key=><button key={key} type="button" role="tab" aria-selected={cycle===key} className={cycle===key?'active':''} onClick={()=>setCycle(key)}><span className="fio-cycle-check">{cycle===key?<Check size={15}/>:null}</span><span><b>{cycleLabel(key)}</b><small>{t(`fp.cycle.${key}Hint`)}</small></span></button>)}
   </div>
  </section>

  <div className="fio-pricing-grid fio-pricing-compact">
   {FIO_PLAN_CATALOG.map(plan=>{
    const price=plan.prices[cycle],current=p.data.plan===plan.code,unavailable=price===null;
    const annualSaving=plan.code!=='FREE'&&cycle==='annual'&&plan.prices.monthly!=null&&price!=null?plan.prices.monthly*12-price:0;
    const monthlyEquivalent=cycle==='annual'&&price?Math.round(price/12):null;
    return <article key={plan.code} data-plan={plan.code} className={`fio-price-card ${plan.recommended?'recommended':''} ${current?'current':''}`}>
     <div className="fio-price-card-accent"/>
     <div className="fio-price-card-top"><div><span className="eyebrow">{t(`fp.plan.${plan.code}.eyebrow`)}</span><h2>{plan.name}</h2><p>{t(`fp.plan.${plan.code}.desc`)}</p></div></div>
     <div className="fio-price"><span>{unavailable?'—':price===0?amount(0):amount(price)}</span>{!unavailable&&<small>{price===0?t('fp.freeCost'):cycleSuffix(cycle)}</small>}</div>
     {monthlyEquivalent!==null&&<small className="fio-price-equivalent">{t('fp.monthEquivalent',{amount:amount(monthlyEquivalent)})}</small>}
     {annualSaving>0&&<div className="fio-saving">{t('fp.yearSaving',{amount:amount(annualSaving)})}</div>}
     {plan.code==='PRO'&&!trialUsed&&<div className="fio-trial-note"><Gift size={15}/><span>{t('fp.trial14')}</span></div>}
     <div className="fio-plan-highlights">{plan.highlights.slice(0,2).map((_,index)=><div key={index}><span className="fio-highlight-check"><Check size={14}/></span><span>{t(`fp.plan.${plan.code}.h${index+1}`)}</span></div>)}</div>
     <details className="fio-plan-details"><summary>{t('fp.allFeatures')}</summary><div className="fio-plan-groups">{plan.groups.map((group,groupIndex)=><section key={group.title}><h3>{t(`fp.plan.${plan.code}.g${groupIndex}`)}</h3><ul>{group.items.map((_,itemIndex)=><li key={itemIndex}><Check size={14}/><span>{t(`fp.plan.${plan.code}.g${groupIndex}i${itemIndex}`)}</span></li>)}</ul></section>)}</div></details>
     <div className="fio-card-action">{plan.proposal?<><small className="fio-proposal-note">{t('fp.proposal')}</small><button className="secondary full" disabled>{t('fp.soon')}</button></>:plan.code==='FREE'||unavailable?<button className="secondary full" disabled>{current?t('fp.currentPlan'):t('fp.freePlan')}</button>:billing?.providerStatus==='active'&&!billing.change?(billing.plan===plan.code&&billing.cycle===cycle?<button className="secondary full" disabled>{t('fp.currentPlan')}</button>:<button className="primary full" disabled={busy} onClick={()=>{setChangePlan(plan.code as PaidPlan);setChangeAccepted(false);setCheckoutError('');}}>{t('fp.switchTo',{plan:plan.code})}<ArrowRight size={17}/></button>):billingLocked?<button className="secondary full" disabled={busy} onClick={()=>{if(billing)setCheckoutPlan(billing.plan);}}>{t('fp.viewSubscription')}</button>:plan.code==='PRO'&&!trialUsed&&p.data.plan==='FREE'?<button className="primary full" disabled={busy||!billingLoaded||!billingConfigured} onClick={()=>setChoiceOpen(true)}>{t('fp.startPro')}<ArrowRight size={17}/></button>:<button className="primary full" disabled={busy||!billingLoaded||!billingConfigured} onClick={()=>selectPaid(plan.code as PaidPlan)}>{t('fp.subscribePlan',{plan:plan.code})}<ArrowRight size={17}/></button>}</div>
    </article>;
   })}
  </div>

  <section className="fio-plan-explainer"><Info size={18}/><div><strong>{t('fp.pixTitle')}</strong><p>{t('fp.pixDesc')}</p></div></section>

  {choiceOpen&&<Modal title={t('fp.startModal')} onClose={()=>{if(!busy)setChoiceOpen(false);}}><div className="fio-start-options"><p className="muted">{t('fp.startDesc')}</p><button className="fio-start-option" disabled={busy} onClick={()=>void startTrial()}><span className="fio-start-icon"><Gift size={21}/></span><div><strong>{t('fp.try14')}</strong><p>{t('fp.try14Desc')}</p></div><ArrowRight size={18}/></button><button className="fio-start-option" disabled={busy} onClick={()=>selectPaid('PRO')}><span className="fio-start-icon"><WalletCards size={21}/></span><div><strong>{t('fp.subscribeNow')}</strong><p>{t('fp.subscribeNowDesc',{cycle:cycleLabel(cycle).toLowerCase()})}</p></div><ArrowRight size={18}/></button>{busy&&<p className="muted fio-start-wait">{t('fp.activatingTrial')}</p>}</div></Modal>}

  {changePlan&&<Modal title={t('fp.changeModal')} onClose={()=>{if(!busy)setChangePlan(null);}}><div className="fio-checkout-placeholder"><h3>FIO {changePlan} · {cycleLabel(cycle)}</h3><p>{t('fp.newValue',{amount:amount(FIO_PLAN_CATALOG.find(x=>x.code===changePlan)!.prices[cycle]!)})}</p><p>{t('fp.changeDesc')}</p><label className="fio-terms"><input type="checkbox" checked={changeAccepted} onChange={e=>setChangeAccepted(e.target.checked)}/>{t('fp.changeConsent')}</label>{checkoutError&&<p role="alert" className="fio-checkout-error">{checkoutError}</p>}<button className="primary full" disabled={busy||!changeAccepted} onClick={()=>void confirmChange()}>{busy?t('fp.requesting'):t('fp.confirmChange')}</button><button disabled={busy} className="secondary full" onClick={()=>setChangePlan(null)}>{t('common.back')}</button></div></Modal>}
  {checkoutPlan&&<Modal title={billing?t('fp.subscriptionTitle',{plan:billing.plan}):t('fp.subscribeTitle',{plan:checkoutPlan})} onClose={closeCheckout}><div className="fio-checkout-placeholder">
   <Crown size={28}/>
   {!billing?<>
    <h3>{t('fp.reviewFinish')}</h3>
    <p className="muted">{t('fp.subscriptionDesc',{cycle:cycleLabel(cycle).toLowerCase()})}</p>
    <div className="fio-checkout-summary"><div><span>{t('fp.plan')}</span><strong>FIO {checkoutPlan}</strong></div><div><span>{t('fp.period')}</span><strong>{cycleLabel(cycle)}</strong></div><div><span>{t('fp.value')}</span><strong>{amount(FIO_PLAN_CATALOG.find(x=>x.code===checkoutPlan)!.prices[cycle]!)}</strong></div></div>
    <label className="field fio-document-field"><span>{t('fp.document')}</span><input value={document} inputMode="numeric" autoComplete="off" placeholder={t('fp.documentPlaceholder')} maxLength={24} onChange={e=>setDocument(e.target.value)}/><small>{t('fp.documentHelp')}</small></label>
    <div className="fio-plan-explainer"><ShieldCheck size={18}/><div><strong>{t('fp.cancelRefund')}</strong><p>{t('fp.cancelRefundDesc')}</p></div></div>
    <label className="fio-terms"><input type="checkbox" checked={acceptedTerms} onChange={e=>setAcceptedTerms(e.target.checked)}/><span>{t('fp.termsConsent')}</span></label>
    {checkoutError&&<div className="fio-checkout-error">{checkoutError}</div>}
    {['SYNCPAY_ENROLLMENT_IN_PROGRESS','SYNCPAY_ENROLLMENT_UNCERTAIN'].includes(checkoutCode)&&<button className="secondary full" disabled={busy} onClick={()=>void recoverEnrollment()}><RefreshCw size={16}/>{t('fp.checkPrevious')}</button>}
    <button className="primary full" disabled={busy||!acceptedTerms||document.replace(/\D/g,'').length<11} onClick={()=>void subscribe()}>{busy?t('fp.preparingPix'):t('fp.generatePix')}<ArrowRight size={17}/></button>
    <button className="secondary full" disabled={busy} onClick={closeCheckout}>{t('common.cancel')}</button>
   </>:<>
    <div className={`fio-payment-state ${billing.providerStatus==='active'?'is-success':''}`}><span>{billing.providerStatus==='active'?<Check size={20}/>:<WalletCards size={20}/>}</span><div><h3>{billing.change?t('fp.changeInProgress'):providerStatus(billing.providerStatus)}</h3><p>{billing.change?t('fp.changeStateDesc'):billing.providerStatus==='active'?t('fp.paymentConfirmedDesc'):usablePix(billing)?t('fp.payPixDesc'):t('fp.noValidPix')}</p></div></div>
    <div className="settings-readonly"><span>{t('fp.subscription')}</span><strong>FIO {billing.plan} · {cycleLabel(billing.cycle)}</strong><small>{billing.change?.amountCents!=null?t('fp.difference',{amount:amount(billing.change.amountCents)}):amount(billing.amountCents)}{billing.payment?.expiresAt?` · ${t('fp.validUntil',{date:date(billing.payment.expiresAt)})}`:''}</small></div>
    {usablePix(billing)&&<div className="fio-pix-box"><strong>{t('fp.pixPayment')}</strong><p>{t('fp.scanPix')}</p><div className="fio-pix-qr"><QRCodeSVG value={billing.payment!.pixCode!} size={208} level="M" includeMargin aria-label={t('fp.pixQrAria')}/></div><label htmlFor="fio-pix-code">{t('fp.pixCopyPaste')}</label><textarea id="fio-pix-code" aria-label={t('fp.pixCodeAria')} readOnly value={billing.payment!.pixCode!} rows={3}/><button className="secondary full" onClick={()=>void copyPix()}><Copy size={16}/>{t('fp.copyPix')}</button><p className="fio-pix-recipient-note">{t('fp.recipientNote')}</p></div>}
    {checkoutError&&<div className="fio-checkout-error">{checkoutError}</div>}
    {(billing.providerStatus!=='active'||billing.change)&&<button className="primary full" disabled={busy} onClick={()=>void refreshBilling()}><RefreshCw size={16}/>{busy?t('fp.updating'):t('fp.paidRefresh')}</button>}
    {['pending_first_payment','overdue'].includes(billing.providerStatus)&&!billing.change&&!usablePix(billing)&&<button className="secondary full" disabled={busy} onClick={()=>void manageCharge('resend')}>{t('fp.newPix')}</button>}
    {billing.providerStatus==='pending_first_payment'&&!billing.change&&<button className="secondary full" disabled={busy} onClick={()=>void manageCharge('cancel_pending')}>{t('fp.cancelPending')}</button>}
    {billing.providerStatus==='active'&&!billing.change&&billing.refund?.eligible&&<button className="danger full" disabled={busy} onClick={()=>void requestRefund()}>{t('fp.cancelRefundButton')}</button>}
    {['active','overdue','suspended'].includes(billing.providerStatus)&&!billing.change&&!billing.refund?.eligible&&<button className="secondary full" disabled={busy} onClick={()=>void manageCharge('cancel_active')}>{t('fp.cancelSubscription')}</button>}
    {billing.providerStatus==='active'&&!billing.change&&<p className="muted">{billing.refund?.eligible?t('fp.refundWindow',{deadline:billing.refund.deadline?t('fp.refundDeadline',{date:date(billing.refund.deadline)}):''}):t('fp.noAutoRefund')}</p>}
    <p className="muted">{t('fp.securityPay')}</p>
    <button className="secondary full" disabled={busy} onClick={closeCheckout}>{billing.providerStatus==='active'?t('fp.finish'):t('fp.closePayLater')}</button>
   </>}
  </div></Modal>}
 </>;
}

