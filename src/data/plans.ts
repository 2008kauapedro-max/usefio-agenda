// Exibição apenas, sem regras de cobrança. Fonte: ZIP FIO-PROJETO-PARA-ASTRA-20260929,
// finalfio1/shared/fio-plans.ts, conferido em 29/09/2026. Valores em centavos.
// IA foi omitida da comunicação: a habilitação em produção não foi verificada.
export type Cycle = "weekly" | "monthly" | "annual";
export const cycles: { key: Cycle; label: string; suffix: string }[] = [
  { key: "weekly", label: "Semanal", suffix: "/ semana" },
  { key: "monthly", label: "Mensal", suffix: "/ mês" },
  { key: "annual", label: "Anual", suffix: "/ ano" },
];
export const plans = [
  {
    name: "FREE",
    description: "O primeiro passo da sua agenda.",
    recommended: false,
    prices: { weekly: 0, monthly: 0, annual: 0 },
    features: [
      "Até 100 clientes",
      "Responsável + 1 profissional",
      "Até 8 serviços",
    ],
    more: ["Agenda e página pública"],
  },
  {
    name: "PRO",
    description: "Mais espaço para o dia a dia.",
    recommended: true,
    prices: { weekly: 3990, monthly: 11990, annual: 124990 },
    features: [
      "Até 1.500 clientes",
      "Até 5 profissionais + responsável",
      "Até 40 serviços",
    ],
    more: ["Até 3 pacotes de cortes", "Feed e comunicação"],
  },
  {
    name: "PLUS",
    description: "Para uma equipe em crescimento.",
    recommended: false,
    prices: { weekly: 4990, monthly: 14990, annual: 159990 },
    features: [
      "Até 3.000 clientes",
      "Até 10 profissionais + responsável",
      "Até 80 serviços",
    ],
    more: ["Até 8 pacotes de cortes"],
  },
  {
    name: "PREMIUM",
    description: "Mais capacidade para crescer.",
    recommended: false,
    prices: { weekly: 5990, monthly: 17990, annual: 189990 },
    features: [
      "Capacidade conforme contrato atual",
      "Até 15 pacotes de cortes",
      "Feed e comunicação",
    ],
    more: ["Suporte pelo formulário do FIO"],
  },
] as const;
export const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
