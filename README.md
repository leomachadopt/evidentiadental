# EvidentiaDental

> Evidência científica dentária verificada. Em 90 segundos. Sem alucinações.

SaaS clínico para dentistas premium que precisam de evidência científica rápida, confiável e citável. Converte pergunta clínica em PICO → executa busca real no PubMed/Europe PMC/ClinicalTrials.gov → gera mini-síntese clínica com **citações validadas por arquitetura**.

## Stack técnica

- **Frontend:** React 19 + Vite + TypeScript + Tailwind + shadcn/ui
- **Backend:** Node.js 20 + Express + TypeScript
- **DB:** PostgreSQL (Neon) com `pg` driver direto (sem ORM pesado)
- **IA:** Anthropic Claude API (Sonnet 4.6)
- **APIs externas:** PubMed E-utilities (NCBI), Europe PMC, Crossref, Unpaywall, ClinicalTrials.gov v2
- **Auth:** JWT simples (igual ao DentalKPI)
- **Billing:** Stripe (subscriptions)
- **Deploy:** Vercel (frontend) + Railway/Render (backend) + Neon (DB)

## Princípio arquitetural fundamental

**O LLM nunca cria identificadores (PMIDs, DOIs).** Todo PMID/DOI que aparece no produto veio de uma chamada real a uma API externa. Há um validador no backend que rejeita qualquer output do LLM que contenha PMIDs que não estão na lista de papers retornados pela API.

Esta é a diferença entre "AI que tenta não alucinar" e "AI que não consegue alucinar".

## Estrutura

```
evidentia-dental/
├── backend/                  # API Express
│   ├── src/
│   │   ├── routes/           # Endpoints HTTP
│   │   ├── services/         # Lógica de negócio + integrações externas
│   │   ├── middleware/       # Auth, rate-limiting, logging
│   │   ├── db/               # Cliente PostgreSQL + queries
│   │   ├── lib/              # Utilities (PubMed client, Claude client, etc)
│   │   ├── prompts/          # Prompts do Claude (versionados)
│   │   └── types/            # TypeScript types partilhados
│   └── migrations/           # Migrations SQL
├── frontend/                 # SPA React
│   └── src/
│       ├── components/       # Componentes reutilizáveis
│       ├── pages/            # Páginas (rotas)
│       ├── lib/              # Cliente API + utilities
│       ├── hooks/            # React hooks customizados
│       └── types/            # TypeScript types
├── docs/                     # Documentação técnica e clínica
└── scripts/                  # Scripts auxiliares (seeds, etc)
```

## Setup rápido

### 1. Variáveis de ambiente

Cria `backend/.env`:

```bash
# Database
DATABASE_URL=postgresql://user:pass@host/db

# Auth
JWT_SECRET=gera-com-openssl-rand-base64-32

# APIs externas
NCBI_API_KEY=obter-em-ncbi.nlm.nih.gov-account
NCBI_EMAIL=teu-email@dominio.com
ANTHROPIC_API_KEY=sk-ant-...
CROSSREF_EMAIL=teu-email@dominio.com
UNPAYWALL_EMAIL=teu-email@dominio.com

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# App
PORT=3001
NODE_ENV=development
```

Cria `frontend/.env`:

```bash
VITE_API_URL=http://localhost:3001
```

### 2. Instalar e correr

```bash
# Backend
cd backend
npm install
npm run migrate
npm run dev

# Frontend (noutro terminal)
cd frontend
npm install
npm run dev
```

## Roadmap de 12 semanas

Ver `docs/roadmap.md` para o plano detalhado semana a semana.

## Workflow com Claude Code

Ver `docs/claude-code-workflow.md` para o padrão de prompts e fluxo de trabalho.

## Licença

Proprietário. Todos os direitos reservados a Leonardo / OdontoGrowth / Método RNS.
