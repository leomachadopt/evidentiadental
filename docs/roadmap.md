# Roadmap — 12 semanas

> Plano realista para tu, Leonardo, com Claude Code em Cursor.
> Cada semana = 1 milestone testável.

## Mês 1 — Núcleo verificável

### Semana 1 — Setup + auth
- [x] Estrutura de pastas (já criado no scaffolding)
- [x] Schema PostgreSQL + sistema de migrations
- [ ] Setup do Neon: criar projeto novo `evidentia-dental`
- [ ] Correr `npm run migrate` contra o Neon
- [ ] Testar auth (register/login) via Postman ou curl
- [ ] Deploy preview no Vercel (frontend) + Railway (backend)
- [ ] Obter NCBI API key em https://www.ncbi.nlm.nih.gov/account/

**Critério de pronto:** consigo criar conta, fazer login, e o frontend mostra a página de Nova Busca.

### Semana 2 — Pipeline PubMed end-to-end
- [x] Cliente PubMed (esearch + efetch + rate limiter)
- [x] Prompt PICO
- [x] Service `createSearch` + `executeSearch`
- [ ] Testar com 3 perguntas reais e validar:
  - PICO gerado faz sentido?
  - Query PubMed devolve resultados sensatos?
  - Abstracts são guardados corretamente?

**Critério de pronto:** submetes pergunta → vês PICO → vês 20-30 papers reais com PMID clicável para o PubMed.

### Semana 3 — Relevance scoring + UI de resultados
- [x] Prompt de relevance
- [x] Página SearchResultsPage com cards de papers
- [ ] Validar relevance scores em 5 buscas diferentes
- [ ] Tunning do prompt se necessário
- [ ] Adicionar filtros laterais (tipo de estudo, ano, open access)

**Critério de pronto:** resultados ordenados por score, papers top-5 são genuinamente os mais relevantes.

### Semana 4 — Mini-síntese + validador
- [x] Prompt de síntese com citações obrigatórias
- [x] Citation validator
- [x] Service `generateSynthesis` com retry loop
- [ ] Validar com 5 sínteses reais:
  - Citações são todas válidas?
  - Validator apanha alucinações?
  - Retry funciona em casos limite?
- [ ] Polish do markdown rendering no frontend

**Critério de pronto:** a partir de 5-10 papers selecionados, gera síntese com 100% de citações válidas. Demo gravável.

## Mês 2 — Camada de valor

### Semana 5 — Europe PMC + Unpaywall + Crossref
- [x] Cliente Europe PMC (`lib/europepmc.ts`, complementar, só resultados com PMID)
- [x] Cliente Unpaywall para flag de open access (`lib/unpaywall.ts`)
- [x] Cliente Crossref para enriquecer DOI metadata (`lib/crossref.ts`)
- [x] Merge strategy: dedupe por PMID; Europe PMC só adiciona PMIDs não vistos no PubMed
- [x] Badge "OA" + link "PDF grátis" quando is_open_access=true

### Semana 6 — ClinicalTrials.gov v2
- [x] Cliente ClinicalTrials.gov v2 (`lib/clinicaltrials.ts`, JSON API)
- [x] Schema: papers com `nct_id` mas sem `pmid` (cache + ON CONFLICT por nct_id)
- [x] Trials como secção separada nos resultados (não citáveis na síntese)
- [ ] Filtros: status (Recruiting, Completed, Active) — status mostrado como badge, falta filtro UI

### Semana 7 — Exports
- [x] Export Markdown (frontmatter Obsidian: title, authors, year, pmid, doi, tags)
- [x] Export PDF — HTML imprimível (browser → Imprimir → Guardar como PDF), refs Vancouver
- [ ] Export "slide pronto" (texto + citações para colar em Keynote/Canva)
- [x] Copy-to-clipboard do markdown

### Semana 8 — Biblioteca pessoal + tags
- [x] CRUD `library_items` no backend (`services/library-service.ts`, `routes/library.ts`)
- [x] UI: página "Biblioteca" com filtro por pasta
- [x] Sistema de tags por paper (backend; UI de edição de tags por fazer)
- [x] Notas por paper (backend)
- [x] Organização em pastas (folder field + chips de pasta na UI)

## Mês 3 — Diferenciação dentária + monetização

### Semana 9 — Bibliotecas curadas
- [x] Mecanismo `curated_queries` + seed inicial (8 queries exemplo, `npm run seed:curated`)
- [x] Áreas cobertas no seed: Implantologia, Periodontia, Endodontia, Ortodontia, DTM/Oclusão, Estética
- [x] UI: "Curadas" no menu, browse por área
- [x] Click numa query curada → instancia search com PICO pré-preenchido (sem chamar Claude)
- [ ] **Validar clinicamente cada query (is_validated=false nos seeds)** + expandir para 30-50 — esta é a tua moat

### Semana 10 — Guidelines crawler (light)
- [ ] Schema: tabela `guidelines` com EFP, AAP, EAO, ITI, ADA
- [ ] Para cada guideline relevante: título, ano, URL canónica, autores, áreas
- [ ] Indexação MANUAL inicial (não tentar scraping completo)
- [ ] No SearchResultsPage: secção "Guidelines relevantes" se houver match
- [ ] Match por keywords MeSH/keywords dos resultados

### Semana 11 — Billing Stripe
- [x] Setup Stripe (`lib/stripe.ts`, checkout + customer portal em `routes/billing.ts`)
- [ ] Criar no Stripe **um produto, duas prices**: Mensal 9,90€ + Anual 99€ → colar IDs no `.env` (`STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_ANNUAL`)
- [x] Webhook handler para subscription events (raw body, signature verificada)
- [x] Middleware de verificação de tier por endpoint (`middleware/tier-limits.ts`)
- [x] Plano único, mesmas funcionalidades; limite **mensal** de buscas (trial = 10/mês, pago = 30/mês) + bloqueio de trial expirado
- [x] Página de billing no frontend (`/billing`, com uso vs limite)
- [x] Pricing na página de conta (falta landing page pública pré-login)

### Semana 12 — Beta fechado
- [ ] Onboarding email
- [ ] Convidar 15-20 dentistas (Método RNS network, OdontoGrowth contacts)
- [ ] Loop diário de feedback durante 7-10 dias
- [ ] Hotfix issues críticos
- [ ] Soft launch público

## Próximos passos pós-12-semanas (não comprometer agora)

- App mobile / PWA optimization
- Integração Zotero / Mendeley
- Multi-utilizador (clínicas/equipas)
- Modo "questão urgente no consultório" (resposta em 30s, 3 papers)
- Integração com o DentalKPI (knowledge base do AI agent pode usar evidência verificada)
- Tradução automática PT/EN/ES para abstracts
- Histórico de mudanças nas guidelines (versões)
