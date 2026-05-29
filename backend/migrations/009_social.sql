-- Migration: 009_social
-- Created: 2026-05-29
-- Description: Camada social — amizades (consentimento mútuo), feed de saves dos
-- amigos e pedidos de PDF no modelo "reprint" (o LOG vive na BD; o ficheiro
-- paywalled NUNCA passa pela infra — viaja num canal externo via deep-link).

-- ============================================================
-- AMIZADES (consentimento mútuo)
-- ============================================================
CREATE TABLE friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);
CREATE INDEX idx_friendships_addressee ON friendships(addressee_id, status);
CREATE INDEX idx_friendships_requester ON friendships(requester_id, status);

-- ============================================================
-- PEDIDOS DE PDF (reprint) — log in-app; o ficheiro viaja fora do sistema
-- ============================================================
CREATE TABLE pdf_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paper_id     UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  status  TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'fulfilled', 'declined')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_pdf_requests_owner ON pdf_requests(owner_id, status);
CREATE INDEX idx_pdf_requests_requester ON pdf_requests(requester_id, status);

-- ============================================================
-- PREFERÊNCIAS DE PRIVACIDADE / PARTILHA (opt-in, tudo OFF por defeito)
-- ============================================================
ALTER TABLE users
  ADD COLUMN share_library_activity BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN accept_pdf_requests    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN whatsapp_number        TEXT;
