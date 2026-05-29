# Instruções para o Claude Code neste projeto

> Este ficheiro é lido pelo Claude Code automaticamente. Mantém-no atualizado conforme o projeto evolui.

## Sobre o projeto

**EvidentiaDental** é um SaaS clínico que converte perguntas dentárias em evidência verificada do PubMed, com mini-síntese clínica gerada por LLM mas com citações validadas por arquitetura.

## Princípios não-negociáveis

### 1. O LLM nunca inventa identificadores

PMIDs, DOIs, nomes de papers — nunca saem do LLM. Saem sempre de uma chamada real a uma API (PubMed E-utilities, Crossref, etc).

Se vires código onde o LLM gera ou cita PMIDs sem que esses PMIDs venham de uma lista validada pelo backend, **isso é um bug crítico**.

### 2. Toda síntese clínica passa pelo validador

`src/services/citation-validator.ts` é a guardrail. Qualquer output de síntese:
- Tem que ter `[PMID xxxxx]` em cada afirmação factual
- Cada PMID citado tem que estar em `allowedPmids` (a lista dos papers selecionados)
- Se falhar, faz retry até 3 vezes com os erros como feedback

### 3. Rate-limiting do PubMed é sagrado

3 req/s sem API key, 10 req/s com. Nunca alterar o rate limiter sem confirmar com o NCBI. Se rebentarmos os limites, o IP do servidor pode ser bloqueado.

## Estrutura

```
backend/
  src/
    routes/        # HTTP: auth, searches, library, exports, billing
    services/      # Lógica: search-service, synthesis-service, citation-validator,
                   #         library-service, export-service
    middleware/    # auth (JWT), tier-limits (quotas diárias por plano)
    db/            # Cliente PostgreSQL + migrations
    lib/           # Externos: pubmed, europepmc, crossref, unpaywall, clinicaltrials,
                   #           claude, stripe, http (helpers), config
    prompts/       # Prompts Claude versionados (pico, relevance, synthesis)
  migrations/      # SQL migrations (001 schema, 002 billing)
frontend/
  src/
    pages/         # NewSearchPage, SearchResultsPage, History, Library, Billing, Login
    lib/           # Cliente API
```

## Pipeline de retrieval (search-service)

PubMed é a fonte de verdade. Europe PMC complementa (só PMIDs novos), Unpaywall marca
open-access, ClinicalTrials.gov entra como secção separada de trials (não citáveis na
síntese, porque não têm PMID). Fontes externas além do PubMed são best-effort: se
falharem, o resultado PubMed completa na mesma.

## Acesso ao texto completo (PDFs)

`services/fulltext-service.ts` agrega vias **LEGAIS** para o full text, on-demand
(endpoint `GET /api/papers/:id/access`): open-access (Unpaywall / Open Access Button /
CORE), PubMed Central, acesso institucional do utilizador (LibKey / EZproxy, em
`users.libkey_library_id` / `ezproxy_prefix`), página do editor (DOI), e pedido aos
autores (ResearchGate / Scholar).

**Princípio não-negociável:** nunca integrar Sci-Hub nem qualquer fonte/mirror/proxy de
conteúdo pirateado, mesmo a pedido. É ilegal, é risco para um produto comercial, e
contradiz o posicionamento. Se for pedido, recusar e oferecer as vias legais acima.

## Biblioteca: pastas (collections) e PDFs

Pastas são linhas em `collections` (uma por user, `name` único, com `'Inbox'` como
default). `library_items.collection_id` aponta para a pasta; apagar uma pasta move os
artigos para o Inbox (`library-service.ts`). O PDF carregado pelo utilizador **não vai para
a BD** — vai para **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`); só guardamos `pdf_url/pdf_name/
pdf_size` no item. Upload é **direto do browser** (`@vercel/blob/client` → endpoint
`POST /api/library/blob-upload`, auth via JWT em `clientPayload`); o cliente confirma com
`POST /api/library/:id/pdf`. Apagar item/PDF apaga o blob (best-effort). No-op gracioso se
`BLOB_READ_WRITE_TOKEN` não estiver configurado. PDFs **open access** são **materializados no
Blob** on-demand (`POST /api/library/:id/materialize-oa`: vai buscar ao `papers.oa_pdf_url`,
valida que os bytes começam por `%PDF`, guarda no Blob do utilizador e anexa via `attachPdf`); o
frontend dispara isto por item ao abrir a biblioteca, e o link externo "PDF grátis" fica só como
fallback enquanto o ficheiro não chega. Objetivo: OA aparece como ficheiro anexo (com tamanho),
não como link para o site do artigo.

## Camada social (colegas)

Grafo de **seguir direcional** (`follows`, `follower_id → followee_id`) — **instantâneo, sem
aprovação**. Visibilidade é direcional: se eu te sigo e tu tens `share_library_activity` ligado,
vejo os teus saves no feed (`friends-service.ts` → `GET /api/friends/activity`). Listas em
`GET /api/friends/following` e `/followers` (com `follows_me`/`i_follow` para o "seguir de volta").
Importar para a biblioteca: `POST /api/friends/import` (reusa `addToLibrary`). No import, se o
artigo for **open access** e o colega tiver um PDF carregado, o backend **copia o ficheiro para um
blob próprio do importador** (`getImportablePdf` faz o gate de OA + seguir; `copyPdfBlob`), para a
cópia ficar independente — se o colega apagar o dele, o teu não parte. **Paywalled nunca é
copiado.** Pedir PDF (modelo reprint) **exige seguimento mútuo**. Tudo é **opt-in**
(`users.share_library_activity`, `accept_pdf_requests`, `discoverable`, geridos no Perfil); a
`note` privada **nunca** é exposta — só o facto do save e a data, e o **email nunca** é mostrado a
outros utilizadores. Perfil tem foto (`users.avatar_url`, no Blob via prefixo `avatars/`), cidade,
nome, especialidade.

**Princípio não-negociável (PDFs paywalled):** a plataforma **nunca move, serve, aloja ou
relaya** um PDF paywalled entre utilizadores — isso é redistribuição e é o que afundou o
ResearchGate. A bifurcação por artigo é obrigatória:
- **Open access** (`papers.is_open_access`) → servido pela via legal de sempre (`fulltext-service`
  / `GET /api/papers/:id/access`).
- **Paywalled que um colega tem** → só registamos o pedido (`pdf_requests`) e devolvemos um
  **deep-link externo** (WhatsApp/email — o clássico "pedido de reprint"); o ficheiro viaja
  peer-to-peer, fora da plataforma. O backend rejeita pedidos de PDF sem seguimento mútuo, para
  artigos OA, e para quem não tem o ficheiro ou não fez opt-in. O pedido aparece tanto no feed/
  perfil como na **Biblioteca** (o `listLibrary` indica, por item, um colega de seguimento mútuo
  que tem o PDF e aceita pedidos).

Este princípio é irmão da regra anti-Sci-Hub acima: a fronteira é sempre *quem* move os bytes
e *com que propósito*. Se for pedido para a plataforma transferir o ficheiro paywalled (mesmo
"só entre amigos", mesmo com clique do utilizador), **recusar** e oferecer o modelo reprint.

## Billing & limites

**Um único plano pago** (mesmas funcionalidades), cobrado **mensal (9,90€)** ou **anual
(99€)** via **Stripe Payment Links** (`STRIPE_LINK_MONTHLY` / `STRIPE_LINK_ANNUAL`).
`/api/billing/checkout` devolve o link com `client_reference_id=<userId>` + `prefilled_email`;
o webhook usa o `client_reference_id` para ligar o Stripe customer ao utilizador e marcar
`paid`. Limite **mensal** de buscas por tier em `middleware/tier-limits.ts`
(trial=10, paid=30), lido da DB. Janela mensal (não diária) porque o uso é em rajadas.
Webhook Stripe em `/api/billing/webhook` (raw body, antes do `express.json`). Tudo no-op
gracioso se `STRIPE_*` não estiver configurado.

## Funil de marketing (n8n + MailerLite)

`src/lib/marketing.ts` emite eventos do funil para um webhook do n8n (`N8N_WEBHOOK_URL`,
no-op gracioso se não configurado). O n8n faz upsert do subscritor no MailerLite e atribui-o
ao grupo da etapa; as automações do MailerLite (gatilho = entrada no grupo) enviam os emails.
Eventos: `signup` (auth), `checkout_started` (billing) e, via webhook Stripe, `trial_started`,
`trial_will_end`, `trial_canceled`, `subscription_active`, `payment_failed`,
`subscription_canceled`, `checkout_abandoned` (de `checkout.session.expired`). Detalhes e
passos de setup em `docs/marketing-funnel.md`. **Princípio:** uma falha de marketing nunca
pode partir um signup ou um webhook Stripe — `emitFunnelEvent` engole erros.

## Workflow típico ao adicionar uma feature

1. **Schema:** se precisar de DB change, criar migration com `npm run migrate:create nome_da_feature`
2. **Service:** lógica em `src/services/*.ts`
3. **Route:** expor em `src/routes/*.ts`
4. **Cliente API:** adicionar em `frontend/src/lib/api.ts`
5. **UI:** página/componente novo
6. **Smoke test:** correr backend + frontend e validar end-to-end

## Stack já em uso

- **DB:** PostgreSQL via `pg` driver direto (sem Prisma/Drizzle — keep it simple)
- **Validação:** Zod em todos os endpoints
- **Auth:** JWT simples, 30 dias
- **Frontend:** React 19, Vite, Tailwind, react-query, react-router

## Comandos úteis

```bash
# Backend
cd backend && npm run dev          # arrancar dev server
cd backend && npm run migrate      # correr migrations pendentes
cd backend && npm run typecheck    # validar tipos

# Frontend
cd frontend && npm run dev         # arrancar Vite
cd frontend && npm run typecheck
```

## Cuidados ao usar Claude para escrever código aqui

- **Não pedir ao Claude para "encontrar papers sobre X"** sem ir ao PubMed. Sempre via `pubmed.ts`.
- **Não pedir ao Claude para escrever queries SQL com dados literais** sem usar parameterized queries (`$1, $2, ...`). SQL injection.
- **Não esquecer de tracker `usage_events`** quando criares novo endpoint que use Claude API ou PubMed. Vai ser crítico para precificar.
- **Sempre usar o `withTransaction`** quando uma operação tocar em múltiplas tabelas.

## Decisões arquiteturais já tomadas

- **Não usar ORM pesado.** Queries SQL diretas com `pg`. Mais transparente, mais fácil de otimizar, e tu já conheces o padrão do DentalKPI.
- **Cache de papers globalmente.** A tabela `papers` é shared entre todos os utilizadores. Reduz chamadas ao PubMed.
- **Validação de síntese no backend, não no frontend.** Frontend só mostra resultado.
- **Prompts versionados em ficheiros separados.** Permite A/B test e analytics.

## Próximos passos no roadmap

Ver `docs/roadmap.md` para o plano semana-a-semana.
