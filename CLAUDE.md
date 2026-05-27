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
    routes/        # HTTP: auth, searches, library, exports, curated, billing
    services/      # Lógica: search-service, synthesis-service, citation-validator,
                   #         library-service, export-service
    middleware/    # auth (JWT), tier-limits (quotas diárias por plano)
    db/            # Cliente PostgreSQL + migrations
    lib/           # Externos: pubmed, europepmc, crossref, unpaywall, clinicaltrials,
                   #           claude, stripe, http (helpers), config
    prompts/       # Prompts Claude versionados (pico, relevance, synthesis)
  migrations/      # SQL migrations (001 schema, 002 billing)
  scripts/         # seed-curated.ts (npm run seed:curated)
frontend/
  src/
    pages/         # NewSearchPage, SearchResultsPage, History, Library, Curated, Billing, Login
    lib/           # Cliente API
```

## Pipeline de retrieval (search-service)

PubMed é a fonte de verdade. Europe PMC complementa (só PMIDs novos), Unpaywall marca
open-access, ClinicalTrials.gov entra como secção separada de trials (não citáveis na
síntese, porque não têm PMID). Fontes externas além do PubMed são best-effort: se
falharem, o resultado PubMed completa na mesma.

## Billing & limites

Limites diários por tier (trial=5, clinical=50, pro=∞) em `middleware/tier-limits.ts`,
lidos da DB (não do JWT). Webhook Stripe em `/api/billing/webhook` (raw body, registado
antes do `express.json`). Tudo no-op gracioso se `STRIPE_*` não estiver configurado.

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
