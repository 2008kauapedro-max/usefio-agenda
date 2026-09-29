import { Plus } from "lucide-react";

const questions = [
  [
    "Preciso instalar alguma coisa?",
    "Para gerenciar sua barbearia, você pode acessar o FIO pelo navegador. Para os clientes, o portal oferece a instalação do app da barbearia como PWA, quando o aparelho e o navegador permitem. No fluxo público atual, a instalação é solicitada antes de continuar para o agendamento.",
  ],
  [
    "O FIO funciona no celular?",
    "Sim. A agenda, os serviços e a experiência do cliente têm interfaces para celular. A instalação na tela inicial depende do suporte do navegador; no iPhone, o portal mostra as orientações para adicionar o app à tela de início.",
  ],
  [
    "Serve para quem trabalha sozinho?",
    "Sim. Na configuração inicial, você pode escolher o modo solo. Assim, o responsável é o próprio profissional, sem precisar montar uma equipe para começar.",
  ],
  [
    "Meu cliente precisa criar conta?",
    "Sim. O site público apresenta a barbearia e seus serviços. Para acessar a área do cliente e agendar, o fluxo atual encaminha para entrar ou criar uma conta vinculada à barbearia.",
  ],
  [
    "O que posso personalizar?",
    "Você pode configurar logo, capa, imagem de fundo, cor de destaque, nome e descrição. A página pública também apresenta serviços, profissionais e os dados de contato e localização informados pela barbearia.",
  ],
  [
    "Posso trocar de plano?",
    "O painel oferece a troca entre planos pagos. A mudança depende da situação da assinatura e das confirmações de cobrança. Você confere as condições da troca dentro do FIO antes de confirmar.",
  ],
  [
    "Como funciona o cancelamento?",
    "O painel permite cancelar a assinatura para impedir novas cobranças. Cancelar não significa receber automaticamente o período já pago de volta. A elegibilidade e o prazo para solicitar reembolso são apresentados no painel.",
  ],
  [
    "Existe uma opção gratuita?",
    "Sim. O FREE não tem mensalidade e inclui agenda e página pública, com até 100 clientes, 8 serviços e o responsável mais 1 profissional. Também existe um teste de 14 dias do PRO, ativado no painel uma única vez por barbearia no FREE.",
  ],
];
export function Faq() {
  return (
    <section className="section container faq-section" id="duvidas">
      <div>
        <span className="eyebrow">06 / SEM COMPLICAÇÃO</span>
        <h2>Antes de começar.</h2>
        <p>
          Respostas diretas para
          <br className="desktop-only" /> dúvidas do dia a dia.
        </p>
      </div>
      <div className="faq-list">
        {questions.map(([question, answer]) => (
          <details key={question}>
            <summary>
              {question}
              <Plus size={18} />
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
