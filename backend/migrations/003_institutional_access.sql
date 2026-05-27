-- Migration: 003_institutional_access
-- Created: 2026-05-27
-- Description: Per-user institutional full-text access preferences (LibKey / EZproxy).

ALTER TABLE users ADD COLUMN IF NOT EXISTS libkey_library_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ezproxy_prefix TEXT;
