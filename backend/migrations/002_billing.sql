-- Migration: 002_billing
-- Created: 2026-05-27
-- Description: Extra columns for Stripe subscription state.

ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
