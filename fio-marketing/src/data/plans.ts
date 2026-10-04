export const cycles = ["monthly", "annual"] as const;
export type Cycle = (typeof cycles)[number];
export type MarketingPlanCode = "FREE" | "SOLO" | "SOLO_PREMIUM" | "PRO" | "PREMIUM";

export interface MarketingPlan {
  code: MarketingPlanCode;
  name: string;
  recommended?: boolean;
  trialDays?: number;
  prices: Record<Cycle, number>;
  groups: Array<{ title: string; items: string[] }>;
}

export const plans: MarketingPlan[] = [
  {
    code: "FREE",
    name: "FIO FREE",
    prices: { monthly: 0, annual: 0 },
    groups: [
      {
        title: "CAPACIDADE",
        items: [
          "Até 85 clientes",
          "Responsável + 1 profissional",
          "Até 8 serviços",
        ],
      },
      {
        title: "AGENDA",
        items: [
          "Agenda online",
          "Agendamento dos clientes",
          "Modo barbeiro solo",
        ],
      },
      {
        title: "EXPERIÊNCIA",
        items: [
          "Página básica de agendamento",
          "Logo da barbearia",
          "App/PWA com identidade FIO",
        ],
      },
    ],
  },
  {
    code: "SOLO",
    name: "FIO SOLO",
    recommended: true,
    trialDays: 14,
    prices: { monthly: 7990, annual: 76704 },
    groups: [
      {
        title: "CAPACIDADE",
        items: [
          "1 profissional",
          "Até 500 clientes",
          "Até 20 serviços",
          "Até 5 pacotes de cortes",
        ],
      },
      {
        title: "PRESENÇA DIGITAL",
        items: [
          "Mini site personalizado",
          "App/PWA com identidade da barbearia",
          "Logo, capa, fundo e cores",
        ],
      },
      {
        title: "COMUNICAÇÃO",
        items: [
          "Feed da barbearia",
          "Pacotes/planos de cortes",
        ],
      },
      {
        title: "INTELIGÊNCIA",
        items: [
          "Assistente FIO",
          "150 consultas de IA por usuário/dia",
        ],
      },
    ],
  },
  {
    code: "SOLO_PREMIUM",
    name: "FIO SOLO PREMIUM",
    prices: { monthly: 19790, annual: 189984 },
    groups: [
      {
        title: "CAPACIDADE",
        items: [
          "1 profissional",
          "Clientes sem limite",
          "Serviços sem limite",
          "Pacotes de cortes sem limite",
        ],
      },
      {
        title: "PRESENÇA DIGITAL",
        items: [
          "Mini site personalizado",
          "App/PWA com identidade da barbearia",
          "Logo, capa, fundo e cores",
        ],
      },
      {
        title: "RECURSOS",
        items: [
          "Feed da barbearia",
          "Pacotes/planos de cortes",
        ],
      },
      {
        title: "INTELIGÊNCIA",
        items: [
          "Assistente FIO",
          "500 consultas de IA por usuário/dia",
        ],
      },
    ],
  },
  {
    code: "PRO",
    name: "FIO PRO",
    recommended: true,
    trialDays: 14,
    prices: { monthly: 14990, annual: 143904 },
    groups: [
      {
        title: "CAPACIDADE",
        items: [
          "Até 500 clientes",
          "Até 5 profissionais + responsável",
          "Até 20 serviços",
          "Até 5 pacotes de cortes",
        ],
      },
      {
        title: "PRESENÇA DIGITAL",
        items: [
          "Mini site personalizado",
          "App/PWA com identidade da barbearia",
          "Logo, capa, fundo e cores",
        ],
      },
      {
        title: "COMUNICAÇÃO",
        items: [
          "Feed da barbearia",
          "Pacotes/planos de cortes",
        ],
      },
      {
        title: "INTELIGÊNCIA",
        items: [
          "Assistente FIO",
          "150 consultas de IA por usuário/dia",
        ],
      },
    ],
  },
  {
    code: "PREMIUM",
    name: "FIO PREMIUM",
    prices: { monthly: 29990, annual: 287904 },
    groups: [
      {
        title: "CAPACIDADE",
        items: [
          "Até 2.000 clientes",
          "Até 10 profissionais + responsável",
          "Até 50 serviços",
          "Até 15 pacotes de cortes",
        ],
      },
      {
        title: "PRESENÇA DIGITAL",
        items: [
          "Mini site personalizado",
          "App/PWA com identidade da barbearia",
          "Logo, capa, fundo e cores",
        ],
      },
      {
        title: "COMUNICAÇÃO",
        items: [
          "Feed da barbearia",
          "Pacotes/planos de cortes",
        ],
      },
      {
        title: "INTELIGÊNCIA",
        items: [
          "Assistente FIO",
          "500 consultas de IA por usuário/dia",
        ],
      },
    ],
  },
];
