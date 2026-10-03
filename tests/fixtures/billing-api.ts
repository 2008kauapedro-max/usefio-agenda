// Test-only alias: no real authentication, provider or database requests.
import type {BillingState} from '../../shared/billing-state';
export class RequestError extends Error{constructor(public code:string,message:string){super(message);}}
let state:BillingState|null=null;
const scenario=new URLSearchParams(location.search).get('scenario');
if(scenario==='pending'||scenario==='expired')state={provider:'syncpay',providerStatus:'pending_first_payment',plan:'PRO',cycle:'monthly',amountCents:11990,nextChargeAt:null,payment:{pixCode:'PIX-SINTETICO-NAO-PAGAR',qrCode:null,identifier:'test-only',expiresAt:new Date(Date.now()+(scenario==='expired'?-1:1)*86400000).toISOString()}};
export async function api<T>(path:string,_shop?:string,body?:unknown):Promise<T>{
 if(path==='/saas/billing'){
  if(scenario==='error')throw new RequestError('SYNCPAY_AUTH_ERROR','never expose this');
  return {configured:true,subscription:state} as T;
 }
 if(path==='/saas/subscribe'){
  const input=body as {plan:'PRO'|'PREMIUM';cycle:'weekly'|'monthly'|'annual'};
  state={provider:'syncpay',providerStatus:'pending_first_payment',plan:input.plan,cycle:input.cycle,amountCents:11990,nextChargeAt:null,payment:{pixCode:'PIX-SINTETICO-NAO-PAGAR',qrCode:null,identifier:'test-only',expiresAt:new Date(Date.now()+86400000).toISOString()}};
  return state as T;
 }
 if(path==='/saas/trial')return {ok:true} as T;
 throw new Error(`Unexpected fixture request: ${path}`);
}

export const supabase=null;
