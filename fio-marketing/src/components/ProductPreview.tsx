import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Scissors,
  Users,
} from "lucide-react";
import { useMarketingI18n } from "../i18n";

// Representations of Workspace and PublicPortal. All people and appointments are fictional.
export function ProductPreview() {
  const { t, locale } = useMarketingI18n();
  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date("2026-09-29T12:00:00Z"));
  return (
    <figure className="hero-product">
      <div className="desktop-app">
        <aside className="mock-sidebar" aria-hidden="true">
          <img src="/fio-logo.png" width="67" height="23" alt="" />
          {(
            [
              ["overview", LayoutGrid],
              ["agenda", CalendarDays],
              ["services", Scissors],
              ["clients", Users],
            ] as const
          ).map(([key, Icon]) => (
            <span key={key} className={key === "agenda" ? "selected" : ""}>
              <Icon size={15} />
              {t(key)}
            </span>
          ))}
          <div className="sidebar-bottom">STUDIO 01</div>
        </aside>
        <div className="agenda-preview">
          <div className="preview-top">
            <span className="eyebrow">STUDIO 01</span>
            <span className="demo-label">{t("demo")}</span>
          </div>
          <div className="agenda-title">
            <strong>{t("agenda")}</strong>
            <CalendarDays size={20} />
          </div>
          <div className="agenda-filter">
            <ChevronLeft size={14} />
            <span>{date}</span>
            <ChevronRight size={14} />
            <span className="today">{t("today")}</span>
          </div>
          <div className="agenda-meta">{t("allTeam")}</div>
          <div className="appointments">
            {[
              ["09:00", "Rafael Mendes", "Lucas"],
              ["10:00", "Pedro Costa", "André"],
              ["11:30", "Bruno Santos", "Lucas"],
            ].map(([time, name, barber], i) => (
              <div className={`appointment appointment-${i}`} key={name}>
                <b className="appointment-time">{time}</b>
                <div className="appointment-info">
                  <strong>{name}</strong>
                  <span>
                    {t(i === 1 ? "cutBeard" : "cut")} · {barber}
                  </span>
                </div>
                <span className={`status ${i === 0 ? "confirmed" : ""}`}>
                  {i === 0 ? <Check size={13} /> : null}
                  {t(i === 0 ? "confirmed" : "scheduled")}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="hero-client">
        <span className="client-check">
          <Check size={19} />
        </span>
        <div>
          <strong>{t("appointmentIn")}</strong>
          <span>Pedro Costa · 10:00 · {t("cutBeard")}</span>
        </div>
      </div>
      <figcaption>{t("previewNote")}</figcaption>
    </figure>
  );
}
export function ShopPreview() {
  const { t, locale } = useMarketingI18n();
  return (
    <div className="shop-preview">
      <div className="shop-cover">
        <span className="shop-monogram">01</span>
        <div>
          <strong>STUDIO 01</strong>
          <p>{t("shopTagline")}</p>
        </div>
      </div>
      <div className="shop-tabs">
        <span>{t("services")}</span>
        <span>{t("professionals")}</span>
        <span>{t("details")}</span>
      </div>
      <div className="shop-services">
        {(
          [
            ["cut", 35, 30],
            ["beard", 25, 30],
            ["cutBeard", 55, 60],
          ] as const
        ).map(([key, price, duration]) => (
          <div className="shop-service" key={key}>
            <Scissors size={18} />
            <div>
              <strong>{t(key)}</strong>
              <span>
                {new Intl.NumberFormat(locale, {
                  style: "currency",
                  currency: "BRL",
                }).format(price)}{" "}
                · {duration} min
              </span>
            </div>
            <span className="shop-book">{t("book")}</span>
          </div>
        ))}
      </div>
      <div className="shop-powered">
        {t("powered")} <b>FIO</b>
        <span>{t("demo")}</span>
      </div>
    </div>
  );
}
