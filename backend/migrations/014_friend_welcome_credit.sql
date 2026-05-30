-- Migration: 014_friend_welcome_credit
-- Created: 2026-05-30
-- Description: Flag para o crédito único de boas-vindas (€5) do amigo indicado,
-- aplicado via Stripe Customer Balance na 1ª fatura (o preço listado continua
-- €9,90; o desconto entra como crédito). Evita creditar mais do que uma vez.

ALTER TABLE referrals ADD COLUMN IF NOT EXISTS welcome_credited BOOLEAN NOT NULL DEFAULT FALSE;
