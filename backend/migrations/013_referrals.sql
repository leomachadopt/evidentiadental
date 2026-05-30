-- Migration: 013_referrals
-- Created: 2026-05-30
-- Description: Programa de indicações com desconto progressivo + bónus de buscas.
--
-- Modelo: cada amigo indicado ATIVO E A PAGAR vale -20% na mensalidade do
-- indicador (satura em grátis aos 5). A partir do 6º amigo, cada um dá +20% de
-- buscas (a recompensa deixa de ser dinheiro e passa a capacidade).
--
-- `users.circle_size` é a contagem VIVA de amigos qualificados, mantida pelo
-- referral-service (recomputeCircle). É denormalizada de propósito para o hot
-- path (tier-limits, a cada busca) a ler sem join. A regra anti-anel está
-- embutida na contagem: um amigo só conta se está `active` E o desconto dele
-- ainda não é 100% (circle_size < 5) — senão um anel mútuo iria todo a grátis.

ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS circle_size INT NOT NULL DEFAULT 0;

CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE, -- 1 indicação por indicado
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending (registou) | active (pagou 1x) | reversed (reembolso)
  first_paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (referrer_id <> referred_id)
);

CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX idx_referrals_referred ON referrals(referred_id);

-- Backfill: dá um código a todos os utilizadores existentes. base32 curto,
-- sem caracteres ambíguos, derivado de bytes aleatórios.
UPDATE users
SET referral_code = UPPER(SUBSTR(TRANSLATE(ENCODE(gen_random_bytes(5), 'hex'), 'abcdef', 'ghjkmn'), 1, 8))
WHERE referral_code IS NULL;
