-- ============================================================
-- EvidentiaDental — Relatório de custo real de Claude API
-- ============================================================
-- Converte os tokens registados em `usage_events` em euros, usando
-- os preços oficiais do Sonnet 4.6 ($3/M input, $15/M output).
--
-- Como correr:
--   psql "$DATABASE_URL" -f backend/sql/usage_cost_report.sql
-- ou copia cada bloco para o teu cliente SQL.
--
-- AJUSTA AQUI se mudares de modelo, câmbio, ou quiseres simular
-- caching/Haiku (ver Query 6):
--   input  Sonnet 4.6 = $3.00 / milhão
--   output Sonnet 4.6 = $15.00 / milhão
--   câmbio USD->EUR    = 0.92
-- Preço efetivo em EUR por token:
--   input  = 3  * 0.92 / 1e6 = 0.00000276
--   output = 15 * 0.92 / 1e6 = 0.0000138
-- ============================================================


-- ------------------------------------------------------------
-- QUERY 1 — Headline: custo médio por busca (o número-chave)
-- Custo total de LLM ÷ nº de buscas, all-time e últimos 30 dias.
-- ------------------------------------------------------------
WITH priced AS (
  SELECT
    (llm_tokens_input * 0.00000276 + llm_tokens_output * 0.0000138) AS cost_eur,
    created_at
  FROM usage_events
)
SELECT
  'all-time' AS janela,
  (SELECT COUNT(*) FROM searches)                                   AS buscas,
  ROUND(SUM(cost_eur)::numeric, 2)                                  AS custo_total_eur,
  ROUND((SUM(cost_eur) / NULLIF((SELECT COUNT(*) FROM searches),0))::numeric, 4)
                                                                    AS custo_por_busca_eur
FROM priced
UNION ALL
SELECT
  'ultimos_30d',
  (SELECT COUNT(*) FROM searches WHERE created_at > NOW() - INTERVAL '30 days'),
  ROUND(SUM(cost_eur) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::numeric, 2),
  ROUND((SUM(cost_eur) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')
        / NULLIF((SELECT COUNT(*) FROM searches WHERE created_at > NOW() - INTERVAL '30 days'),0))::numeric, 4)
FROM priced;


-- ------------------------------------------------------------
-- QUERY 2 — Distribuição do custo por busca (média esconde os outliers)
-- Best-effort: assume resource_id = search_id nos eventos de LLM.
-- Mostra média, mediana, p90 e máximo — o p90/máximo é o que dói.
-- ------------------------------------------------------------
WITH per_search AS (
  SELECT
    resource_id,
    SUM(llm_tokens_input * 0.00000276 + llm_tokens_output * 0.0000138) AS cost_eur
  FROM usage_events
  WHERE resource_id IS NOT NULL
    AND (llm_tokens_input > 0 OR llm_tokens_output > 0)
  GROUP BY resource_id
)
SELECT
  COUNT(*)                                                              AS buscas_com_tokens,
  ROUND(AVG(cost_eur)::numeric, 4)                                      AS media_eur,
  ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY cost_eur)::numeric, 4) AS mediana_eur,
  ROUND(percentile_cont(0.9) WITHIN GROUP (ORDER BY cost_eur)::numeric, 4) AS p90_eur,
  ROUND(MAX(cost_eur)::numeric, 4)                                      AS max_eur
FROM per_search;


-- ------------------------------------------------------------
-- QUERY 3 — Por tier: custo médio de Claude por utilizador/mês + margem
-- Para o tier 'paid', compara com a receita de €9,90 e mostra a margem.
-- ------------------------------------------------------------
WITH user_month AS (
  SELECT
    u.id,
    u.subscription_tier,
    date_trunc('month', ue.created_at) AS mes,
    SUM(ue.llm_tokens_input * 0.00000276 + ue.llm_tokens_output * 0.0000138) AS claude_eur
  FROM users u
  JOIN usage_events ue ON ue.user_id = u.id
  GROUP BY 1, 2, 3
)
SELECT
  subscription_tier                                          AS tier,
  COUNT(*)                                                   AS user_meses,
  ROUND(AVG(claude_eur)::numeric, 3)                         AS claude_medio_eur,
  ROUND(percentile_cont(0.9) WITHIN GROUP (ORDER BY claude_eur)::numeric, 3) AS claude_p90_eur,
  ROUND(MAX(claude_eur)::numeric, 3)                         AS claude_max_eur,
  -- margem só faz sentido para quem paga €9,90 (Stripe ~€0,40 + infra ~€0,45)
  ROUND((9.90 - 0.40 - 0.45 - AVG(claude_eur))::numeric, 2)  AS margem_media_eur_se_paid
FROM user_month
GROUP BY subscription_tier
ORDER BY subscription_tier;


-- ------------------------------------------------------------
-- QUERY 4 — Top 20 utilizadores por custo (os power users que comem margem)
-- Últimos 30 dias. Se algum ultrapassar ~€5/mês em 'paid', é sinal de alerta.
-- ------------------------------------------------------------
SELECT
  u.id,
  u.subscription_tier                                   AS tier,
  COUNT(DISTINCT s.id)                                  AS buscas_30d,
  ROUND(SUM(ue.llm_tokens_input * 0.00000276 + ue.llm_tokens_output * 0.0000138)::numeric, 3)
                                                        AS claude_eur_30d
FROM users u
JOIN usage_events ue ON ue.user_id = u.id AND ue.created_at > NOW() - INTERVAL '30 days'
LEFT JOIN searches s ON s.user_id = u.id AND s.created_at > NOW() - INTERVAL '30 days'
GROUP BY u.id, u.subscription_tier
ORDER BY claude_eur_30d DESC
LIMIT 20;


-- ------------------------------------------------------------
-- QUERY 5 — Onde está o custo: por event_type
-- Valida a otimização proposta: se 'pico_generation' + 'relevance_scoring'
-- forem grande fatia, mudá-los para Haiku 4.5 ($1/$5) poupa muito.
-- ------------------------------------------------------------
SELECT
  event_type,
  COUNT(*)                                              AS eventos,
  SUM(llm_tokens_input)                                 AS tokens_in,
  SUM(llm_tokens_output)                                AS tokens_out,
  ROUND(SUM(llm_tokens_input * 0.00000276 + llm_tokens_output * 0.0000138)::numeric, 2)
                                                        AS custo_eur,
  ROUND((100.0 * SUM(llm_tokens_input * 0.00000276 + llm_tokens_output * 0.0000138)
        / NULLIF(SUM(SUM(llm_tokens_input * 0.00000276 + llm_tokens_output * 0.0000138)) OVER (), 0))::numeric, 1)
                                                        AS pct_do_custo
FROM usage_events
GROUP BY event_type
ORDER BY custo_eur DESC;


-- ------------------------------------------------------------
-- QUERY 6 — Simulação de otimização (Haiku para PICO+relevância)
-- Recalcula o custo se PICO e relevância corressem em Haiku 4.5
-- ($1/M in -> 0.00000092 ; $5/M out -> 0.0000046) e a síntese ficasse no Sonnet.
-- Compara com o custo atual. (Ajusta os nomes de event_type se diferirem.)
-- ------------------------------------------------------------
WITH calc AS (
  SELECT
    event_type,
    -- custo atual (tudo Sonnet)
    llm_tokens_input * 0.00000276 + llm_tokens_output * 0.0000138 AS atual_eur,
    -- custo simulado: Haiku para classificação, Sonnet para síntese
    CASE
      WHEN event_type IN ('pico_generation', 'relevance_scoring')
        THEN llm_tokens_input * 0.00000092 + llm_tokens_output * 0.0000046
      ELSE llm_tokens_input * 0.00000276 + llm_tokens_output * 0.0000138
    END AS simulado_eur
  FROM usage_events
)
SELECT
  ROUND(SUM(atual_eur)::numeric, 2)                                  AS custo_atual_eur,
  ROUND(SUM(simulado_eur)::numeric, 2)                              AS custo_haiku_eur,
  ROUND((100.0 * (1 - SUM(simulado_eur) / NULLIF(SUM(atual_eur),0)))::numeric, 1)
                                                                     AS poupanca_pct
FROM calc;
