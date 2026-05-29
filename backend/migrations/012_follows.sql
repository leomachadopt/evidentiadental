-- Migration: 012_follows
-- Created: 2026-05-29
-- Description: Replace mutual friendships with a directional follow graph
-- (instant, no approval). Migrate existing data, then drop `friendships`.

CREATE TABLE follows (
  follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX idx_follows_followee ON follows(followee_id);

-- Carry over existing relationships:
-- accepted friendships become a follow in BOTH directions (mutual);
-- pending requests become a single follow (requester -> addressee).
INSERT INTO follows (follower_id, followee_id)
SELECT requester_id, addressee_id FROM friendships WHERE status IN ('accepted', 'pending')
ON CONFLICT DO NOTHING;

INSERT INTO follows (follower_id, followee_id)
SELECT addressee_id, requester_id FROM friendships WHERE status = 'accepted'
ON CONFLICT DO NOTHING;

DROP TABLE friendships;
