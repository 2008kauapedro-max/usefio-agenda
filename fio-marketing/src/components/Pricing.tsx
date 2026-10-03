import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { cycles, plans, type Cycle } from "../data/plans";
import { links } from "../data/config";
import { useMarketingI18n } from "../i18n";

export function Pricing() {
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const { t, locale, translateFeature } = useMarketingI18n();
  return (
    <section className="section pricing-section light-section" id="planos">
      <div className="container">
        <div className="pricing-heading">
          <div>
            <span className="eyebrow">{t("plans")}</span>
            <h2>{t("pricingTitle")}</h2>
            <p>{t("pricingDescription")}</p>
          </div>
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
                <span>{t(key)}</span>
              </label>
            ))}
          </fieldset>
        </div>
        <div className="plans-grid">
          {plans.map((plan) => (
            <article
              className={`plan ${plan.recommended ? "recommended" : ""}`}
              key={plan.code}
            >
              <div className="plan-name">
                <h3>{plan.name}</h3>
                {plan.recommended && <span>{t("recommended")}</span>}
              </div>
              <p className="plan-description">
                {t(
                  plan.code === "FREE"
                    ? "freeDescription"
                    : plan.code === "PRO"
                      ? "proDescription"
                      : "premiumDescription",
                )}
              </p>
              <div className="price" aria-live="polite">
                <strong>
                  {new Intl.NumberFormat(locale, {
                    style: "currency",
                    currency: "BRL",
                  }).format(plan.prices[cycle]! / 100)}
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
                    {translateFeature(feature)}
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
                      {translateFeature(feature)}
                    </li>
                  ))}
                </ul>
              </details>
            </article>
          ))}
        </div>
        <div className="pricing-note">
          <p>
            {t("trialNote", {
              days: plans.find((plan) => plan.code === "PRO")!.trialDays!,
            })}
          </p>
          <span>{t("billingNote")}</span>
        </div>
      </div>
    </section>
  );
}
