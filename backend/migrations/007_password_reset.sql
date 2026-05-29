-- Migration: 007_password_reset
-- Created: 2026-05-29
-- Description: Self-service password reset. Stores a SHA-256 hash of the reset
-- token (never the raw token) plus its expiry. Single-use: cleared on use.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_password_reset_token ON users(password_reset_token_hash);
