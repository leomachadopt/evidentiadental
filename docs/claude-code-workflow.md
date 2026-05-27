# Workflow com Claude Code (Cursor)

> Como usar o Claude Code para construir EvidentiaDental de forma eficiente.

## Setup inicial no Cursor

1. Abrir a pasta do projeto no Cursor.
2. Garantir que o Claude Code está ativado.
3. Ler primeiro o ficheiro `/CLAUDE.md` na raiz — é o briefing que o Claude vai consumir.

## Padrão de prompts produtivos

### Para começar uma nova feature

```
Estou a implementar [feature X] do roadmap (semana Y).

Contexto:
- Já temos [o que está pronto]
- Esta feature precisa de [requisitos]

Proposta:
1. [passo 1]
2. [passo 2]
3. [passo 3]

Começa por [o ficheiro/módulo mais isolado].
Confirma a abordagem antes de mexer em mais que 2 ficheiros.
```

### Para debug

```
Bug: [descrição]
Reprodução: [steps]
Logs: [cola os logs]

Pergunta-te primeiro: o problema é no rate-limiting, no parsing XML, no prompt do LLM, ou no validador de citações? Investiga uma hipótese de cada vez.
```

### Para refactor

```
O ficheiro X cresceu demasiado. Quero separar em:
- [parte 1] → [novo ficheiro]
- [parte 2] → [outro ficheiro]

Mantém os contratos públicos iguais. Não mudes lógica, só estrutura.
Mostra-me o plano antes de mexer.
```

## Anti-padrões a evitar com Claude Code aqui

### ❌ Não fazer

- "Faz tudo o que falta no roadmap" → produz código não revisto, perdes controlo
- "Adiciona [feature complexa] em 1 commit" → bugs invisíveis
- "Otimiza este código" sem objetivo claro → cria refactors gratuitos
- "Encontra papers sobre X" → não pedir ao Claude para fazer retrieval. Usar sempre o `pubmed.ts` via UI.

### ✅ Fazer

- Pedir 1 task de cada vez (uma rota, um service, uma página)
- Pedir o **plano antes do código** quando tocar em 3+ ficheiros
- Pedir **testes manuais** depois de cada feature: "como testo isto agora?"
- Pedir explicitamente para **não mexer em** ficheiros sensíveis (prompts, validador, rate limiter)

## Como testar uma busca real (smoke test após qualquer mudança)

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev

# Browser: http://localhost:5173
# 1. Criar conta
# 2. Submeter: "vale a pena fazer PRF em socket preservation?"
# 3. Verificar:
#    - PICO gerado faz sentido
#    - Status muda para "querying" e depois "completed"
#    - Aparecem 20-30 resultados com PMIDs reais
#    - Clicar num PMID abre a página real do PubMed
#    - Selecionar 5 papers e gerar síntese
#    - Síntese tem [PMID xxxx] em cada afirmação factual
#    - Badge "Citações validadas" aparece a verde
```

## Métricas a monitorizar desde o dia 1

Há uma tabela `usage_events` no schema. Cada chamada ao Claude registra tokens.

Query útil para custos:
```sql
SELECT
  date_trunc('day', created_at) as day,
  event_type,
  count(*) as events,
  sum(llm_tokens_input) as tokens_in,
  sum(llm_tokens_output) as tokens_out
FROM usage_events
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY 1, 2
ORDER BY 1 DESC, 2;
```

Custo estimado Sonnet 4.6 (a verificar com a pricing atual):
- Input: ~3$/MTok
- Output: ~15$/MTok

Uma busca típica completa = ~30k tokens input + ~3k output = **~0.13$**
Sintese = ~10k input + ~2k output = **~0.06$**

**Total por busca completa com síntese: ~0.19€ a 0.25€**

Se Clinical Tier = 19€/mês com 50 buscas → margem bruta ~13€ por user/mês. Saudável.

## Quando NÃO usar Claude Code

- Decisões clínicas sobre quais queries curadas validar → essa é a tua expertise dentária
- Tunning final de prompts → testa tu manualmente porque sentes o tom certo
- Pricing e packaging → decisão de negócio
- Validação clínica do output da síntese → tu como dentista lês e decides se a síntese está honesta
