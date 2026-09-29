import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { links } from "../data/config";

export function Logo() {
  return (
    <a className="logo" href="/" aria-label="FIO — página inicial">
      <img src="/fio-logo.png" width="89" height="30" alt="FIO" />
    </a>
  );
}
export function Header() {
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
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
        <nav
          id="main-nav"
          className={open ? "main-nav is-open" : "main-nav"}
          aria-label="Navegação principal"
          onClick={() => setOpen(false)}
        >
          <div className="nav-sections">
            <a href="/#produto">Produto</a>
            <a href="/#como-funciona">Como funciona</a>
            <a href="/#planos">Planos</a>
            <a href="/#duvidas">Dúvidas</a>
          </div>
          <div className="nav-actions">
            <a href={links.login}>Entrar</a>
            <a className="button small" href={links.signup}>
              Começar grátis
            </a>
          </div>
        </nav>
      </div>
    </header>
  );
}
