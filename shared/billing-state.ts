import type { BillingCycle } from './fio-plans.js';

export type PaidPlan = 'PRO' | 'PREMIUM';
export type BillingState = {
 change?:{plan:PaidPlan;cycle:BillingCycle;state:string;type:string|null;amountCents:number|null}|null;
 provider:'syncpay'; providerStatus:string; plan:PaidPlan; cycle:BillingCycle;
 amountCents:number; nextChargeAt:string|null;
 payment:{pixCode:string|null;qrCode:string|null;identifier:string|null;expiresAt:string|null}|null;
 refund?:{eligible:boolean;deadline:string|null}|null;
};

export function billingLocksNewSubscription(billing:BillingState|null){
 return Boolean(billing && ['active','overdue','pending_first_payment'].includes(billing.providerStatus));
}

export function usablePix(billing:BillingState|null,now=Date.now()){
 if(!billing?.payment?.pixCode || !(['pending_first_payment','overdue'].includes(billing.providerStatus)||(billing.providerStatus==='active'&&billing.change?.type==='upgrade'&&billing.change.state==='pending')))return false;
 const expiry=billing.payment.expiresAt;
 return !expiry || Date.parse(expiry)>now;
}

export function billingStatusLabel(status:string){
 return ({pending_first_payment:'Contratação não finalizada',active:'Assinatura ativa',overdue:'Pagamento em atraso',suspended:'Assinatura suspensa',cancelled:'Assinatura cancelada'} as Record<string,string>)[status]??'Confirmação em andamento';
}

export function billingErrorMessage(code?:string){
 const messages:Record<string,string>={
  SYNCPAY_CHANGE_PENDING:'Há uma troca em andamento. Atualize a cobrança e aguarde a confirmação.',
  SYNCPAY_CHANGE_UNCERTAIN:'A troca está em verificação. Não repita a solicitação; consulte o suporte.',
  SYNCPAY_PLAN_INCOMPATIBLE:'Os planos de cobrança precisam ser vinculados ao mesmo produto. Fale com o suporte FIO.',
  SYNCPAY_CHANGE_BLOCKED:'A assinatura tem uma pendência ou mudou de estado. Atualize a cobrança.',
  SYNCPAY_SAME_PLAN:'Este já é o plano e período atuais.',
  INVALID_DOCUMENT:'Informe um CPF ou CNPJ válido.',
  SYNCPAY_INVALID_REQUEST:'Confira os dados de cobrança e tente novamente.',
  SYNCPAY_RESEND_REJECTED:'A SyncPay não aceitou gerar outro Pix agora. Atualize o status e, se continuar assim, fale com o suporte antes de tentar novamente.',
  SYNCPAY_RATE_LIMIT:'Muitas tentativas seguidas. Aguarde alguns minutos.',
  SYNCPAY_ENROLLMENT_UNCERTAIN:'A SyncPay não confirmou a tentativa. Aguarde 5 minutos antes de liberar e tentar novamente, para evitar cobrança duplicada.',
  SYNCPAY_ENROLLMENT_IN_PROGRESS:'Há uma tentativa recente em verificação. Aguarde até 5 minutos e use “Verificar tentativa anterior” novamente.',
  SYNCPAY_SUBSCRIPTION_EXISTS:'Já existe uma assinatura ou cobrança em andamento. Consulte a cobrança atual.',
  SYNCPAY_REFUND_WINDOW_EXPIRED:'O prazo de 7 dias desta primeira contratação terminou. Você ainda pode cancelar cobranças futuras.',
  SYNCPAY_REFUND_MANUAL_REQUIRED:'Não foi possível identificar automaticamente a transação paga. Fale com o suporte FIO para solicitar o reembolso.',
  SYNCPAY_REFUND_NOT_READY:'O pagamento ainda não está pronto para reembolso. Atualize o status e tente novamente.',
  SYNCPAY_REFUND_IN_PROGRESS:'Já existe um reembolso em andamento para esta cobrança.',
  SYNCPAY_REFUND_UNAVAILABLE:'Esta cobrança não está elegível para reembolso automático. Fale com o suporte FIO.',
  SYNCPAY_NOT_CONFIGURED:'A assinatura está temporariamente indisponível. Fale com o suporte.',
  SYNCPAY_AUTH_ERROR:'A assinatura está temporariamente indisponível. Fale com o suporte.',
  SYNCPAY_ACCOUNT_PENDING:'A assinatura está temporariamente indisponível. Fale com o suporte.',
  OFFLINE:'Não foi possível conectar. Confira sua conexão e tente novamente.'
 };
 return messages[code??'']??'Não foi possível confirmar a cobrança agora. Tente consultar novamente em instantes.';
}
