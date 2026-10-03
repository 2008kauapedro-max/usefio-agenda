import { createHmac } from 'node:crypto';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { syncpayInternals,verifySyncpayWebhook } from '../server/syncpay';

afterEach(()=>vi.unstubAllEnvs());

describe('SyncPay billing boundary',()=>{
 it('derives the provider price from the trusted FIO catalog',()=>{
  expect(syncpayInternals.planConfig('PRO','monthly')).toMatchObject({amountCents:14990,periodicityDays:30});
  expect(syncpayInternals.planConfig('PREMIUM','annual')).toMatchObject({amountCents:299900,periodicityDays:365});
 });

 it('retira PLUS e semanal das novas vendas',()=>{
  expect(()=>syncpayInternals.planConfig('PLUS' as never,'monthly')).toThrow();
  expect(()=>syncpayInternals.planConfig('PRO','weekly')).toThrow();
 });

 it('accepts valid CPF/CNPJ and rejects malformed documents',()=>{
  expect(syncpayInternals.validDocument('52998224725')).toBe(true);
  expect(syncpayInternals.validDocument('11222333000181')).toBe(true);
  expect(syncpayInternals.validDocument('11111111111')).toBe(false);
 });

 it('recovers Pix from the resend-charge response when SyncPay omits its QR image',()=>{
  expect(syncpayInternals.paymentFromChargePayload({charge:{status:'pending',expires_at:'2026-09-25T12:00:00Z',payment:{pix_code:'000201010212',qr_code:null,identifier:'charge_123'}}})).toEqual({pixCode:'000201010212',qrCode:null,identifier:'charge_123',expiresAt:'2026-09-25T12:00:00.000Z'});
  expect(syncpayInternals.paymentFromChargePayload({data:{charge:{status:'pending',expires_at:'2026-09-25T12:00:00Z',payment:{pix_code:'000201010212'}}}})).toMatchObject({pixCode:'000201010212',expiresAt:'2026-09-25T12:00:00.000Z'});
  expect(syncpayInternals.paymentFromChargePayload({data:{payment:{pix_code:'000201010212',expires_at:'2026-09-25T12:00:00Z'}}})).toMatchObject({pixCode:'000201010212',expiresAt:'2026-09-25T12:00:00.000Z'});
  expect(syncpayInternals.paymentFromChargePayload({charge:{status:'pending',payment:{qr_code:'data:image/png;base64,...'}}})).toBeNull();
 });

 it('keeps overdue access only through the configured grace period',()=>{
  const detail={status:'overdue',next_charge_at:'2026-09-18T12:00:00Z',plan:{grace_period_days:5}} as Parameters<typeof syncpayInternals.accessUntil>[0];
  expect(syncpayInternals.accessUntil(detail)).toBe('2026-09-23T12:00:00.000Z');
 });

 it('validates HMAC on the raw body and rejects replay timestamps',()=>{
  vi.stubEnv('SYNCPAY_WEBHOOK_SECRET','whsec_test_123456');
  const raw=Buffer.from('{"event":"assinatura_ativada"}');
  const t=1_800_000_000;
  const v1=createHmac('sha256','whsec_test_123456').update(`${t}.${raw.toString('utf8')}`).digest('hex');
  const headers={'x-syncpay-signature':`t=${t},v1=${v1}`} as never;
  expect(verifySyncpayWebhook(raw,headers,t)).toBe(true);
  expect(verifySyncpayWebhook(raw,headers,t+301)).toBe(false);
 });

 it('supports bearer-secret deliveries while subscription HMAC remains provider-dependent',()=>{
  vi.stubEnv('SYNCPAY_WEBHOOK_SECRET','whsec_test_123456');
  const raw=Buffer.from('{}');
  expect(verifySyncpayWebhook(raw,{authorization:'Bearer whsec_test_123456'} as never,1)).toBe(true);
  expect(verifySyncpayWebhook(raw,{authorization:'Bearer wrong'} as never,1)).toBe(false);
 });

 it('accepts event-specific webhook secrets without exposing them to the client',()=>{
  vi.stubEnv('SYNCPAY_WEBHOOK_SECRET_ACTIVATED','whsec_activated_123456');
  vi.stubEnv('SYNCPAY_WEBHOOK_SECRET_RENEWED','whsec_renewed_123456');
  const raw=Buffer.from('{}');
  expect(verifySyncpayWebhook(raw,{authorization:'Bearer whsec_activated_123456'} as never,1)).toBe(true);
  expect(verifySyncpayWebhook(raw,{authorization:'Bearer whsec_renewed_123456'} as never,1)).toBe(true);
 });

 it('accepts compact subscription detail responses without leaking provider internals',()=>{
  const detail=syncpayInternals.normalizeProviderDetail({data:{subscription:{status:'active',next_charge_at:'2026-09-30T12:00:00Z',payment:{pix_code:'000201'}}}},{token:'sub_12345678',planToken:'plan_12345678',gracePeriodDays:5});
  expect(detail).toMatchObject({token:'sub_12345678',status:'active',plan:{token:'plan_12345678',grace_period_days:5},payment:{pix_code:'000201'}});
 });

 it('recognizes SyncPay dashboard test payload wrappers as no-op pings',()=>{
  expect(syncpayInternals.isSyncpayDashboardTest(Buffer.from('This is a test webhook payload.'))).toBe(true);
  expect(syncpayInternals.isSyncpayDashboardTest(Buffer.from('\"This is a test webhook payload.\"'))).toBe(true);
  expect(syncpayInternals.isSyncpayDashboardTest(Buffer.from('{\"message\":\"This is a test webhook payload.\"}'))).toBe(true);
  expect(syncpayInternals.isSyncpayDashboardTest(Buffer.from('message=This+is+a+test+webhook+payload.'))).toBe(true);
  expect(syncpayInternals.isSyncpayDashboardTest(Buffer.from('--fio-boundary\r\nContent-Disposition: form-data; name="message"\r\n\r\nThis is a test webhook payload.\r\n--fio-boundary--'))).toBe(true);
  expect(syncpayInternals.isSyncpayDashboardTest(Buffer.from('{\"event\":\"assinatura_ativada\"}'))).toBe(false);
  expect(syncpayInternals.isSyncpayDashboardTest(Buffer.from('{\"message\":\"This is a test webhook payload.\",\"event\":\"assinatura_ativada\"}'))).toBe(false);
  expect(syncpayInternals.isSyncpayDashboardTest(Buffer.from('{"message":"This is a test webhook payload.","ev\\u0065nt":"assinatura_ativada"}'))).toBe(false);
 });

 it('offers the 7-day refund window only for the first paid cycle',()=>{
  const base={status:'active',next_charge_at:'2026-10-30T12:00:00Z',plan:{grace_period_days:5},charges:[{cycle_number:1,status:'paid',paid_at:'2026-09-29T12:00:00Z',payment:{identifier:'tx_first'}}]} as Parameters<typeof syncpayInternals.refundWindow>[0];
  expect(syncpayInternals.refundWindow(base,Date.parse('2026-10-05T11:59:59Z'))).toMatchObject({eligible:true,identifier:'tx_first'});
  expect(syncpayInternals.refundWindow(base,Date.parse('2026-10-06T12:00:01Z')).eligible).toBe(false);
  const renewal={...base,charges:[{cycle_number:2,status:'paid',paid_at:'2026-09-29T12:00:00Z',payment:{identifier:'tx_second'}}]} as Parameters<typeof syncpayInternals.refundWindow>[0];
  expect(syncpayInternals.refundWindow(renewal,Date.parse('2026-09-30T12:00:00Z')).eligible).toBe(false);
 });

 it('recovers only the recent subscriber with the same email',()=>{
  const created=new Date(Date.now()-60_000).toISOString();
  const picked=syncpayInternals.pickRecoverableSubscriber([
   {token:'sub_old_12345678',subscriber_email:'owner@example.com',status:'active',started_at:new Date(Date.now()-86_400_000).toISOString()},
   {token:'sub_recent_12345678',subscriber_email:'OWNER@example.com',status:'pending_first_payment',started_at:new Date(Date.now()-30_000).toISOString()},
   {token:'sub_other_12345678',subscriber_email:'other@example.com',status:'pending_first_payment',started_at:new Date().toISOString()}
  ],'owner@example.com',created);
  expect(picked?.token).toBe('sub_recent_12345678');
 });

 it('rejects a provider response for a different subscription',()=>{
  expect(()=>syncpayInternals.normalizeProviderDetail({token:'sub_someone_else',status:'active'},{token:'sub_expected_123',planToken:'plan_12345678',gracePeriodDays:5})).toThrow();
 });
 it('uses server-controlled grace days instead of an unexpected provider override',()=>{
  const detail=syncpayInternals.normalizeProviderDetail({status:'overdue',next_charge_at:'2026-09-30T12:00:00Z',plan:{token:'plan_12345678',grace_period_days:999}},{token:'sub_12345678',planToken:'plan_12345678',gracePeriodDays:5});
  expect(syncpayInternals.accessUntil(detail)).toBe('2026-10-05T12:00:00.000Z');
 });
 it('unknown provider states fail closed',()=>{
  expect(()=>syncpayInternals.normalizeProviderDetail({status:'unknown'},{token:'sub_12345678',planToken:'plan_12345678',gracePeriodDays:5})).toThrow();
 });
});
