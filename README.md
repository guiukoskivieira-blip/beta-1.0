# ArteCheck AI — Preflight Beta

Aplicação de análise determinística de PDFs para pré-impressão, com perfis de produção, Rule Engine explicável, relatório operacional e camada técnica detalhada.

## Rodar localmente

```bash
npm install
npm run dev
```

A aplicação e o backend Express usam a porta `3000`.

## Validar

```bash
npm run check
```

Esse comando executa testes, TypeScript e build de produção.

## Endpoints

- `GET /api/health` — health check.
- `POST /api/upload` — análise determinística completa.
- `POST /api/diagnose` — diagnóstico leve do processamento.
- `POST /api/assistant` — camada explicativa opcional, exige `GEMINI_API_KEY`.

## Arquitetura

O processamento pesado do PDF ocorre no backend. O frontend recebe apenas o resultado JSON sanitizado.

O núcleo determinístico deve permanecer independente de autenticação, banco, cobrança e IA generativa.

A preparação para persistência SaaS está em `src/storage/StorageProvider.ts`, atualmente com `LocalStorageProvider`.

## QA manual

PDFs controlados estão em:

`tests/fixtures/manual/`

Use esses arquivos para smoke tests antes de publicar uma nova versão.

## Documentação

- `docs/BETA_READINESS.md`
- `docs/DEPLOY.md`
