import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { cycles, money, plans, type Cycle } from "../data/plans";
import { links } from "../data/config";

export function Pricing() {
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const suffix = cycles.find((item) => item.key === cycle)!.suffix;
  return (
    <section className="section pricing-section" id="planos">
      <div className="container">
        <div className="section-heading pricing-heading">
          <div>
            <span className="eyebrow">05 / SEU PRÓXIMO PASSO</span>
            <h2>
              Comece pequeno.
              <br />
              Tenha espaço para crescer.
            </h2>
          </div>
          <p>
            Uma agenda gratuita para começar.
            <br />
            Mais recursos quando fizer sentido.
          </p>
        </div>
        <fieldset className="billing-switch">
          <legend className="sr-only">Período de cobrança</legend>
          {cycles.map((item) => (
            <label
              className={cycle === item.key ? "active" : ""}
              key={item.key}
            >
              <input
                type="radio"
                name="billing"
                value={item.key}
                checked={cycle === item.key}
                onChange={() => setCycle(item.key)}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </fieldset>
        <div className="plans-grid">
          {plans.map((plan) => (
            <article
              className={`plan ${plan.recommended ? "recommended" : ""}`}
              key={plan.name}
            >
              <div className="plan-name">
                <h3>FIO {plan.name}</h3>
                {plan.recommended && <span>Recomendado</span>}
              </div>
              <p className="plan-description">{plan.description}</p>
              <div className="price" aria-live="polite">
                <strong>{money(plan.prices[cycle])}</strong>
                <span>{plan.name === "FREE" ? "sem mensalidade" : suffix}</span>
              </div>
              <a
                className={`button ${plan.recommended ? "" : "outline"}`}
                href={links.signup}
              >
                {plan.name === "FREE"
                  ? "Começar grátis"
                  : `Começar com ${plan.name}`}
              </a>
              <ul className="plan-features">
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <Check size={14} />
                    {feature}
                  </li>
                ))}
              </ul>
              <details className="plan-details">
                <summary>
                  Ver mais recursos <Plus size={14} />
                </summary>
                <ul className="plan-features">
                  {plan.more.map((feature) => (
                    <li key={feature}>
                      <Check size={14} />
                      {feature}
                    </li>
                  ))}
                </ul>
              </details>
            </article>
          ))}
        </div>
        <div className="pricing-note">
          <p>
            <b>Quer conhecer o PRO?</b> Teste por 14 dias, ativando pelo painel.
            Disponível uma vez por barbearia no plano FREE.
          </p>
          <span>
            Valores totais por período.
            <br />A contratação acontece no aplicativo.
          </span>
        </div>
      </div>
    </section>
  );
}
