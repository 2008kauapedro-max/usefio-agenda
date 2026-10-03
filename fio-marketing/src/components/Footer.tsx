import { Logo } from "./Header";
import { links } from "../data/config";
import { LOCALE_OPTIONS, useMarketingI18n } from "../i18n";
export function Footer() {
  const { t, locale, setLocale } = useMarketingI18n();
  return (
    <footer className="footer container">
      <div className="footer-main">
        <Logo />
        <nav className="footer-links" aria-label={t("contact")}>
          <a href={links.contact || "/contato"}>{t("contact")}</a>
          <a href="/termos">{t("terms")}</a>
          <a href="/privacidade">{t("privacy")}</a>
          {links.instagram && <a href={links.instagram}>Instagram</a>}
        </nav>
        <select
          className="language-select"
          aria-label={t("language")}
          value={locale}
          onChange={(event) => {
            const option = LOCALE_OPTIONS.find(
              (item) => item.value === event.target.value,
            );
            if (option) setLocale(option.value);
          }}
        >
          {LOCALE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.nativeLabel}
            </option>
          ))}
        </select>
      </div>
      <div className="footer-bottom">
        © {new Date().getFullYear()} FIO. {t("rights")}
      </div>
    </footer>
  );
}
