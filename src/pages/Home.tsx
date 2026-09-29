import { useState } from "react";
import {
  CalendarDays,
  Check,
  Globe2,
  Radio,
  Scissors,
  Smartphone,
  Users,
  Wifi,
} from "lucide-react";
import { links } from "../data/config";
import {
  Agenda,
  ProductPreview,
  ShopPreview,
  TeamPreview,
  type ShopTheme,
} from "../components/ProductPreview";
import { Pricing } from "../components/Pricing";
import { Faq } from "../components/Faq";

function BrandingPreview() {
  const [theme, setTheme] = useState<ShopTheme>("studio");
  return (
    <div className="branding-demo">
      <div
        className="brand-chooser"
        role="group"
        aria-label="Exemplos de identidade da barbearia"
      >
        {(["studio", "classic", "solo"] as const).map((item, i) => (
          <button
            key={item}
            aria-pressed={theme === item}
            className={theme === item ? "active" : ""}
            onClick={() => setTheme(item)}
          >
            <span className={`swatch swatch-${item}`} />
            {["Studio", "Clássica", "Solo"][i]}
          </button>
        ))}
      </div>
      <ShopPreview theme={theme} />
      <p className="preview-caption">
        A mesma estrutura. Uma identidade que é sua.
      </p>
    </div>
  );
}

export function Home() {
  return (
    <main id="conteudo">
      <section className="hero container" aria-labelledby="hero-title">
        <div className="hero-copy">
          <span className="eyebrow hero-eyebrow">
            <span className="fine-line" /> FEITO PARA BARBEARIAS. E PARA VOCÊ.
          </span>
          <h1 id="hero-title">
            Agenda, <span className="keep-together">site e app.</span>
            <br />
            <span>Sua barbearia</span>
            <br />
            em um só lugar.
          </h1>
          <p>
            Organize horários, apresente seus serviços e receba agendamentos em
            um espaço com a marca da sua barbearia.
          </p>
          <div className="hero-actions">
            <a className="button" href={links.signup}>
              Começar grátis
            </a>
            <a className="button outline" href="#produto">
              Conhecer o FIO
            </a>
          </div>
          <span className="hero-note">Comece com o FREE. Sem mensalidade.</span>
        </div>
        <ProductPreview />
      </section>
      <div className="value-strip">
        <div className="container">
          <span>Seu dia a dia, conectado.</span>
          <ul>
            <li>
              <CalendarDays />
              Agenda online
            </li>
            <li>
              <Globe2 />
              Site personalizado
            </li>
            <li>
              <Smartphone />
              App do cliente
            </li>
            <li>
              <Users />
              Equipe organizada
            </li>
          </ul>
        </div>
      </div>
      <section className="section container problem-section">
        <div>
          <span className="eyebrow">MENOS MENSAGENS. MAIS ORGANIZAÇÃO.</span>
          <h2>
            “Tem horário
            <br />
            para hoje?”
          </h2>
        </div>
        <div className="problem-copy">
          <p className="lead">
            A resposta não precisa
            <br />
            depender de uma conversa.
          </p>
          <p>
            Mensagens acumulam. O cliente espera. E sua agenda fica espalhada
            entre conversas e anotações.
          </p>
          <p>
            No FIO, serviços, profissionais e horários ficam no mesmo lugar. Seu
            cliente escolhe. Você acompanha a agenda.
          </p>
        </div>
      </section>
      <section id="produto" className="product-section">
        <div className="container">
          <div className="feature-row">
            <div className="feature-copy">
              <span className="eyebrow">01 / SUA ROTINA</span>
              <h2>
                Cada horário
                <br />
                no lugar certo.
              </h2>
              <p>
                O cliente escolhe profissional, serviço e um horário disponível.
                O novo agendamento entra na agenda da equipe.
              </p>
              <ul className="check-list">
                <li>
                  <Check />
                  Atendimentos organizados por dia
                </li>
                <li>
                  <Check />
                  Filtro por profissional
                </li>
                <li>
                  <Check />
                  Confirmação, remarcação e status
                </li>
              </ul>
            </div>
            <figure className="feature-visual">
              <Agenda />
              <figcaption>
                Agenda baseada na interface do FIO. Dados ilustrativos.
              </figcaption>
            </figure>
          </div>
          <div className="realtime">
            <Radio size={20} />
            <h3>Agendou. Apareceu.</h3>
            <p>
              Novos agendamentos podem aparecer no painel sem recarregar a
              página, quando a conexão permitir.
            </p>
            <span className="live">
              <i />
              Atualização automática
            </span>
          </div>
          <div className="feature-row reverse">
            <div className="feature-copy">
              <span className="eyebrow">02 / SUA PRESENÇA</span>
              <h2>
                Seu link.
                <br />
                Sua marca.
                <br />
                <span className="muted">Seus horários.</span>
              </h2>
              <p>
                Um site para apresentar sua barbearia: serviços, valores,
                profissionais, contato e localização. Tudo acessível pelo seu
                link público.
              </p>
              <p className="small-copy">
                Personalize logo, capa, fundo, cor de destaque, nome e
                descrição.
              </p>
            </div>
            <BrandingPreview />
          </div>
          <div className="feature-row app-feature">
            <div className="feature-copy">
              <span className="eyebrow">03 / SEU CLIENTE</span>
              <h2>
                Sua barbearia.
                <br />
                Na tela inicial.
              </h2>
              <p>
                Uma experiência com a sua identidade, para o cliente encontrar
                serviços e acessar seus agendamentos.
              </p>
              <p className="small-copy">
                O app é instalado pelo navegador como PWA, nos aparelhos
                compatíveis. O portal orienta cada etapa da instalação.
              </p>
              <div className="inline-label">
                <Smartphone size={18} />
                <span>Do link para a tela do cliente.</span>
              </div>
            </div>
            <figure className="phone-stage">
              <div className="phone-outline">
                <div className="phone-status">
                  <span>9:41</span>
                  <Wifi size={14} />
                </div>
                <ShopPreview phone />
              </div>
              <figcaption>Prévia ilustrativa do app da barbearia.</figcaption>
            </figure>
          </div>
          <div className="feature-row reverse team-feature">
            <div className="feature-copy">
              <span className="eyebrow">04 / SEU ESPAÇO</span>
              <h2>
                A equipe alinhada.
                <br />
                Os clientes por perto.
              </h2>
              <p>
                Cadastre os profissionais e serviços da barbearia. Mantenha os
                clientes organizados e acompanhe quem atende cada horário.
              </p>
              <p className="small-copy">
                Pacotes de cortes para clientes também estão disponíveis nos
                planos pagos, conforme os limites de cada plano.
              </p>
            </div>
            <TeamPreview />
          </div>
        </div>
      </section>
      <section className="solo-section">
        <div className="container solo-inner">
          <div>
            <span className="eyebrow">
              UM PROFISSIONAL. UM ESPAÇO COMPLETO.
            </span>
            <h2>
              Trabalha sozinho?
              <br />O FIO também é seu.
            </h2>
            <p>
              Escolha o modo solo e organize os seus próprios serviços e
              horários. Sem precisar cadastrar uma equipe inteira.
            </p>
            <a className="text-link" href={links.signup}>
              Criar meu espaço
            </a>
          </div>
          <div className="solo-preview">
            <div className="solo-profile">
              <span className="avatar">LM</span>
              <div>
                <strong>Lucas Martins</strong>
                <span>Barbeiro independente</span>
              </div>
              <Scissors size={20} />
            </div>
            <div className="solo-menu">
              <span>
                <CalendarDays size={17} />
                Minha agenda
              </span>
              <span>
                <Scissors size={17} />
                Meus serviços
              </span>
              <span>
                <Users size={17} />
                Meus clientes
              </span>
            </div>
            <small>Seu espaço no FIO · Demonstração</small>
          </div>
        </div>
      </section>
      <section className="section container how-section" id="como-funciona">
        <div className="section-heading">
          <div>
            <span className="eyebrow">DO SEU JEITO, DESDE O COMEÇO</span>
            <h2>Três passos. E é seu.</h2>
          </div>
          <p>
            Prepare o espaço.
            <br />
            Depois, compartilhe.
          </p>
        </div>
        <ol className="steps">
          <li>
            <span>01</span>
            <div>
              <h3>Crie seu espaço.</h3>
              <p>Cadastre sua barbearia ou comece como profissional solo.</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>Defina a sua rotina.</h3>
              <p>Configure serviços, profissionais, horários e identidade.</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>Compartilhe seu link.</h3>
              <p>Apresente seu espaço aos clientes e receba agendamentos.</p>
            </div>
          </li>
        </ol>
      </section>
      <Pricing />
      <Faq />
      <section className="nfc-section container">
        <div className="nfc-heading">
          <span className="eyebrow">UMA IDEIA PARA O PRÓXIMO CAPÍTULO</span>
          <h2>
            FIO NFC <span>Em breve</span>
          </h2>
        </div>
        <p>
          Estamos pensando em levar sua marca para fora da tela: chaveiros 3D
          personalizados com NFC, para abrir sua agenda, site ou Instagram por
          aproximação.
        </p>
        <span className="nfc-note">
          Projeto futuro.
          <br />
          Ainda não disponível.
        </span>
      </section>
      <section className="final-cta">
        <div className="container">
          <span className="eyebrow">SEU PRÓXIMO HORÁRIO COMEÇA AQUI</span>
          <h2>
            Coloque sua
            <br className="mobile-only" /> barbearia no FIO.
          </h2>
          <p>Sua agenda organizada. Sua marca presente.</p>
          <div className="hero-actions">
            <a className="button" href={links.signup}>
              Começar grátis
            </a>
            <a className="text-link" href={links.login}>
              Já tenho conta
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
