import type { ReactNode } from "react";
import { ExternalLink, MessageCircle, ShieldCheck } from "lucide-react";
import { links, publicInfo } from "../data/config";

function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="legal-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Terms() {
  return (
    <>
      <p className="information-intro">
        Estes Termos explicam as regras gerais de uso do FIO, um serviço digital
        para organização de barbearias e profissionais independentes. Ao criar e
        utilizar uma conta, você concorda com estas condições e com as regras
        apresentadas no próprio aplicativo no momento de cada ação.
      </p>

      <LegalSection title="1. O que é o FIO">
        <p>
          O FIO oferece recursos de agenda, serviços, profissionais, clientes,
          página pública, personalização e outros recursos disponibilizados de
          acordo com o plano contratado. Algumas funções dependem de conexão com
          a internet, navegador compatível e integrações de terceiros.
        </p>
      </LegalSection>

      <LegalSection title="2. Conta e informações cadastradas">
        <ul className="legal-list">
          <li>Você deve fornecer informações verdadeiras e manter seus dados atualizados.</li>
          <li>O acesso à conta é pessoal e não deve ser compartilhado de forma insegura.</li>
          <li>O responsável pela barbearia deve administrar corretamente acessos da equipe.</li>
          <li>O uso do FIO deve respeitar a legislação aplicável e os direitos de terceiros.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Planos e teste gratuito">
        <p>
          O FIO possui plano gratuito e planos pagos. Preços, limites e recursos
          vigentes são exibidos na página de planos e novamente no aplicativo
          antes da contratação. O plano PRO pode oferecer teste de 14 dias,
          ativado pelo painel uma única vez por barbearia elegível no plano FREE.
        </p>
      </LegalSection>

      <LegalSection title="4. Pagamentos e renovação">
        <p>
          As cobranças dos planos pagos são processadas por provedor de pagamento
          integrado ao FIO. O acesso pago é liberado somente após a confirmação
          do pagamento. Quando a contratação for recorrente, novas cobranças podem
          ocorrer conforme o período escolhido até o cancelamento da renovação.
        </p>
        <p>
          O FIO pode armazenar referências técnicas, situação da assinatura e
          informações necessárias para conciliação, segurança e suporte, sem
          armazenar dados bancários completos do usuário.
        </p>
      </LegalSection>

      <LegalSection title="5. Cancelamento e reembolso">
        <p>
          O cancelamento impede novas cobranças futuras da assinatura, mas não
          gera automaticamente reembolso de um período já pago.
        </p>
        <p>
          Nas contratações online em que o direito de arrependimento previsto na
          legislação brasileira for aplicável, o pedido realizado dentro do prazo
          legal poderá resultar na devolução integral da primeira contratação.
          Fora dessa hipótese, eventuais reembolsos dependem da situação concreta,
          das regras informadas no painel e de direitos que não possam ser
          afastados por estes Termos.
        </p>
      </LegalSection>

      <LegalSection title="6. Dados de clientes da barbearia">
        <p>
          A barbearia ou profissional que utiliza o FIO é responsável por usar de
          forma adequada os dados de seus próprios clientes. O FIO fornece a
          infraestrutura para armazenamento e tratamento necessário ao
          funcionamento do serviço, conforme a Política de Privacidade.
        </p>
      </LegalSection>

      <LegalSection title="7. Uso indevido">
        <p>Não é permitido utilizar o FIO para:</p>
        <ul className="legal-list">
          <li>fraude, abuso, spam ou atividades ilícitas;</li>
          <li>tentar acessar dados ou contas de outros usuários sem autorização;</li>
          <li>interferir na segurança, disponibilidade ou funcionamento da plataforma;</li>
          <li>copiar, explorar ou redistribuir partes protegidas do serviço de forma não autorizada.</li>
        </ul>
      </LegalSection>

      <LegalSection title="8. Disponibilidade e alterações">
        <p>
          O FIO pode receber correções, melhorias e alterações de recursos ao
          longo do tempo. Interrupções temporárias podem ocorrer por manutenção,
          falhas de terceiros, indisponibilidade de rede ou eventos fora do
          controle razoável do serviço. Quando uma alteração afetar de forma
          relevante uma contratação ativa, a comunicação adequada será feita no
          aplicativo ou por canal oficial.
        </p>
      </LegalSection>

      <LegalSection title="9. Propriedade intelectual">
        <p>
          A marca FIO, a interface, o código e os materiais próprios da plataforma
          permanecem protegidos pelos direitos aplicáveis. Conteúdos enviados pela
          barbearia, como logo, fotos e textos, continuam sob responsabilidade de
          quem os fornece e devem possuir autorização de uso.
        </p>
      </LegalSection>

      <LegalSection title="10. Direitos previstos em lei">
        <p>
          Estes Termos não eliminam direitos obrigatórios previstos na legislação
          aplicável. Caso alguma cláusula seja considerada inválida em uma situação
          específica, as demais condições continuam valendo na medida permitida.
        </p>
      </LegalSection>

      <LegalSection title="11. Atualizações destes Termos">
        <p>
          Estes Termos podem ser atualizados para refletir mudanças no produto,
          integrações ou exigências legais. A versão vigente será disponibilizada
          nesta página com indicação da data de atualização.
        </p>
      </LegalSection>

      <LegalSection title="12. Contato">
        <p>
          Dúvidas sobre estes Termos podem ser enviadas pelos canais oficiais do
          FIO indicados na página de contato. Usuários com conta também podem usar
          a área de Ajuda e suporte no painel.
        </p>
      </LegalSection>
    </>
  );
}

function Privacy() {
  return (
    <>
      <p className="information-intro">
        Esta Política explica, de forma resumida e transparente, como o FIO trata
        dados pessoais para disponibilizar contas, agenda, suporte, segurança e
        cobrança. O tratamento concreto pode variar conforme o recurso utilizado
        e a relação entre o FIO, a barbearia e o cliente final.
      </p>

      <LegalSection title="1. Papéis no tratamento de dados">
        <p>
          Para dados necessários à própria conta FIO, autenticação, cobrança,
          segurança e suporte, o FIO toma decisões sobre o tratamento necessário
          ao funcionamento da plataforma. Já nos dados de clientes cadastrados e
          administrados por uma barbearia, o FIO atua, em muitos fluxos, como
          fornecedor de tecnologia que processa informações para que a barbearia
          ofereça seus serviços.
        </p>
      </LegalSection>

      <LegalSection title="2. Dados que podem ser tratados">
        <ul className="legal-list">
          <li>nome, e-mail, telefone e identificadores de conta;</li>
          <li>dados da barbearia, equipe, serviços, horários e configurações;</li>
          <li>dados necessários a agendamentos, clientes e histórico operacional;</li>
          <li>informações de assinatura, plano, pagamento e status da cobrança;</li>
          <li>registros técnicos de segurança, acesso, dispositivo e falhas;</li>
          <li>mensagens enviadas ao suporte e feedback fornecido pelo usuário.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Para que usamos esses dados">
        <ul className="legal-list">
          <li>criar, autenticar e proteger contas;</li>
          <li>entregar agenda, serviços, página pública e demais funções contratadas;</li>
          <li>processar cobranças e administrar assinaturas;</li>
          <li>prevenir abuso, fraude e acesso não autorizado;</li>
          <li>prestar suporte e corrigir problemas técnicos;</li>
          <li>cumprir obrigações legais e exercer direitos quando necessário.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Bases para o tratamento">
        <p>
          Conforme a situação, o tratamento pode ocorrer para execução de contrato
          ou procedimentos relacionados ao serviço, cumprimento de obrigação legal,
          proteção da segurança da plataforma, exercício regular de direitos,
          interesses legítimos compatíveis com a relação ou consentimento quando
          essa for a base adequada.
        </p>
      </LegalSection>

      <LegalSection title="5. Fornecedores e integrações">
        <p>
          O FIO utiliza provedores de infraestrutura e serviços para operar a
          plataforma. Entre as integrações atualmente utilizadas estão Supabase
          para serviços de backend e banco de dados, Vercel para hospedagem,
          Cloudflare Turnstile para proteção contra abuso, Google quando o usuário
          opta por autenticação compatível e SyncPay para fluxos de pagamento.
        </p>
        <p>
          Esses fornecedores tratam dados conforme suas próprias responsabilidades,
          contratos e políticas aplicáveis. O FIO procura limitar o compartilhamento
          ao necessário para cada função.
        </p>
      </LegalSection>

      <LegalSection title="6. Pagamentos">
        <p>
          Informações necessárias para identificar o pagador e processar uma
          cobrança são enviadas ao provedor de pagamento. O FIO mantém os dados e
          referências necessários para acompanhar a assinatura e o status da
          transação, sem armazenar dados bancários completos.
        </p>
      </LegalSection>

      <LegalSection title="7. Armazenamento e retenção">
        <p>
          Os dados são mantidos pelo tempo necessário para prestar o serviço,
          preservar segurança e histórico operacional, cumprir obrigações legais e
          resolver disputas. Os prazos variam conforme o tipo de informação e a
          finalidade do tratamento.
        </p>
      </LegalSection>

      <LegalSection title="8. Segurança">
        <p>
          O FIO adota controles técnicos e organizacionais para reduzir riscos de
          acesso indevido, alteração, perda ou exposição. Nenhum sistema conectado
          à internet oferece risco zero, por isso medidas de prevenção, atualização
          e monitoramento são mantidas continuamente.
        </p>
      </LegalSection>

      <LegalSection title="9. Seus direitos">
        <p>
          Quando aplicável, o titular pode solicitar informações, confirmação de
          tratamento, acesso, correção e outras providências previstas na legislação
          de proteção de dados. Pedidos podem ser encaminhados pelo canal público de
          contato do FIO. Para proteger o titular, poderá ser necessário confirmar a
          identidade antes de atender determinadas solicitações.
        </p>
      </LegalSection>

      <LegalSection title="10. Cookies e armazenamento local">
        <p>
          O site e o aplicativo podem utilizar cookies, armazenamento local e
          tecnologias equivalentes estritamente necessárias para sessão,
          autenticação, preferências, segurança e funcionamento da experiência.
          Serviços integrados também podem usar mecanismos próprios conforme suas
          políticas.
        </p>
      </LegalSection>

      <LegalSection title="11. Transferências e infraestrutura internacional">
        <p>
          Alguns fornecedores de tecnologia podem processar ou armazenar dados em
          infraestrutura localizada fora do Brasil. Quando isso ocorrer, o FIO
          utiliza serviços reconhecidos e busca adotar medidas compatíveis com a
          proteção exigida para o tratamento.
        </p>
      </LegalSection>

      <LegalSection title="12. Atualizações e contato">
        <p>
          Esta Política pode ser atualizada conforme o produto evolui. A versão
          vigente ficará disponível nesta página. Dúvidas e solicitações de
          privacidade podem ser enviadas pela página de contato ou, para usuários
          autenticados, pela área de Ajuda e suporte do FIO.
        </p>
      </LegalSection>
    </>
  );
}

function Contact() {
  return (
    <>
      <p className="information-intro">
        Escolha o canal que faz sentido para você. Para dúvidas comerciais antes
        de criar uma conta, o canal público atual é o Instagram oficial do FIO.
        Quem já utiliza o produto também conta com Ajuda e suporte dentro do painel.
      </p>
      <div className="contact-grid">
        <a
          className="contact-card"
          href={links.contact}
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle size={20} />
          <div>
            <small>CONTATO PÚBLICO</small>
            <strong>{publicInfo.instagramHandle}</strong>
            <span>Falar pelo Instagram</span>
          </div>
          <ExternalLink size={16} />
        </a>
        <a className="contact-card" href={links.login}>
          <ShieldCheck size={20} />
          <div>
            <small>JÁ USA O FIO?</small>
            <strong>Ajuda e suporte</strong>
            <span>Entre no painel para enviar sua solicitação.</span>
          </div>
          <ExternalLink size={16} />
        </a>
      </div>
      <p className="contact-note">
        Solicitações relacionadas a privacidade e dados pessoais também podem ser
        iniciadas por estes canais. Para sua segurança, poderemos solicitar a
        confirmação da identidade ou da conta relacionada ao pedido.
      </p>
    </>
  );
}

export function Information({ page }: { page: string }) {
  const privacy = page === "/privacidade";
  const terms = page === "/termos";
  const contact = page === "/contato";
  const found = privacy || terms || contact;

  return (
    <main className="container information-page" id="conteudo">
      <a className="text-link" href="/">
        Voltar para o FIO
      </a>
      <span className="eyebrow">FIO / INFORMAÇÕES</span>
      <h1>
        {privacy
          ? "Política de privacidade"
          : terms
            ? "Termos de uso"
            : contact
              ? "Fale com o FIO"
              : "Página não encontrada"}
      </h1>
      {found && !contact && (
        <p className="legal-updated">
          Última atualização: {publicInfo.effectiveDate}
        </p>
      )}
      {privacy ? (
        <Privacy />
      ) : terms ? (
        <Terms />
      ) : contact ? (
        <Contact />
      ) : (
        <p>
          Este endereço não existe.{" "}
          <a className="text-link" href="/">
            Voltar à página inicial
          </a>
          .
        </p>
      )}
    </main>
  );
}
