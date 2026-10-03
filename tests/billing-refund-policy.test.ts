import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

describe('billing refund and recovery UX',()=>{
 it('exposes refund and cancellation actions without hiding legal exceptions',()=>{
  const page=readFileSync(resolve('src/pages/FioPlans.tsx'),'utf8');
  expect(page).toContain("t('fp.cancelRefundButton')");
  expect(page).toContain("t('fp.noAutoRefund')");
  const dict=readFileSync(resolve('src/i18n/dictionaries.ts'),'utf8');
  expect(dict).toContain('Cancelar e solicitar reembolso');
  expect(dict).toContain('não gera reembolso automático do período já pago, sem prejuízo dos direitos previstos em lei');
  expect(page).toContain("manageCharge('cancel_active')");
 });
 it('registers the refund API route',()=>{
  const app=readFileSync(resolve('server/app.ts'),'utf8');
  expect(app).toContain("/api/saas/refund");
  expect(app).toContain('requestSyncpayRefund');
 });
});
