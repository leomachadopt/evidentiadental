-- Migration: 008_collections_and_pdf
-- Created: 2026-05-29
-- Description: Real folders (collections) for the library + per-item uploaded
-- PDF metadata (the file itself lives in object storage / Vercel Blob, not the DB).

-- Folders as first-class rows so they can be created empty, renamed and deleted.
CREATE TABLE IF NOT EXISTS collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_collections_user ON collections(user_id);

-- Library items now point at a collection; PDF is stored externally (URL + meta).
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS collection_id UUID REFERENCES collections(id) ON DELETE SET NULL;
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS pdf_name TEXT;
ALTER TABLE library_items ADD COLUMN IF NOT EXISTS pdf_size INTEGER;
CREATE INDEX IF NOT EXISTS idx_library_collection ON library_items(collection_id);

-- Backfill: turn each distinct legacy folder string into a real collection...
INSERT INTO collections (user_id, name)
SELECT DISTINCT user_id, COALESCE(NULLIF(folder, ''), 'Inbox')
FROM library_items
ON CONFLICT (user_id, name) DO NOTHING;

-- ...and link existing items to it.
UPDATE library_items li
SET collection_id = c.id
FROM collections c
WHERE c.user_id = li.user_id
  AND c.name = COALESCE(NULLIF(li.folder, ''), 'Inbox')
  AND li.collection_id IS NULL;
