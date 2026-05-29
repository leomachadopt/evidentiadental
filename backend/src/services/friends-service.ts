/**
 * Social layer — mutual friendships, a feed of friends' saved papers, and
 * "reprint"-style PDF requests.
 *
 * NON-NEGOTIABLE: this service never moves a paywalled PDF. For open-access
 * papers the requester gets the file through the existing legal access route
 * (`GET /api/papers/:id/access`). For paywalled papers that a friend happens to
 * have, we only record the request and hand back an external deep-link
 * (WhatsApp / email) so the exchange happens peer-to-peer, off-platform —
 * exactly the decades-old "reprint request", never a redistribution by us.
 *
 * A friend's private per-item `note` is NEVER exposed. We share only the fact
 * that a paper was saved, and when.
 */

import { query } from '../db/client.js';

export interface Friend {
  friendship_id: string;
  id: string;
  name: string | null;
  email: string;
  avatar_url: string | null;
  since: string;
}

export interface PendingRequest {
  friendship_id: string;
  id: string;
  name: string | null;
  email: string;
  avatar_url: string | null;
  created_at: string;
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
  in_my_library: boolean;
}

// ----------------------------------------------------------------------------
// Friendship graph
// ----------------------------------------------------------------------------

export type FriendRequestStatus =
  | 'sent'
  | 'accepted'
  | 'already_pending'
  | 'already_friends'
  | 'self'
  | 'not_found'
  | 'blocked';

/** Send a friend request to a user found by email. */
export async function sendFriendRequest(
  userId: string,
  targetEmail: string,
): Promise<{ status: FriendRequestStatus }> {
  const target = await query<{ id: string }>(
    'SELECT id FROM users WHERE lower(email) = lower($1)',
    [targetEmail],
  );
  if (target.rows.length === 0) return { status: 'not_found' };
  return sendFriendRequestById(userId, target.rows[0].id);
}

/** Send a friend request to a user found by id (used by name search). */
export async function sendFriendRequestById(
  userId: string,
  targetId: string,
): Promise<{ status: FriendRequestStatus }> {
  if (targetId === userId) return { status: 'self' };
  const exists = await query('SELECT 1 FROM users WHERE id = $1', [targetId]);
  if (exists.rows.length === 0) return { status: 'not_found' };

  const existing = await query<{ id: string; requester_id: string; addressee_id: string; status: string }>(
    `SELECT id, requester_id, addressee_id, status FROM friendships
      WHERE (requester_id = $1 AND addressee_id = $2)
         OR (requester_id = $2 AND addressee_id = $1)`,
    [userId, targetId],
  );

  if (existing.rows.length > 0) {
    const f = existing.rows[0];
    if (f.status === 'accepted') return { status: 'already_friends' };
    if (f.status === 'blocked') return { status: 'blocked' };
    // pending: if the other side already invited me, accept it now.
    if (f.addressee_id === userId) {
      await query(
        `UPDATE friendships SET status = 'accepted', responded_at = NOW() WHERE id = $1`,
        [f.id],
      );
      return { status: 'accepted' };
    }
    return { status: 'already_pending' };
  }

  await query(
    `INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'pending')`,
    [userId, targetId],
  );
  return { status: 'sent' };
}

/** Accept or decline an incoming request. Only the addressee may respond. */
export async function respondFriendRequest(
  userId: string,
  friendshipId: string,
  accept: boolean,
): Promise<boolean> {
  if (accept) {
    const r = await query(
      `UPDATE friendships SET status = 'accepted', responded_at = NOW()
        WHERE id = $1 AND addressee_id = $2 AND status = 'pending'`,
      [friendshipId, userId],
    );
    return r.rowCount > 0;
  }
  // Decline = delete the row so a fresh request is possible later.
  const r = await query(
    `DELETE FROM friendships WHERE id = $1 AND addressee_id = $2 AND status = 'pending'`,
    [friendshipId, userId],
  );
  return r.rowCount > 0;
}

export async function listFriends(userId: string): Promise<Friend[]> {
  const r = await query<Friend>(
    `SELECT f.id AS friendship_id, f.created_at AS since,
            u.id, u.name, u.email, u.avatar_url
       FROM friendships f
       JOIN users u
         ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
      WHERE f.status = 'accepted' AND $1 IN (f.requester_id, f.addressee_id)
      ORDER BY u.name NULLS LAST, u.email`,
    [userId],
  );
  return r.rows;
}

export async function listPendingIncoming(userId: string): Promise<PendingRequest[]> {
  const r = await query<PendingRequest>(
    `SELECT f.id AS friendship_id, f.created_at, u.id, u.name, u.email, u.avatar_url
       FROM friendships f
       JOIN users u ON u.id = f.requester_id
      WHERE f.addressee_id = $1 AND f.status = 'pending'
      ORDER BY f.created_at DESC`,
    [userId],
  );
  return r.rows;
}

/** Remove a friendship (any direction, any status) between me and friendId. */
export async function removeFriend(userId: string, friendId: string): Promise<boolean> {
  const r = await query(
    `DELETE FROM friendships
      WHERE (requester_id = $1 AND addressee_id = $2)
         OR (requester_id = $2 AND addressee_id = $1)`,
    [userId, friendId],
  );
  return r.rowCount > 0;
}

export interface UserSearchResult {
  id: string;
  name: string | null;
  speciality: string | null;
  city: string | null;
  avatar_url: string | null;
  // relationship with the searcher: none | pending_out | pending_in | friends
  relationship: 'none' | 'pending_out' | 'pending_in' | 'friends';
}

/**
 * Find discoverable users by name (case-insensitive). Never returns email.
 * Each hit carries the relationship status so the UI shows the right action.
 */
export async function searchUsers(userId: string, term: string): Promise<UserSearchResult[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const rows = await query<{
    id: string;
    name: string | null;
    speciality: string | null;
    city: string | null;
    avatar_url: string | null;
    status: string | null;
    requester_id: string | null;
  }>(
    `SELECT u.id, u.name, u.speciality, u.city, u.avatar_url,
            f.status, f.requester_id
       FROM users u
       LEFT JOIN friendships f
         ON (f.requester_id = $1 AND f.addressee_id = u.id)
         OR (f.requester_id = u.id AND f.addressee_id = $1)
      WHERE u.id <> $1
        AND u.discoverable = TRUE
        AND u.name ILIKE '%' || $2 || '%'
      ORDER BY u.name
      LIMIT 20`,
    [userId, q],
  );
  return rows.rows.map((r) => {
    let relationship: UserSearchResult['relationship'] = 'none';
    if (r.status === 'accepted') relationship = 'friends';
    else if (r.status === 'pending') relationship = r.requester_id === userId ? 'pending_out' : 'pending_in';
    return {
      id: r.id,
      name: r.name,
      speciality: r.speciality,
      city: r.city,
      avatar_url: r.avatar_url,
      relationship,
    };
  });
}

// ----------------------------------------------------------------------------
// Activity feed (never selects the private `note`)
// ----------------------------------------------------------------------------

export async function friendActivity(userId: string, limit = 50): Promise<ActivityItem[]> {
  const r = await query<ActivityItem>(
    `SELECT li.added_at, p.id AS paper_id, p.pmid, p.doi, p.title, p.authors,
            p.journal, p.year, p.is_open_access,
            u.id AS friend_id, u.name AS friend_name, u.avatar_url AS friend_avatar,
            (li.pdf_url IS NOT NULL) AS friend_has_pdf,
            u.accept_pdf_requests AS friend_accepts_requests,
            EXISTS (
              SELECT 1 FROM library_items mine
               WHERE mine.user_id = $1 AND mine.paper_id = p.id
            ) AS in_my_library
       FROM library_items li
       JOIN users u  ON u.id = li.user_id
       JOIN papers p ON p.id = li.paper_id
      WHERE u.share_library_activity = TRUE
        AND li.user_id IN (
              SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END
                FROM friendships
               WHERE status = 'accepted' AND $1 IN (requester_id, addressee_id)
            )
      ORDER BY li.added_at DESC
      LIMIT $2`,
    [userId, limit],
  );
  return r.rows;
}

// ----------------------------------------------------------------------------
// PDF requests ("reprint") — the file moves off-platform via the deep-link
// ----------------------------------------------------------------------------

export interface PdfRequestResult {
  id: string;
  channel: 'whatsapp' | 'email';
  deeplink: string;
  ownerName: string | null;
}

/**
 * Record a PDF request to a friend who has the (paywalled) PDF and build an
 * external deep-link for the actual hand-off. Rejects OA papers (the requester
 * should use the legal OA access route instead) and any case where the friend
 * doesn't actually hold the file or hasn't opted in to receive requests.
 */
export async function createPdfRequest(
  userId: string,
  opts: { paperId: string; ownerId: string },
): Promise<
  | { ok: true; result: PdfRequestResult }
  | { ok: false; reason: 'not_friends' | 'not_accepting' | 'open_access' | 'no_pdf' }
> {
  const { paperId, ownerId } = opts;

  const friends = await query(
    `SELECT 1 FROM friendships
      WHERE status = 'accepted'
        AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`,
    [userId, ownerId],
  );
  if (friends.rows.length === 0) return { ok: false, reason: 'not_friends' };

  const owner = await query<{
    name: string | null;
    email: string;
    accept_pdf_requests: boolean;
    whatsapp_number: string | null;
  }>(
    'SELECT name, email, accept_pdf_requests, whatsapp_number FROM users WHERE id = $1',
    [ownerId],
  );
  if (owner.rows.length === 0) return { ok: false, reason: 'not_friends' };
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
  requester_email: string;
  title: string;
  pmid: string | null;
}

export async function listIncomingPdfRequests(userId: string): Promise<IncomingPdfRequest[]> {
  const r = await query<IncomingPdfRequest>(
    `SELECT pr.id, pr.status, pr.channel, pr.created_at,
            u.name AS requester_name, u.email AS requester_email,
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

/** Resolve a request. Both the owner and the requester may close it. */
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
