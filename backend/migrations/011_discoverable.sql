-- Migration: 011_discoverable
-- Created: 2026-05-29
-- Description: Let users be found by name in colleague search. On by default;
-- users can opt out in their profile. Search never exposes email.

ALTER TABLE users
  ADD COLUMN discoverable BOOLEAN NOT NULL DEFAULT TRUE;
