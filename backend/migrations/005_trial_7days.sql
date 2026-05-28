-- Migration: 005_trial_7days
-- Created: 2026-05-27
-- Description: Shorten the default free trial from 14 to 7 days.
-- Applies to NEW registrations (column default). Existing trials are untouched.

ALTER TABLE users ALTER COLUMN trial_ends_at SET DEFAULT NOW() + INTERVAL '7 days';
