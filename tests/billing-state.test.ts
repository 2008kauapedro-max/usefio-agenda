import {describe,it,expect} from 'vitest';
import {billingErrorMessage,billingLocksNewSubscription,billingStatusLabel,usablePix,type BillingState} from '../shared/billing-state';
const billing:BillingState={provider:'syncpay',providerStatus:'pending_first_payment',plan:'PRO',cycle:'monthly',amountCents:11990,nextChargeAt:null,payment:{pixCode:'000201',qrCode:null,identifier:null,expiresAt:'2026-10-01T00:00:00Z'}};
describe('billing UI safety',()=>{
 it('resumes pending payment without offering another subscription',()=>{
  expect(billingLocksNewSubscription(billing)).toBe(true);
  expect(billingLocksNewSubscription({...billing,providerStatus:'active'})).toBe(true);
  expect(billingLocksNewSubscription({...billing,providerStatus:'cancelled'})).toBe(false);
  expect(billingLocksNewSubscription(null)).toBe(false);
 });
 it('never offers expired, paid, suspended or cancelled Pix codes',()=>{
  const now=Date.parse('2026-09-25T00:00:00Z');
  expect(usablePix(billing,now)).toBe(true);
  expect(usablePix(billing,Date.parse('2026-10-01T00:00:00Z'))).toBe(false);
  for(const providerStatus of ['active','suspended','cancelled'])expect(usablePix({...billing,providerStatus},now)).toBe(false);
  expect(usablePix({...billing,payment:null},now)).toBe(false);
 });
 it('errors are actionable without credentials or server configuration details',()=>{
  for(const code of ['SYNCPAY_AUTH_ERROR','SYNCPAY_NOT_CONFIGURED','SYNCPAY_REFUND_WINDOW_EXPIRED','SYNCPAY_REFUND_MANUAL_REQUIRED','unexpected'])expect(billingErrorMessage(code)).not.toMatch(/secret|client id|variáveis|servidor/i);
  expect(billingStatusLabel('suspended')).toContain('suspensa');
  expect(billingStatusLabel('pending_first_payment')).toBe('Contratação não finalizada');
  expect(billingStatusLabel('unknown')).not.toContain('ativa');
 });
});
