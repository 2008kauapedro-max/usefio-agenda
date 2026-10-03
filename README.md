# FIO SaaS v2

Projeto novo e independente, criado em `work/fio-saas-v2`. Gestão de barbearias com interface em português, preto e branco, navegação mobile e assistentes separados para OWNER, BARBER e CLIENT.

## O que está implementado

- React + TypeScript + Vite; API Express + TypeScript; Supabase Auth e PostgreSQL.
- Cadastro, login por e-mail/senha, recuperação de senha e onboarding de barbearia ou cliente.
- OWNER cria uma barbearia FREE. Profissionais entram por convite de uso único (48 horas); clientes entram pelo identificador da barbearia ou por convite.
- Multi-tenant com memberships por barbearia, validação de token no servidor, RLS e chaves estrangeiras compostas.
- Catálogo de serviços, cadastro de clientes, equipe e convites.
- Agenda: consulta de horários, criação, conclusão e cancelamento; preço/duração calculados no banco; bloqueio de sobreposição por profissional.
- Planos de cortes de clientes, desconto de um corte ao concluir atendimento e registro manual de recebimento sem duplicidade.
- Total recebido na semana calculado no banco, no fuso da barbearia, disponível apenas ao OWNER.
- Chat reutilizável nos três perfis, sugestões, histórico, estados de erro/conexão/plano/limite e adaptador real de IA no servidor.
- FREE/PRO/PREMIUM com recursos e quotas configurados em tabelas protegidas.
- Demonstração explicitamente identificada, sem contas reais, sem chamadas ao provedor e sem fingir respostas da IA.

## Execução local

Requisitos: Node.js 22.12+ e npm. O modo de compatibilidade Windows usado nesta sessão requer Node.js 24.

```sh
npm ci
npm run dev
```

Abra `http://localhost:5173`. Sem variáveis do Supabase, a rota inicial abre `/demo/owner`. Também existem `/demo/barber` e `/demo/client`.

A demonstração usa dados fictícios em memória. Alterações duram apenas enquanto o perfil permanece aberto; recarregar ou trocar o perfil restaura os exemplos. Não é um backend alternativo e nunca autoriza acesso aos dados reais.

## Conectar Supabase

1. Crie um projeto Supabase novo ou utilize uma instância de desenvolvimento destinada a este aplicativo.
2. Copie `.env.example` para `.env` dentro desta pasta. Preencha URL e chave pública nos pares `VITE_SUPABASE_*` e `SUPABASE_*`.
3. Aplique as migrations em `supabase/migrations`, na ordem dos nomes, pelo SQL Editor ou pela CLI oficial. Para ambiente local, com Docker e Supabase CLI disponíveis: `supabase start` e `supabase db reset`. O reset apaga somente o banco local configurado; nunca o execute contra produção.
4. Configure em Supabase Auth as URLs de aplicação e recuperação. Desenvolvimento: `http://localhost:5173` e `http://localhost:5173/reset-password`. Para usar `127.0.0.1`, cadastre também essa origem. Em produção, substitua pelas URLs HTTPS definitivas.
5. Mantenha a confirmação de e-mail habilitada. Configure SMTP para envio confiável.
6. Reinicie o servidor. Variáveis `VITE_*` são incorporadas no build; refaça o build após alterá-las.

O backend não precisa de service role para o core. Ele envia o JWT validado ao Supabase em todas as consultas normais, mantendo RLS ativa. A service role é necessária apenas para persistir respostas do Assistente.

## Primeiro uso real

1. Cadastre uma conta e confirme o e-mail.
2. Escolha “Sou responsável” e crie a barbearia. O identificador é único, em letras minúsculas, números e hífens.
3. Cadastre serviços e clientes. Em Equipe, gere um convite para cada barbeiro. Não há envio automático de mensagens: compartilhe o código pelo canal de sua preferência.
4. O profissional cria a própria conta e escolhe “Tenho convite”. Um cliente pode escolher “Sou cliente” e informar o identificador da barbearia.
5. Crie agendamentos. O expediente inicial é segunda a sábado, 09h–19h, em `America/Sao_Paulo`.
6. Ao concluir um atendimento, um corte de assinatura ativa é utilizado, quando existir saldo. Em Financeiro, o OWNER pode registrar um valor recebido. Isso **não** cobra o cliente.

Uma conta tem um papel por barbearia. Nesta primeira versão, um OWNER cria no máximo uma barbearia; pode pertencer a outras com outros papéis. OWNER que também atende precisa de um vínculo profissional separado; papéis simultâneos estão no TODO.

## Configurar IA

Preencha somente no servidor:

- `AI_API_URL`: URL HTTPS completa de um endpoint que implemente o contrato Chat Completions.
- `AI_API_KEY`: segredo do provedor.
- `AI_MODEL`: modelo habilitado na conta do provedor.
- `SUPABASE_SERVICE_ROLE_KEY`: segredo Supabase usado exclusivamente para gravar mensagens após validar a conversa.

Contrato do adaptador: envia `{model,max_tokens,messages}` e espera `choices[0].message.content` como texto. Não utiliza ferramentas, navegação, execução de código ou ações de escrita. Timeout de 25 segundos, entrada de até 2.000 caracteres, saída de até 12.000 caracteres, histórico de até 12 mensagens.

O servidor resolve o usuário, membership, tenant, plano e dados autorizados. A IA recebe uma projeção pequena dos dados filtrados por RLS; não recebe tokens, e-mails, chaves ou identificadores internos de usuários. Dados e histórico são explicitamente tratados como conteúdo não confiável. Nenhuma chave de IA utiliza prefixo `VITE_`.

Planos iniciais: FREE desativado; PRO 100 solicitações/dia e 10/minuto; PREMIUM 500/dia e 20/minuto, por usuário e barbearia. Dias de quota seguem UTC. Tentativas que chegam ao provedor consomem quota mesmo quando o provedor falha, evitando abuso por retries. Configure esses valores em `plan_features`, usando administração confiável do banco. O frontend recebe `aiEnabled` calculado pelo servidor.

O checkout de planos SaaS ainda não foi integrado. Para testar PRO, um administrador do banco pode atualizar a assinatura da barbearia específica:

```sql
-- Substitua pelo UUID real do tenant de desenvolvimento.
update public.saas_subscriptions
set plan = 'PRO', status = 'active'
where barbershop_id = 'UUID-DA-BARBEARIA';
```

Jamais exponha essa atualização como uma operação livre do browser ou aceite um plano enviado pelo cliente. Ações futuras da IA devem ser adicionadas via propostas tipadas com autorização, revalidação, confirmação e idempotência; consulte `docs/ARCHITECTURE.md`.

## Build e testes

```sh
npm run typecheck
npm run test
npm run build
npm start
```

O último comando serve o build e a API em `http://127.0.0.1:3001`. O servidor escuta somente em loopback por padrão. Não foi publicado externamente.

Testes de interface reproduzíveis, com Microsoft Edge instalado:

```sh
npm run test:ui
```

Os testes de banco usam PGlite (PostgreSQL embarcado) e executam as migrations em `supabase/migrations` na ordem dos nomes, roles `anon`/`authenticated`/`service_role`, funções e políticas reais. O esquema `auth` é uma fixture de teste; o serviço Supabase Auth não é iniciado. A suíte não substitui testes com Supabase real, concorrência entre conexões ou um provedor de IA real.

### Ambiente Windows restrito

Neste ambiente, subprocessos auxiliares do Node falharam com `spawn EPERM`. O build e os testes passaram usando a implementação WebAssembly oficial do esbuild, dentro do próprio processo. Nenhuma proteção do sistema foi desativada.

```sh
node node_modules/typescript/bin/tsc --noEmit
node --import ./scripts/wasm-esbuild.mjs node_modules/vitest/vitest.mjs run --configLoader native
node --import ./scripts/wasm-esbuild.mjs node_modules/vite/bin/vite.js build --configLoader native
node node_modules/typescript/bin/tsc -p tsconfig.server.json
node --env-file-if-exists=.env scripts/start.mjs
```

Também existem `npm run build:portable` e `npm run test:portable` em ambientes onde o próprio npm consegue iniciar scripts. Caso a instalação padrão falhe em postinstall pelo mesmo motivo, `npm ci --ignore-scripts` pode ser usado para esse caminho WebAssembly. Use a instalação padrão em ambientes sem a restrição.

## Estrutura

```text
src/                     interface, autenticação e demonstração
src/components/          componentes de chat e interface
src/pages/               áreas e formulários
server/                  autenticação, API, consultas e provedor de IA
shared/                  tipos e validação dos contratos
supabase/migrations/     schema, RLS, operações e quotas
tests/                   integração PostgreSQL e segurança HTTP
tests/e2e/               cenários Playwright desktop/mobile
scripts/                 inicialização e compatibilidade Windows
docs/                    arquitetura e relatório de validação
TODO.md                  configurações externas e evolução pendente
```

Consulte `TODO.md` antes de utilizar em produção. O texto recebido nesta conversa cobria identidade visual, mobile e IA; nenhum outro “MASTER BUILD PROMPT” completo estava disponível no contexto. As decisões adicionais de core estão explicitadas aqui e na arquitetura.

Referências consultadas: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) e [validação de usuário via getUser](https://supabase.com/docs/reference/javascript/auth-getuser).

## Painel PLATFORM_ADMIN

Acesso em `/acesso/plataforma`, separado de OWNER/BARBER/CLIENT. Consulte `docs/PLATFORM-ADMIN.md` para migration, permissões, validações e ativação. O vínculo de um usuário Auth existente está em `supabase/register-existing-platform-admin.sql`; nenhuma senha é necessária no código.
