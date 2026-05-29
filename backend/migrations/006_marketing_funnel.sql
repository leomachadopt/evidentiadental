-- Migration: 006_marketing_funnel
-- Created: 2026-05-29
-- Description: Remember the plan cadence (monthly/annual) the user chose at
-- checkout so the marketing funnel (n8n -> MailerLite) can segment by it.

ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_interval TEXT;
