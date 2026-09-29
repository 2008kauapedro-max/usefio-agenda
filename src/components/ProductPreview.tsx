import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LayoutGrid,
  MapPin,
  Scissors,
  Users,
} from "lucide-react";

// Representações de Workspace.tsx e PublicPortal.tsx. Pessoas e estabelecimentos fictícios.
// Elementos visuais são spans, não controles inertes disfarçados de botões.
export function Agenda({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`agenda-preview ${compact ? "compact" : ""}`}>
      <div className="preview-top">
        <span className="eyebrow">AGENDAMENTOS</span>
        <span className="demo-label">Demonstração</span>
      </div>
      <div className="agenda-title">
        <strong>Agenda</strong>
        <span className="mock-button">+ Agendar horário</span>
      </div>
      <div className="agenda-filter">
        <span>
          <ChevronLeft size={13} /> Terça, 29 de setembro{" "}
          <ChevronRight size={13} />
        </span>
        <span className="today">Hoje</span>
      </div>
      <div className="agenda-meta">
        <span>3 atendimentos · Toda a equipe</span>
        <span className="live">
          <i />
          Atualização automática
        </span>
      </div>
      <div className="appointments">
        {[
          ["09:00", "09:30", "Rafael Mendes", "Corte", "Lucas", "Confirmado"],
          [
            "10:00",
            "11:00",
            "Pedro Costa",
            "Corte + barba",
            "André",
            "Agendado",
          ],
          ["11:30", "12:00", "Bruno Santos", "Corte", "Lucas", "Agendado"],
        ].map(([start, end, name, service, barber, status], i) => (
          <div className={`appointment appointment-${i}`} key={name}>
            <div className="appointment-time">
              <b>{start}</b>
              <span>{end}</span>
            </div>
            <div className="appointment-info">
              <strong>{name}</strong>
              <span>
                {service} <em>· {barber}</em>
              </span>
            </div>
            <span className={`status ${i === 0 ? "confirmed" : ""}`}>
              {i === 0 && <Check size={11} />}
              {status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProductPreview() {
  return (
    <figure className="hero-product">
      <div className="desktop-app">
        <aside className="mock-sidebar" aria-hidden="true">
          <img src="/fio-logo.png" width="67" height="23" alt="" />
          <span>
            <LayoutGrid size={16} />
            Visão geral
          </span>
          <span className="selected">
            <CalendarDays size={16} />
            Agenda
          </span>
          <span>
            <Scissors size={16} />
            Serviços
          </span>
          <span>
            <Users size={16} />
            Clientes
          </span>
          <div className="sidebar-bottom">
            STUDIO 01<small>Seu espaço no FIO</small>
          </div>
        </aside>
        <Agenda compact />
      </div>
      <div className="hero-client">
        <span className="client-monogram">01</span>
        <div>
          <small>STUDIO 01 · APP DO CLIENTE</small>
          <strong>Seu próximo horário</strong>
          <span>Terça, 29 set. · 10:00 · Corte + barba</span>
        </div>
        <Check size={17} />
      </div>
      <figcaption>
        Uma agenda para você. Uma experiência para seu cliente.
      </figcaption>
    </figure>
  );
}

export type ShopTheme = "studio" | "classic" | "solo";
export function ShopPreview({
  theme = "studio",
  phone = false,
}: {
  theme?: ShopTheme;
  phone?: boolean;
}) {
  const names = {
    studio: "STUDIO 01",
    classic: "Clube do Corte",
    solo: "Lucas. Barbeiro",
  };
  return (
    <div className={`shop-preview theme-${theme} ${phone ? "phone" : ""}`}>
      <div className="shop-cover">
        <div className="shop-topline">
          <span>{theme === "solo" ? "Profissional" : "Barbearia"}</span>
          <span>App do cliente</span>
        </div>
        <div className="shop-identity">
          <span className="shop-monogram">
            {theme === "studio" ? "01" : theme === "classic" ? "CC" : "L."}
          </span>
          <div>
            <strong>{names[theme]}</strong>
            <span>
              <MapPin size={11} />
              São Paulo, SP
            </span>
          </div>
        </div>
        <p>Seu estilo, no seu tempo.</p>
      </div>
      <div className="shop-tabs">
        <span className="active">Serviços</span>
        <span>Detalhes</span>
        <span>Profissionais</span>
      </div>
      <div className="shop-services">
        {[
          ["Corte", "30 min", "R$ 35,00"],
          ["Barba", "30 min", "R$ 25,00"],
          ["Corte + barba", "60 min", "R$ 55,00"],
        ].map(([name, time, price]) => (
          <div className="shop-service" key={name}>
            <Scissors size={17} />
            <div>
              <strong>{name}</strong>
              <span>
                {price} <small>· {time}</small>
              </span>
            </div>
            <span className="shop-book">Agendar</span>
          </div>
        ))}
      </div>
      <div className="shop-powered">
        Feito com <b>FIO</b>
        <span>Demonstração</span>
      </div>
    </div>
  );
}

export function TeamPreview() {
  return (
    <div className="team-preview">
      <div className="preview-top">
        <strong>Profissionais</strong>
        <Users size={18} />
      </div>
      {[
        ["LM", "Lucas Martins", "Responsável"],
        ["AC", "André Carvalho", "Barbeiro"],
      ].map(([initial, name, role]) => (
        <div className="team-row" key={name}>
          <span className="avatar">{initial}</span>
          <div>
            <strong>{name}</strong>
            <small>{role}</small>
          </div>
          <Check size={15} />
        </div>
      ))}
      <div className="client-record">
        <span className="eyebrow">CLIENTES</span>
        <strong>Rafael Mendes</strong>
        <span>
          <Clock3 size={14} />
          Próximo horário · 29 set., 09:00
        </span>
      </div>
      <span className="demo-label">Dados de demonstração</span>
    </div>
  );
}
