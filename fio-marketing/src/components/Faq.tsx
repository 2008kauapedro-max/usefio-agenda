import { Plus } from "lucide-react";
import { useMarketingI18n } from "../i18n";
export function Faq() {
  const { t } = useMarketingI18n();
  return (
    <section className="section container faq-section" id="duvidas">
      <div>
        <span className="eyebrow">{t("faq")}</span>
        <h2>{t("faqTitle")}</h2>
      </div>
      <div className="faq-list">
        {(["faq1", "faq2", "faq3", "faq4"] as const).map((key) => (
          <details key={key}>
            <summary>
              {t(key)}
              <Plus size={18} />
            </summary>
            <p>{t(`${key}Answer`)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
