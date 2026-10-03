import { ArrowUpRight, CalendarDays, Users, Link2 } from "lucide-react";
import { links } from "../data/config";
import { ProductPreview, ShopPreview } from "../components/ProductPreview";
import { Pricing } from "../components/Pricing";
import { Faq } from "../components/Faq";
import { useMarketingI18n } from "../i18n";

export function Home() {
  const { t } = useMarketingI18n();
  return (
    <main id="conteudo">
      <section className="hero container" aria-labelledby="hero-title">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="fine-line" />
            {t("eyebrow")}
          </span>
          <h1 id="hero-title">
            {t("heroStart")}
            <br />
            <span>{t("heroEnd")}</span>
          </h1>
          <p>{t("heroDescription")}</p>
          <div className="hero-actions">
            <a className="button" href={links.signup}>
              {t("start")}
              <ArrowUpRight size={18} />
            </a>
            <a className="text-link" href="#produto">
              {t("explore")}
            </a>
          </div>
          <span className="hero-note">{t("freeNote")}</span>
        </div>
        <ProductPreview />
      </section>
      <section
        className="product-section light-section"
        id="produto"
        aria-labelledby="product-title"
      >
        <div className="container product-inner">
          <div className="product-copy">
            <span className="eyebrow">{t("productEyebrow")}</span>
            <h2 id="product-title">{t("productTitle")}</h2>
            <p>{t("productDescription")}</p>
            <ul className="product-benefits">
              {(
                [
                  ["agendaBenefit", CalendarDays],
                  ["peopleBenefit", Users],
                  ["linkBenefit", Link2],
                ] as const
              ).map(([key, Icon]) => (
                <li key={key}>
                  <Icon size={19} />
                  <span>{t(key)}</span>
                </li>
              ))}
            </ul>
          </div>
          <figure className="booking-preview">
            <div className="preview-address">
              <Link2 size={14} />
              <span>{t("yourLink")}</span>
              <span>↗</span>
            </div>
            <ShopPreview />
            <figcaption>{t("previewNote")}</figcaption>
          </figure>
          <div className="audience">
            <span>{t("audienceTitle")}</span>
            <p>{t("audienceDescription")}</p>
          </div>
        </div>
      </section>
      <section className="section container how-section" id="como-funciona">
        <div className="section-heading">
          <span className="eyebrow">{t("howEyebrow")}</span>
          <h2>{t("howTitle")}</h2>
        </div>
        <ol className="steps">
          {(
            [
              ["step1", "step1Text"],
              ["step2", "step2Text"],
              ["step3", "step3Text"],
            ] as const
          ).map(([title, body], i) => (
            <li key={title}>
              <span>0{i + 1}</span>
              <div>
                <h3>{t(title)}</h3>
                <p>{t(body)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <Pricing />
      <Faq />
      <section className="final-cta">
        <div className="container">
          <h2>{t("finalTitle")}</h2>
          <a className="button" href={links.signup}>
            {t("start")}
            <ArrowUpRight size={18} />
          </a>
        </div>
      </section>
    </main>
  );
}
