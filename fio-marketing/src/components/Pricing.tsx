import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { cycles, plans, type Cycle } from "../data/plans";
import { links } from "../data/config";
import { useMarketingI18n } from "../i18n";

type Audience = "solo" | "team";

const copy = {
  "pt-BR": {
    workMode: "Como você trabalha?",
    solo: "Trabalho sozinho",
    team: "Tenho uma equipe",
    soloTitle: "FIO SOLO para quem atende sozinho.",
    soloText:
      "Uma agenda, um profissional e toda a experiência digital do FIO sem pagar por uma estrutura de equipe.",
    teamTitle: "Planos para barbearias com equipe.",
    teamText:
      "Escolha a capacidade que combina com a sua operação e cresça sem trocar de sistema.",
    soloDescription: "Tudo que um profissional solo precisa para organizar agenda, clientes e presença digital.",
    annualDiscount: "20% OFF",
    oneProfessional: "1 profissional",
    billingNote:
      "Mensal e anual têm os mesmos recursos. No anual, você economiza 20%.",
    trial: (plan: string, days: number) =>
      `Quer experimentar o ${plan}? Ative ${days} dias de teste no painel, uma vez por espaço no FREE.`,
  },
  en: {
    workMode: "How do you work?",
    solo: "I work solo",
    team: "I have a team",
    soloTitle: "FIO SOLO for independent professionals.",
    soloText:
      "One schedule, one professional and the full FIO digital experience without paying for a team structure.",
    teamTitle: "Plans for barbershops with a team.",
    teamText:
      "Choose the capacity that fits your operation and grow without changing systems.",
    soloDescription: "Everything a solo professional needs to organize bookings, clients and digital presence.",
    annualDiscount: "20% OFF",
    oneProfessional: "1 professional",
    billingNote:
      "Monthly and annual include the same features. Annual billing saves you 20%.",
    trial: (plan: string, days: number) =>
      `Want to try ${plan}? Activate a ${days}-day trial in your dashboard, once per FREE workspace.`,
  },
  es: {
    workMode: "¿Cómo trabajas?",
    solo: "Trabajo solo",
    team: "Tengo un equipo",
    soloTitle: "FIO SOLO para profesionales independientes.",
    soloText:
      "Una agenda, un profesional y toda la experiencia digital de FIO sin pagar por una estructura de equipo.",
    teamTitle: "Planes para barberías con equipo.",
    teamText:
      "Elige la capacidad que encaja con tu operación y crece sin cambiar de sistema.",
    soloDescription: "Todo lo que un profesional independiente necesita para organizar agenda, clientes y presencia digital.",
    annualDiscount: "20% OFF",
    oneProfessional: "1 profesional",
    billingNote:
      "Mensual y anual incluyen las mismas funciones. Con el anual ahorras un 20%.",
    trial: (plan: string, days: number) =>
      `¿Quieres probar ${plan}? Activa ${days} días de prueba en el panel, una vez por espacio FREE.`,
  },
  fr: {
    workMode: "Comment travaillez-vous ?",
    solo: "Je travaille seul",
    team: "J’ai une équipe",
    soloTitle: "FIO SOLO pour les professionnels indépendants.",
    soloText:
      "Un agenda, un professionnel et toute l’expérience numérique FIO sans payer pour une structure d’équipe.",
    teamTitle: "Des offres pour les salons avec équipe.",
    teamText:
      "Choisissez la capacité adaptée à votre activité et évoluez sans changer de système.",
    soloDescription: "Tout ce dont un professionnel solo a besoin pour organiser agenda, clients et présence numérique.",
    annualDiscount: "20% OFF",
    oneProfessional: "1 professionnel",
    billingNote:
      "Mensuel et annuel incluent les mêmes fonctions. L’annuel vous fait économiser 20 %.",
    trial: (plan: string, days: number) =>
      `Envie d’essayer ${plan} ? Activez ${days} jours d’essai dans le tableau de bord, une fois par espace FREE.`,
  },
  de: {
    workMode: "Wie arbeitest du?",
    solo: "Ich arbeite allein",
    team: "Ich habe ein Team",
    soloTitle: "FIO SOLO für selbstständige Profis.",
    soloText:
      "Ein Kalender, ein Profi und die komplette digitale FIO-Erfahrung ohne Kosten für eine Teamstruktur.",
    teamTitle: "Tarife für Barbershops mit Team.",
    teamText:
      "Wähle die passende Kapazität und wachse weiter, ohne das System zu wechseln.",
    soloDescription: "Alles, was ein Solo-Profi für Termine, Kunden und digitale Präsenz braucht.",
    annualDiscount: "20% OFF",
    oneProfessional: "1 Profi",
    billingNote:
      "Monatlich und jährlich enthalten dieselben Funktionen. Jährlich sparst du 20 %.",
    trial: (plan: string, days: number) =>
      `Möchtest du ${plan} testen? Aktiviere ${days} Testtage im Dashboard, einmal pro FREE-Bereich.`,
  },
  it: {
    workMode: "Come lavori?",
    solo: "Lavoro da solo",
    team: "Ho un team",
    soloTitle: "FIO SOLO per professionisti indipendenti.",
    soloText:
      "Un’agenda, un professionista e tutta l’esperienza digitale FIO senza pagare per una struttura di team.",
    teamTitle: "Piani per barberie con team.",
    teamText:
      "Scegli la capacità adatta alla tua attività e cresci senza cambiare sistema.",
    soloDescription: "Tutto ciò che serve a un professionista solo per gestire agenda, clienti e presenza digitale.",
    annualDiscount: "20% OFF",
    oneProfessional: "1 professionista",
    billingNote:
      "Mensile e annuale includono le stesse funzioni. Con l’annuale risparmi il 20%.",
    trial: (plan: string, days: number) =>
      `Vuoi provare ${plan}? Attiva ${days} giorni di prova nel pannello, una volta per spazio FREE.`,
  },
} as const;

const soloPremiumDescription: Record<string, string> = {
  "pt-BR": "Tudo do FIO para 1 profissional, com capacidade sem limite e IA no nível máximo.",
  en: "The highest FIO tier for 1 professional, with unlimited capacity and maximum AI allowance.",
  es: "El nivel máximo de FIO para 1 profesional, con capacidad sin límite y máxima IA.",
  fr: "Le niveau FIO maximal pour 1 professionnel, avec capacité illimitée et IA au maximum.",
  de: "Die höchste FIO-Stufe für 1 Profi, mit unbegrenzter Kapazität und maximalem KI-Kontingent.",
  it: "Il livello FIO massimo per 1 professionista, con capacità illimitata e IA al massimo.",
};

export function Pricing() {
  const [cycle, setCycle] = useState<Cycle>("annual");
  const [audience, setAudience] = useState<Audience>("solo");
  const { t, locale, translateFeature } = useMarketingI18n();
  const local = copy[locale] ?? copy["pt-BR"];

  const visiblePlans = plans.filter(
    (plan) =>
      plan.code === "FREE" ||
      (audience === "solo"
        ? plan.code === "SOLO" || plan.code === "SOLO_PREMIUM"
        : plan.code === "PRO" || plan.code === "PREMIUM"),
  );
  const trialPlan = plans.find((plan) =>
    audience === "solo" ? plan.code === "SOLO" : plan.code === "PRO",
  )!;

  const descriptionFor = (code: (typeof plans)[number]["code"]) => {
    if (code === "FREE") return t("freeDescription");
    if (code === "SOLO") return local.soloDescription;
    if (code === "SOLO_PREMIUM") return soloPremiumDescription[locale] ?? soloPremiumDescription["pt-BR"];
    if (code === "PRO") return t("proDescription");
    return t("premiumDescription");
  };

  const featureFor = (feature: string) =>
    feature === "1 profissional"
      ? local.oneProfessional
      : translateFeature(feature);

  return (
    <section className="section pricing-section light-section" id="planos">
      <div className="container">
        <div className="pricing-heading">
          <div>
            <span className="eyebrow">{t("plans")}</span>
            <h2>{t("pricingTitle")}</h2>
            <p>{t("pricingDescription")}</p>
          </div>

          <div className="pricing-controls">
            <fieldset className="audience-switch">
              <legend>{local.workMode}</legend>
              <div>
                <label className={audience === "solo" ? "active" : ""}>
                  <input
                    type="radio"
                    name="audience"
                    value="solo"
                    checked={audience === "solo"}
                    onChange={() => setAudience("solo")}
                  />
                  <span>{local.solo}</span>
                </label>
                <label className={audience === "team" ? "active" : ""}>
                  <input
                    type="radio"
                    name="audience"
                    value="team"
                    checked={audience === "team"}
                    onChange={() => setAudience("team")}
                  />
                  <span>{local.team}</span>
                </label>
              </div>
            </fieldset>

            <fieldset className="billing-switch">
              <legend className="sr-only">{t("billingPeriod")}</legend>
              {cycles.map((key) => (
                <label className={cycle === key ? "active" : ""} key={key}>
                  <input
                    type="radio"
                    name="billing"
                    value={key}
                    checked={cycle === key}
                    onChange={() => setCycle(key)}
                  />
                  <span>
                    {t(key)}
                    {key === "annual" ? ` · ${local.annualDiscount}` : ""}
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
        </div>

        <div className="audience-plan-note" aria-live="polite">
          <strong>
            {audience === "solo" ? local.soloTitle : local.teamTitle}
          </strong>
          <p>{audience === "solo" ? local.soloText : local.teamText}</p>
        </div>

        <div className={`plans-grid ${audience}`}>
          {visiblePlans.map((plan) => (
            <article
              className={`plan ${plan.recommended ? "recommended" : ""}`}
              key={plan.code}
            >
              <div className="plan-name">
                <h3>{plan.name}</h3>
                {plan.recommended && <span>{t("recommended")}</span>}
              </div>

              <p className="plan-description">{descriptionFor(plan.code)}</p>

              <div className="price" aria-live="polite">
                <strong>
                  {new Intl.NumberFormat(locale, {
                    style: "currency",
                    currency: "BRL",
                  }).format(plan.prices[cycle] / 100)}
                </strong>
                <span>
                  {t(
                    plan.code === "FREE"
                      ? "noFee"
                      : cycle === "monthly"
                        ? "perMonth"
                        : "perYear",
                  )}
                </span>
              </div>

              <ul className="plan-features">
                {plan.groups[0].items.slice(0, 3).map((feature) => (
                  <li key={feature}>
                    <Check size={15} />
                    {featureFor(feature)}
                  </li>
                ))}
              </ul>

              <a
                className={`button ${plan.recommended ? "" : "outline"}`}
                href={links.signup}
              >
                {plan.code === "FREE"
                  ? t("start")
                  : t("choose", { plan: plan.code })}
              </a>

              <details className="plan-details">
                <summary>
                  {t("moreFeatures")}
                  <Plus size={16} />
                </summary>
                <ul className="plan-features">
                  {[
                    ...plan.groups[0].items.slice(3),
                    ...plan.groups.slice(1).flatMap((group) => group.items),
                  ].map((feature) => (
                    <li key={feature}>
                      <Check size={14} />
                      {featureFor(feature)}
                    </li>
                  ))}
                </ul>
              </details>
            </article>
          ))}
        </div>

        <div className="pricing-note">
          <p>{local.trial(trialPlan.name, trialPlan.trialDays ?? 14)}</p>
          <span>{local.billingNote}</span>
        </div>
      </div>
    </section>
  );
}
