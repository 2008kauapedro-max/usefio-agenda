import type { Plan } from './domain.js';

export type BillingCycle = 'weekly'|'monthly'|'annual';

export const SALE_BILLING_CYCLES =
 ['monthly','annual'] as const satisfies readonly BillingCycle[];

export interface FioPlanGroup {
 title:string;
 items:string[];
}

export interface FioPlanDefinition {
 code:Plan;
 name:string;
 eyebrow:string;
 description:string;
 recommended?:boolean;
 proposal?:boolean;
 trialDays?:number;
 prices:Record<BillingCycle,number|null>;
 highlights:string[];
 groups:FioPlanGroup[];
}

export const FIO_PLAN_CATALOG:FioPlanDefinition[]=[
 {
  code:'FREE',
  name:'FIO FREE',
  eyebrow:'PARA COMEÇAR',
  description:'O essencial para organizar os primeiros agendamentos.',
  prices:{weekly:0,monthly:0,annual:0},
  highlights:['Até 85 clientes','Responsável + 1 profissional'],
  groups:[
   {title:'CAPACIDADE',items:[
    'Até 85 clientes',
    'Responsável + 1 profissional',
    'Até 8 serviços'
   ]},
   {title:'AGENDA',items:[
    'Agenda online',
    'Agendamento dos clientes',
    'Modo barbeiro solo'
   ]},
   {title:'EXPERIÊNCIA',items:[
    'Página básica de agendamento',
    'Logo da barbearia',
    'App/PWA com identidade FIO'
   ]}
  ]
 },
 {
  code:'PRO',
  name:'FIO PRO',
  eyebrow:'RECOMENDADO',
  description:'Para barbearias que querem crescer com presença digital e comunicação.',
  recommended:true,
  trialDays:14,
  prices:{weekly:null,monthly:14990,annual:149900},
  highlights:['Até 500 clientes','Até 5 profissionais + responsável'],
  groups:[
   {title:'CAPACIDADE',items:[
    'Até 500 clientes',
    'Até 5 profissionais + responsável',
    'Até 20 serviços',
    'Até 5 pacotes de cortes'
   ]},
   {title:'PRESENÇA DIGITAL',items:[
    'Mini site personalizado',
    'App/PWA com identidade da barbearia',
    'Logo, capa, fundo e cores'
   ]},
   {title:'COMUNICAÇÃO',items:[
    'Feed da barbearia',
    'Campanhas e comunicação',
    'Pacotes/planos de cortes'
   ]},
   {title:'INTELIGÊNCIA',items:[
    'Assistente FIO',
    '150 consultas de IA por usuário/dia'
   ]}
  ]
 },
 {
  code:'PREMIUM',
  name:'FIO PREMIUM',
  eyebrow:'PARA OPERAÇÕES MAIORES',
  description:'Mais capacidade para equipes e carteiras de clientes maiores.',
  prices:{weekly:null,monthly:29990,annual:299900},
  highlights:['Até 2.000 clientes','Até 10 profissionais + responsável'],
  groups:[
   {title:'CAPACIDADE',items:[
    'Até 2.000 clientes',
    'Até 10 profissionais + responsável',
    'Até 50 serviços',
    'Até 15 pacotes de cortes'
   ]},
   {title:'PRESENÇA DIGITAL',items:[
    'Mini site personalizado',
    'App/PWA com identidade da barbearia',
    'Logo, capa, fundo e cores'
   ]},
   {title:'COMUNICAÇÃO',items:[
    'Feed da barbearia',
    'Campanhas e comunicação',
    'Pacotes/planos de cortes'
   ]},
   {title:'INTELIGÊNCIA',items:[
    'Assistente FIO',
    '500 consultas de IA por usuário/dia'
   ]}
  ]
 }
];

export const BILLING_LABELS:Record<BillingCycle,string>={
 weekly:'Semanal',
 monthly:'Mensal',
 annual:'Anual'
};

export const billingSuffix=(cycle:BillingCycle)=>
 cycle==='weekly'?'/ semana':
 cycle==='monthly'?'/ mês':
 '/ ano';

export const findFioPlan=(plan:Plan)=>
 FIO_PLAN_CATALOG.find(item=>item.code===plan)??FIO_PLAN_CATALOG[0];
