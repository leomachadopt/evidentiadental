/**
 * Social layer — a DIRECTIONAL follow graph (instant, no approval), a feed of
 * the saves of people you follow, and PDF requests gated on MUTUAL follow.
 *
 * Email is never exposed by anything here. Visibility is directional: if I
 * follow you and you opted in to share, I see your saves.
 *
 * NON-NEGOTIABLE: never move a paywalled PDF. Open-access papers can be served
 * / copied (see getImportablePdf); paywalled ones are only signalled and handed
 * off to an external deep-link (the "reprint request"). A private per-item
 * `note` is never exposed — only the save itself and its date.
 */

import { query } from '../db/client.js';

export interface FollowUser {
  id: string;
  name: string | null;
  speciality: string | null;
  city: string | null;
  avatar_url: string | null;
  since: string;
  follows_me?: boolean; // in the "following" list: do they follow me back
  i_follow?: boolean; // in the "followers" list: do I follow them back
}

export interface ActivityItem {
  added_at: string;
  paper_id: string;
  pmid: string | null;
  doi: string | null;
  title: string;
  authors: any;
  journal: string | null;
  year: number | null;
  is_open_access: boolean;
  friend_id: string;
  friend_name: string | null;
  friend_avatar: string | null;
  friend_has_pdf: boolean;
  friend_accepts_requests: boolean;
  mutual: boolean; // do we follow each other (gates the "request PDF" action)
  in_my_library: boolean;
}

// ----------------------------------------------------------------------------
// Follow graph (instant, directional)
// ----------------------------------------------------------------------------

export async function followUser(
  userId: string,
  targetId: string,
): Promise<{ status: 'followed' | 'already' | 'self' | 'not_found' }> {
  if (targetId === userId) return { status: 'self' };
  const exists = await query('SELECT 1 FROM users WHERE id = $1', [targetId]);
  if (exists.rows.length === 0) return { status: 'not_found' };
  const r = await query(
    `INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, targetId],
  );
  return { status: r.rowCount > 0 ? 'followed' : 'already' };
}

export async function unfollowUser(userId: string, targetId: string): Promise<boolean> {
  const r = await query(`DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2`, [
    userId,
    targetId,
  ]);
  return r.rowCount > 0;
}

/** People I follow, with whether they follow me back. */
export async function listFollowing(userId: string): Promise<FollowUser[]> {
  const r = await query<FollowUser>(
    `SELECT u.id, u.name, u.speciality, u.city, u.avatar_url, f.created_at AS since,
            EXISTS (SELECT 1 FROM follows b WHERE b.follower_id = u.id AND b.followee_id = $1) AS follows_me
       FROM follows f
       JOIN users u ON u.id = f.followee_id
      WHERE f.follower_id = $1
      ORDER BY u.name NULLS LAST`,
    [userId],
  );
  return r.rows;
}

/** People who follow me, with whether I follow them back ("seguir de volta"). */
export async function listFollowers(userId: string): Promise<FollowUser[]> {
  const r = await query<FollowUser>(
    `SELECT u.id, u.name, u.speciality, u.city, u.avatar_url, f.created_at AS since,
            EXISTS (SELECT 1 FROM follows b WHERE b.follower_id = $1 AND b.followee_id = u.id) AS i_follow
       FROM follows f
       JOIN users u ON u.id = f.follower_id
      WHERE f.followee_id = $1
      ORDER BY u.name NULLS LAST`,
    [userId],
  );
  return r.rows;
}

// ----------------------------------------------------------------------------
// User search (by name / speciality / city) — never returns email
// ----------------------------------------------------------------------------

export interface UserSearchResult {
  id: string;
  name: string | null;
  speciality: string | null;
  city: string | null;
  avatar_url: string | null;
  i_follow: boolean;
  follows_me: boolean;
}

export async function searchUsers(userId: string, term: string): Promise<UserSearchResult[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const r = await query<UserSearchResult>(
    `SELECT u.id, u.name, u.speciality, u.city, u.avatar_url,
            EXISTS (SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = u.id) AS i_follow,
            EXISTS (SELECT 1 FROM follows WHERE follower_id = u.id AND followee_id = $1) AS follows_me
       FROM users u
      WHERE u.id <> $1
        AND u.discoverable = TRUE
        AND (
          u.name ILIKE '%' || $2 || '%'
          OR u.speciality ILIKE '%' || $2 || '%'
          OR u.city ILIKE '%' || $2 || '%'
        )
      ORDER BY u.name
      LIMIT 20`,
    [userId, q],
  );
  return r.rows;
}

// ----------------------------------------------------------------------------
// Activity feed — saves of people I follow who share (never the private note)
// ----------------------------------------------------------------------------

export async function friendActivity(userId: string, limit = 50): Promise<ActivityItem[]> {
  const r = await query<ActivityItem>(
    `SELECT li.added_at, p.id AS paper_id, p.pmid, p.doi, p.title, p.authors,
            p.journal, p.year, p.is_open_access,
            u.id AS friend_id, u.name AS friend_name, u.avatar_url AS friend_avatar,
            (li.pdf_url IS NOT NULL) AS friend_has_pdf,
            u.accept_pdf_requests AS friend_accepts_requests,
            EXISTS (SELECT 1 FROM follows b WHERE b.follower_id = u.id AND b.followee_id = $1) AS mutual,
            EXISTS (
              SELECT 1 FROM library_items mine
               WHERE mine.user_id = $1 AND mine.paper_id = p.id
            ) AS in_my_library
       FROM library_items li
       JOIN users u  ON u.id = li.user_id
       JOIN papers p ON p.id = li.paper_id
      WHERE u.share_library_activity = TRUE
        AND li.user_id IN (SELECT followee_id FROM follows WHERE follower_id = $1)
      ORDER BY li.added_at DESC
      LIMIT $2`,
    [userId, limit],
  );
  return r.rows;
}

export interface UserProfile {
  id: string;
  name: string | null;
  speciality: string | null;
  city: string | null;
  avatar_url: string | null;
}

/**
 * A user's profile plus their saved-papers history. Identity is always
 * returned; the saves require that I follow them AND they share their activity
 * (directional visibility). `iFollow`/`followsMe` drive the follow buttons.
 */
export async function userProfile(
  userId: string,
  targetId: string,
): Promise<{
  profile: UserProfile;
  iFollow: boolean;
  followsMe: boolean;
  sharesActivity: boolean;
  items: ActivityItem[];
} | null> {
  const u = await query<UserProfile & { share_library_activity: boolean }>(
    `SELECT id, name, speciality, city, avatar_url, share_library_activity
       FROM users WHERE id = $1`,
    [targetId],
  );
  if (u.rows.length === 0) return null;
  const { share_library_activity, ...profile } = u.rows[0];

  const rel = await query<{ i_follow: boolean; follows_me: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2) AS i_follow,
            EXISTS (SELECT 1 FROM follows WHERE follower_id = $2 AND followee_id = $1) AS follows_me`,
    [userId, targetId],
  );
  const iFollow = rel.rows[0]?.i_follow ?? false;
  const followsMe = rel.rows[0]?.follows_me ?? false;

  let items: ActivityItem[] = [];
  if (iFollow && share_library_activity) {
    const r = await query<ActivityItem>(
      `SELECT li.added_at, p.id AS paper_id, p.pmid, p.doi, p.title, p.authors,
              p.journal, p.year, p.is_open_access,
              u.id AS friend_id, u.name AS friend_name, u.avatar_url AS friend_avatar,
              (li.pdf_url IS NOT NULL) AS friend_has_pdf,
              u.accept_pdf_requests AS friend_accepts_requests,
              EXISTS (SELECT 1 FROM follows b WHERE b.follower_id = u.id AND b.followee_id = $1) AS mutual,
              EXISTS (
                SELECT 1 FROM library_items mine
                 WHERE mine.user_id = $1 AND mine.paper_id = p.id
              ) AS in_my_library
         FROM library_items li
         JOIN users u  ON u.id = li.user_id
         JOIN papers p ON p.id = li.paper_id
        WHERE li.user_id = $2
        ORDER BY li.added_at DESC
        LIMIT 200`,
      [userId, targetId],
    );
    items = r.rows;
  }
  return { profile, iFollow, followsMe, sharesActivity: share_library_activity, items };
}

// ----------------------------------------------------------------------------
// OA PDF import helper — copyable only when I follow them AND the paper is OA
// ----------------------------------------------------------------------------

export async function getImportablePdf(
  importerId: string,
  ownerId: string,
  paperId: string,
): Promise<{ url: string; name: string | null; size: number | null } | null> {
  const follows = await query(
    `SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2`,
    [importerId, ownerId],
  );
  if (follows.rows.length === 0) return null;

  const r = await query<{
    pdf_url: string | null;
    pdf_name: string | null;
    pdf_size: number | null;
    is_open_access: boolean;
  }>(
    `SELECT li.pdf_url, li.pdf_name, li.pdf_size, p.is_open_access
       FROM library_items li
       JOIN papers p ON p.id = li.paper_id
      WHERE li.user_id = $1 AND li.paper_id = $2`,
    [ownerId, paperId],
  );
  const row = r.rows[0];
  if (!row || !row.pdf_url || !row.is_open_access) return null;
  return { url: row.pdf_url, name: row.pdf_name, size: row.pdf_size };
}

// ----------------------------------------------------------------------------
// PDF requests ("reprint") — require MUTUAL follow; file moves off-platform
// ----------------------------------------------------------------------------

export interface PdfRequestResult {
  id: string;
  channel: 'whatsapp' | 'email';
  deeplink: string;
  ownerName: string | null;
}

export async function createPdfRequest(
  userId: string,
  opts: { paperId: string; ownerId: string },
): Promise<
  | { ok: true; result: PdfRequestResult }
  | { ok: false; reason: 'not_mutual' | 'not_accepting' | 'open_access' | 'no_pdf' }
> {
  const { paperId, ownerId } = opts;

  const rel = await query<{ i_follow: boolean; follows_me: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2) AS i_follow,
            EXISTS (SELECT 1 FROM follows WHERE follower_id = $2 AND followee_id = $1) AS follows_me`,
    [userId, ownerId],
  );
  if (!rel.rows[0]?.i_follow || !rel.rows[0]?.follows_me) return { ok: false, reason: 'not_mutual' };

  const owner = await query<{
    name: string | null;
    email: string;
    accept_pdf_requests: boolean;
    whatsapp_number: string | null;
  }>('SELECT name, email, accept_pdf_requests, whatsapp_number FROM users WHERE id = $1', [ownerId]);
  if (owner.rows.length === 0) return { ok: false, reason: 'not_mutual' };
  const o = owner.rows[0];
  if (!o.accept_pdf_requests) return { ok: false, reason: 'not_accepting' };

  const held = await query<{ pdf_url: string | null; is_open_access: boolean; title: string }>(
    `SELECT li.pdf_url, p.is_open_access, p.title
       FROM library_items li
       JOIN papers p ON p.id = li.paper_id
      WHERE li.user_id = $1 AND li.paper_id = $2`,
    [ownerId, paperId],
  );
  if (held.rows.length === 0 || !held.rows[0].pdf_url) return { ok: false, reason: 'no_pdf' };
  if (held.rows[0].is_open_access) return { ok: false, reason: 'open_access' };

  const title = held.rows[0].title;
  const digits = (o.whatsapp_number ?? '').replace(/\D/g, '');
  const channel: 'whatsapp' | 'email' = digits ? 'whatsapp' : 'email';

  const inserted = await query<{ id: string }>(
    `INSERT INTO pdf_requests (requester_id, owner_id, paper_id, channel)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, ownerId, paperId, channel],
  );

  const message =
    `Olá! Vi no EvidentiaDental que tens o PDF de "${title}". ` +
    `Podes partilhar comigo, por favor? Obrigado!`;

  let deeplink: string;
  if (channel === 'whatsapp') {
    deeplink = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  } else {
    const subject = `Pedido de artigo: ${title}`;
    deeplink = `mailto:${o.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
  }

  return { ok: true, result: { id: inserted.rows[0].id, channel, deeplink, ownerName: o.name } };
}

export interface IncomingPdfRequest {
  id: string;
  status: string;
  channel: string;
  created_at: string;
  requester_name: string | null;
  title: string;
  pmid: string | null;
}

export async function listIncomingPdfRequests(userId: string): Promise<IncomingPdfRequest[]> {
  const r = await query<IncomingPdfRequest>(
    `SELECT pr.id, pr.status, pr.channel, pr.created_at,
            u.name AS requester_name,
            p.title, p.pmid
       FROM pdf_requests pr
       JOIN users u  ON u.id = pr.requester_id
       JOIN papers p ON p.id = pr.paper_id
      WHERE pr.owner_id = $1
      ORDER BY (pr.status = 'pending') DESC, pr.created_at DESC
      LIMIT 100`,
    [userId],
  );
  return r.rows;
}

export async function resolvePdfRequest(
  userId: string,
  id: string,
  status: 'fulfilled' | 'declined',
): Promise<boolean> {
  const r = await query(
    `UPDATE pdf_requests SET status = $1, resolved_at = NOW()
      WHERE id = $2 AND (owner_id = $3 OR requester_id = $3) AND status = 'pending'`,
    [status, id, userId],
  );
  return r.rowCount > 0;
}
