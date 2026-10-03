import { links } from "../data/config";

export function Information({ page }: { page: string }) {
  const privacy = page === "/privacidade";
  const terms = page === "/termos";
  const contact = page === "/contato";
  return (
    <main className="container information-page" id="conteudo">
      <a className="text-link" href="/">
        Voltar para o FIO
      </a>
      <span className="eyebrow">FIO / INFORMAÇÕES</span>
      <h1>
        {privacy
          ? "Privacidade"
          : terms
            ? "Termos de uso"
            : contact
              ? "Fale com o FIO"
              : "Página não encontrada"}
      </h1>
      {privacy || terms ? (
        <>
          <p className="information-notice">
            Página em preparação. O documento público completo ainda não foi
            publicado.
          </p>
          <p>
            O aplicativo contém orientações iniciais sobre{" "}
            {privacy
              ? "uso de dados e privacidade"
              : "contas, agendamentos e uso responsável"}
            . Você pode consultá-las na área de Ajuda e suporte após entrar.
          </p>
          <p>
            Esta página não substitui uma política de privacidade ou os termos
            comerciais do serviço.
          </p>
          <a className="button" href={links.login}>
            Entrar no FIO
          </a>
        </>
      ) : contact ? (
        <>
          <p>O canal público de contato será divulgado aqui em breve.</p>
          <p>
            Já usa o FIO? Acesse o formulário de suporte na área de Ajuda e
            suporte do seu painel.
          </p>
          <a className="button" href={links.login}>
            Acessar meu painel
          </a>
        </>
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
