# Landing FIO — refatoração de 02/10/2026

Implementação em `fio-marketing`. O ZIP fornecido e o workspace contêm as mesmas
versões da landing original e do catálogo de planos. O aplicativo, a autenticação,
o banco, o onboarding e o checkout não foram modificados.

## O que mudou

- Hero apresenta agenda, clientes e equipe e mostra a interface da agenda.
- Um único bloco claro reúne link público, serviços, equipe e modo solo.
- Três passos curtos; três planos do catálogo atual; quatro dúvidas expansíveis.
- Removidos os blocos repetidos de agenda, app/PWA, equipe, solo e NFC futuro.
- Interfaces reaproveitam a estrutura visual do produto, com dados fictícios
  explicitamente identificados. Não são capturas de contas reais.
- Menu móvel com Escape, fechamento ao navegar e restauração do foco.
- Seis idiomas: pt-BR, en, es, fr, de, it. Dicionário tipado e preferência de idioma
  seguem `src/i18n/config.ts` e a chave `fio:locale`. Valores permanecem em BRL.
- Estilos exclusivos do marketing; sem novas dependências de produção.

## Fonte dos planos

A antiga landing tinha uma cópia desatualizada dos preços. Agora importa diretamente
`shared/fio-plans.ts`, a mesma fonte de `FioPlans.tsx` e `server/syncpay.ts`:
FREE, PRO e PREMIUM; mensal e anual. Nenhuma regra de cobrança foi alterada.
Os limites e recursos também vêm desse catálogo e são traduzidos na apresentação.
CTAs mantêm `VITE_FIO_APP_URL` e os mesmos parâmetros de login/cadastro.

## Validação

- Typecheck: aplicativo e landing aprovados.
- Testes existentes: 27 arquivos, 245 testes aprovados antes e após a alteração.
- Build: aplicativo (frontend/backend) e landing aprovados.
- Avisos preexistentes no aplicativo: comentários de otimização do Zod e bundle
  acima de 500 kB. Não são erros de build.
- Navegador Edge/Playwright: seis larguras, seis idiomas com persistência,
  preços mensais/anuais, menu, Escape, accordions e destinos dos CTAs.
- Nenhum erro de JavaScript/console e nenhum overflow horizontal encontrado.
- Capturas revisadas visualmente em mobile, tablet e desktop.

| Largura | Altura anterior | Altura nova | Redução |
|---|---:|---:|---:|
| 360 | 10.302 px | 4.943 px | 52,0% |
| 390 | 10.258 px | 4.921 px | 52,0% |
| 430 | 10.192 px | 4.893 px | 52,0% |
| 768 | 9.075 px | 3.312 px | 63,5% |
| 1366 | 7.187 px | 3.277 px | 54,4% |
| 1920 | 7.230 px | 3.277 px | 54,7% |

Medição em português, mensal, com detalhes fechados e fontes carregadas.
Evidências: `docs/landing-evidence`; verificação reproduzível:
`node scripts/verify-landing.mjs` (landing na porta 5174).

## Limites e publicação

A verificação comercial termina nos destinos dos links: não foi criada conta,
realizado pagamento ou alterado ambiente de produção. Para publicar, o build
precisa do checkout completo com os arquivos compartilhados; ver README.
As páginas existentes de termos, privacidade e contato continuam disponíveis
com o conteúdo anterior, ainda sinalizado como pendente. Não foram criados
textos jurídicos nem canais de atendimento fictícios.
