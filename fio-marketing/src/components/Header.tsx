import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { links } from "../data/config";
import { useMarketingI18n } from "../i18n";

export function Logo() {
  const { t } = useMarketingI18n();
  return (
    <a className="logo" href="/" aria-label={`FIO — ${t("home")}`}>
      <img src="/fio-logo.png" width="89" height="30" alt="FIO" />
    </a>
  );
}
export function Header() {
  const { t } = useMarketingI18n();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!header.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);
  return (
    <header className="header" ref={header}>
      <div className="container header-inner">
        <Logo />
        <button
          className="menu-toggle"
          ref={trigger}
          aria-expanded={open}
          aria-controls="main-nav"
          aria-label={open ? t("closeMenu") : t("openMenu")}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
        <nav
          id="main-nav"
          className={open ? "main-nav is-open" : "main-nav"}
          aria-label={t("navigation")}
          onClick={() => setOpen(false)}
        >
          <div className="nav-sections">
            <a href="/#produto">{t("product")}</a>

            <a href="/#planos">{t("plans")}</a>
            <a href="/#duvidas">{t("faq")}</a>
          </div>
          <div className="nav-actions">
            <a href={links.login}>{t("login")}</a>
            <a className="button small" href={links.signup}>
              {t("start")}
            </a>
          </div>
        </nav>
      </div>
    </header>
  );
}
