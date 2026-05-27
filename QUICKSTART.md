# QuickStart

## 1. Pré-requisitos

- Node.js 20+ (`node -v`)
- npm
- Conta Neon (PostgreSQL gratuito) → https://neon.tech
- Conta NCBI para API key → https://www.ncbi.nlm.nih.gov/account/
- Anthropic API key

## 2. Setup do projeto

```bash
# Backend
cd backend
cp .env.example .env
# Edita .env com os teus valores reais
npm install

# Frontend
cd ../frontend
echo "VITE_API_URL=http://localhost:3001" > .env
npm install
```

## 3. Configurar Neon

1. Cria projeto novo no Neon: `evidentia-dental`
2. Copia a connection string
3. Cola em `backend/.env` em `DATABASE_URL`
4. Correr migrations:

```bash
cd backend
npm run migrate
```

Deves ver:
```
[migrate] → Running 001_initial_schema.sql
[migrate] ✓ 001_initial_schema.sql
[migrate] All migrations applied
```

## 4. NCBI API Key

1. Vai a https://www.ncbi.nlm.nih.gov/account/
2. Cria conta (se ainda não tens)
3. "API Key Management" → Create new key
4. Cola em `NCBI_API_KEY` no `.env`
5. Cola também o teu email em `NCBI_EMAIL`

Sem chave: 3 req/s. Com chave: 10 req/s.

## 5. Anthropic API

1. https://console.anthropic.com
2. Settings → API Keys → Create key
3. Cola em `ANTHROPIC_API_KEY`

## 6. Arrancar

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

Abrir: http://localhost:5173

## 7. Primeiro teste end-to-end

1. Criar conta no /login
2. Submeter pergunta: "vale a pena fazer PRF em socket preservation após extração de molar?"
3. Esperar geração de PICO
4. Verificar:
   - PICO faz sentido
   - Status muda para "A executar"
   - Aparecem 20-30 papers reais
   - PMIDs clicáveis abrem PubMed real
5. Selecionar 5 papers → "Gerar mini-síntese"
6. Validar:
   - Síntese tem [PMID xxxx] em cada afirmação
   - Badge "Citações validadas" a verde
   - Force de evidência aparece
   - Markdown formatado corretamente

## 8. Próximos passos

Ler:
- `CLAUDE.md` para princípios arquiteturais
- `docs/roadmap.md` para o plano semanal
- `docs/claude-code-workflow.md` para como trabalhar com Cursor

## Troubleshooting

### "Invalid environment variables"
O Zod no `src/lib/config.ts` validou e falhou. Lê a mensagem de erro — diz exatamente que campo falta ou está errado.

### "PubMed API error 429"
Rate-limit. Adiciona `NCBI_API_KEY` ou reduz `maxResults`.

### "Claude returned invalid JSON"
O prompt está a falhar. Cola o output no console e ajusta o prompt em `src/prompts/`.

### Síntese com 3 tentativas falhadas
O validador rejeitou todas. Ver `validation_errors` na tabela `syntheses` — provavelmente o LLM está a citar PMIDs fora da lista, ou está a fazer afirmações sem citação. Ajustar prompt.
