-- Migration: 001_initial_schema
-- Created: 2026-05-27
-- Description: Schema inicial completo do EvidentiaDental

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS & AUTH
-- ============================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  professional_id TEXT,
  speciality TEXT,
  country TEXT DEFAULT 'PT',
  subscription_tier TEXT NOT NULL DEFAULT 'trial',
  trial_ends_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '14 days',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_stripe_customer ON users(stripe_customer_id);

-- ============================================================
-- SEARCHES & PICO
-- ============================================================

CREATE TABLE searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw_question TEXT NOT NULL,
  pico JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  total_results INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_searches_user ON searches(user_id, created_at DESC);
CREATE INDEX idx_searches_status ON searches(status);

-- Comentário sobre PICO JSONB:
-- {
--   "population": "string",
--   "intervention": "string",
--   "comparator": "string",
--   "outcomes": ["string"],
--   "assumptions": ["string"],
--   "filters": {
--     "study_types": ["RCT", "SR"],
--     "year_from": 2015,
--     "language": "english",
--     "humans_only": true
--   }
-- }

-- ============================================================
-- QUERIES EXECUTADAS (auditoria de retrieval)
-- ============================================================

CREATE TABLE search_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id UUID NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  source TEXT NOT NULL, -- 'pubmed', 'europepmc', 'clinicaltrials', 'crossref'
  query_string TEXT NOT NULL,
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  results_count INT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  raw_response JSONB
);

CREATE INDEX idx_search_queries_search ON search_queries(search_id);

-- ============================================================
-- PAPERS (cache global)
-- ============================================================

CREATE TABLE papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pmid TEXT UNIQUE,
  doi TEXT,
  nct_id TEXT UNIQUE,
  title TEXT NOT NULL,
  authors JSONB NOT NULL DEFAULT '[]'::jsonb,
  journal TEXT,
  year INT,
  abstract TEXT,
  publication_types TEXT[] DEFAULT '{}',
  mesh_terms TEXT[] DEFAULT '{}',
  keywords TEXT[] DEFAULT '{}',
  is_open_access BOOLEAN DEFAULT FALSE,
  oa_pdf_url TEXT,
  source TEXT NOT NULL,
  raw_metadata JSONB,
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  refreshed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_papers_pmid ON papers(pmid) WHERE pmid IS NOT NULL;
CREATE INDEX idx_papers_doi ON papers(doi) WHERE doi IS NOT NULL;
CREATE INDEX idx_papers_year ON papers(year);
CREATE INDEX idx_papers_publication_types ON papers USING GIN(publication_types);

-- ============================================================
-- RESULTADOS DE BUSCA (ligação search ↔ papers + relevance)
-- ============================================================

CREATE TABLE search_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id UUID NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  paper_id UUID NOT NULL REFERENCES papers(id),
  relevance_score INT,
  relevance_reasoning TEXT,
  position INT NOT NULL,
  selected_for_synthesis BOOLEAN DEFAULT FALSE,
  user_tags TEXT[] DEFAULT '{}',
  user_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_search_results_unique ON search_results(search_id, paper_id);
CREATE INDEX idx_search_results_selected ON search_results(search_id) WHERE selected_for_synthesis = TRUE;

-- ============================================================
-- MINI-SÍNTESES (com validação anti-alucinação)
-- ============================================================

CREATE TABLE syntheses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id UUID NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  selected_paper_ids UUID[] NOT NULL,
  selected_pmids TEXT[] NOT NULL, -- snapshot dos PMIDs no momento da síntese
  synthesis_md TEXT NOT NULL,
  evidence_strength TEXT, -- 'high', 'moderate', 'low', 'very_low', 'insufficient'
  evidence_reasoning TEXT,
  validation_status TEXT NOT NULL DEFAULT 'pending',
  validation_errors JSONB,
  generation_attempts INT DEFAULT 1,
  llm_model TEXT,
  llm_tokens_input INT,
  llm_tokens_output INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_syntheses_search ON syntheses(search_id, created_at DESC);

-- ============================================================
-- BIBLIOTECA PESSOAL
-- ============================================================

CREATE TABLE library_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paper_id UUID NOT NULL REFERENCES papers(id),
  folder TEXT DEFAULT 'Inbox',
  tags TEXT[] DEFAULT '{}',
  note TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_library_unique ON library_items(user_id, paper_id);
CREATE INDEX idx_library_user_folder ON library_items(user_id, folder);
CREATE INDEX idx_library_tags ON library_items USING GIN(tags);

-- ============================================================
-- QUERIES CURADAS (bibliotecas pré-construídas dentárias)
-- ============================================================

CREATE TABLE curated_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area TEXT NOT NULL,
  subarea TEXT,
  clinical_question TEXT NOT NULL,
  pico_template JSONB NOT NULL,
  pubmed_query TEXT NOT NULL,
  description TEXT,
  is_validated BOOLEAN DEFAULT FALSE,
  validated_by TEXT,
  validated_at TIMESTAMPTZ,
  usage_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_curated_area ON curated_queries(area, subarea);

-- ============================================================
-- USAGE TRACKING (controlo de custos e limites por tier)
-- ============================================================

CREATE TABLE usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'search', 'synthesis', 'export'
  resource_id UUID,
  llm_tokens_input INT DEFAULT 0,
  llm_tokens_output INT DEFAULT 0,
  api_calls JSONB DEFAULT '{}'::jsonb, -- {"pubmed": 3, "crossref": 5}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_user_date ON usage_events(user_id, created_at DESC);

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
