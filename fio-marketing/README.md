# fio-marketing

Frontend público do FIO. Requer Node.js 22.12+ e o checkout completo deste
repositório: a landing lê o catálogo de `../shared/fio-plans.ts` e as convenções
de idioma de `../src/i18n/config.ts`, sem importar o aplicativo ou seu backend.

```sh
npm ci
cp .env.example .env
npm run dev
```

No PowerShell, use `Copy-Item .env.example .env`.
Configure `VITE_FIO_APP_URL` antes do build; não coloque credenciais no `.env`.

```sh
npm run typecheck
npm run build
npm run preview
```

Publique `dist/`. Na Vercel, use este diretório como raiz; `vercel.json` prepara
o redirecionamento de www e as rotas. O ambiente de build deve disponibilizar os
arquivos compartilhados acima (na Vercel, habilite a inclusão de arquivos de fora
do Root Directory). Em outra hospedagem, configure o equivalente.
Pendências e fontes: [ENTREGA.md](ENTREGA.md).

Para repetir a verificação de layout e interações, execute a landing na porta
5174 e, na raiz do repositório, rode `node scripts/verify-landing.mjs`.
O script usa Playwright com Edge e salva evidências em `docs/landing-evidence`.
