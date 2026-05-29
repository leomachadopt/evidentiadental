-- Migration: 010_profile
-- Created: 2026-05-29
-- Description: Profile fields — city and avatar (the avatar image lives in
-- object storage / Vercel Blob; we only keep its URL here).

ALTER TABLE users
  ADD COLUMN city       TEXT,
  ADD COLUMN avatar_url TEXT;
