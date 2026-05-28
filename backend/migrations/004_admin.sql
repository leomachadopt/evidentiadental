-- Migration: 004_admin
-- Created: 2026-05-27
-- Description: Admin role for user management.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Promote the system administrator (if the account already exists).
-- New registrations with this email are auto-promoted at registration time
-- (see ADMIN_EMAIL in config).
UPDATE users SET is_admin = TRUE WHERE lower(email) = lower('leomachadopt@gmail.com');

CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = TRUE;
