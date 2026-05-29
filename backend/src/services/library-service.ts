/**
 * Personal library service — a user's saved papers, organized in collections
 * (folders) with tags, notes and an optional uploaded PDF. Backed by
 * `library_items` (unique per user+paper) + `collections`. The PDF binary lives
 * in object storage; we only keep its URL/metadata here.
 */

import { query, withTransaction } from '../db/client.js';

export interface LibraryItem {
  id: string;
  paper_id: string;
  collection_id: string | null;
  collection_name: string | null;
  tags: string[];
  note: string | null;
  added_at: string;
  pdf_url: string | null;
  pdf_name: string | null;
  pdf_size: number | null;
  // joined paper fields
  pmid: string | null;
  doi: string | null;
  nct_id: string | null;
  title: string;
  authors: any;
  journal: string | null;
  year: number | null;
  is_open_access: boolean;
  oa_pdf_url: string | null;
  // a mutually-followed colleague who has this paper's PDF and accepts requests
  // (only relevant for paywalled papers I don't already have)
  colleague_id: string | null;
  colleague_name: string | null;
}

export interface Collection {
  id: string;
  name: string;
  count: number;
}

// ----------------------------------------------------------------------------
// Collections
// ----------------------------------------------------------------------------

/** Get (creating if needed) the user's default "Inbox" collection id. */
export async function ensureInbox(userId: string): Promise<string> {
  await query(
    `INSERT INTO collections (user_id, name) VALUES ($1, 'Inbox')
     ON CONFLICT (user_id, name) DO NOTHING`,
    [userId],
  );
  const r = await query<{ id: string }>(
    `SELECT id FROM collections WHERE user_id = $1 AND name = 'Inbox'`,
    [userId],
  );
  return r.rows[0].id;
}

export async function listCollections(userId: string): Promise<Collection[]> {
  // Make sure every user has at least the Inbox so the UI has a home folder.
  await ensureInbox(userId);
  const result = await query<{ id: string; name: string; count: string }>(
    `SELECT c.id, c.name, COUNT(li.id)::int AS count
       FROM collections c
       LEFT JOIN library_items li ON li.collection_id = c.id
      WHERE c.user_id = $1
      GROUP BY c.id, c.name
      ORDER BY (c.name = 'Inbox') DESC, lower(c.name)`,
    [userId],
  );
  return result.rows.map((r) => ({ id: r.id, name: r.name, count: Number(r.count) }));
}

export async function createCollection(userId: string, name: string): Promise<Collection> {
  const r = await query<{ id: string; name: string }>(
    `INSERT INTO collections (user_id, name) VALUES ($1, $2) RETURNING id, name`,
    [userId, name],
  );
  return { id: r.rows[0].id, name: r.rows[0].name, count: 0 };
}

export async function renameCollection(userId: string, id: string, name: string): Promise<boolean> {
  const r = await query(
    `UPDATE collections SET name = $1 WHERE id = $2 AND user_id = $3 AND name <> 'Inbox'`,
    [name, id, userId],
  );
  return r.rowCount > 0;
}

/** Delete a collection (never Inbox); its items fall back to Inbox. */
export async function deleteCollection(userId: string, id: string): Promise<boolean> {
  return withTransaction(async (client) => {
    const owned = await client.query(
      `SELECT name FROM collections WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    if (owned.rows.length === 0 || owned.rows[0].name === 'Inbox') return false;

    const inboxRes = await client.query(
      `INSERT INTO collections (user_id, name) VALUES ($1, 'Inbox')
       ON CONFLICT (user_id, name) DO UPDATE SET name = 'Inbox'
       RETURNING id`,
      [userId],
    );
    const inboxId = inboxRes.rows[0].id;
    await client.query(
      `UPDATE library_items SET collection_id = $1 WHERE collection_id = $2 AND user_id = $3`,
      [inboxId, id, userId],
    );
    await client.query(`DELETE FROM collections WHERE id = $1 AND user_id = $2`, [id, userId]);
    return true;
  });
}

/** Resolve a requested collection id to one the user owns, else their Inbox. */
async function resolveCollectionId(userId: string, collectionId?: string): Promise<string> {
  if (collectionId) {
    const r = await query(`SELECT 1 FROM collections WHERE id = $1 AND user_id = $2`, [
      collectionId,
      userId,
    ]);
    if (r.rows.length > 0) return collectionId;
  }
  return ensureInbox(userId);
}

// ----------------------------------------------------------------------------
// Items
// ----------------------------------------------------------------------------

export async function addToLibrary(
  userId: string,
  opts: { paperId: string; collectionId?: string; tags?: string[]; note?: string },
): Promise<{ id: string }> {
  const collectionId = await resolveCollectionId(userId, opts.collectionId);
  const result = await query<{ id: string }>(
    `INSERT INTO library_items (user_id, paper_id, collection_id, tags, note)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, paper_id) DO UPDATE
       SET collection_id = EXCLUDED.collection_id,
           tags = EXCLUDED.tags,
           note = COALESCE(EXCLUDED.note, library_items.note)
     RETURNING id`,
    [userId, opts.paperId, collectionId, opts.tags ?? [], opts.note ?? null],
  );
  return result.rows[0];
}

export async function listLibrary(
  userId: string,
  opts: { collectionId?: string; tag?: string } = {},
): Promise<LibraryItem[]> {
  const conditions = ['li.user_id = $1'];
  const params: any[] = [userId];

  if (opts.collectionId) {
    params.push(opts.collectionId);
    conditions.push(`li.collection_id = $${params.length}`);
  }
  if (opts.tag) {
    params.push(opts.tag);
    conditions.push(`$${params.length} = ANY(li.tags)`);
  }

  const result = await query<LibraryItem>(
    `SELECT li.id, li.paper_id, li.collection_id, c.name AS collection_name,
            li.tags, li.note, li.added_at, li.pdf_url, li.pdf_name, li.pdf_size,
            p.pmid, p.doi, p.nct_id, p.title, p.authors, p.journal, p.year,
            p.is_open_access, p.oa_pdf_url,
            col.colleague_id, col.colleague_name
       FROM library_items li
       JOIN papers p ON p.id = li.paper_id
       LEFT JOIN collections c ON c.id = li.collection_id
       LEFT JOIN LATERAL (
         SELECT u2.id AS colleague_id, u2.name AS colleague_name
           FROM follows f1
           JOIN follows f2 ON f2.follower_id = f1.followee_id AND f2.followee_id = $1
           JOIN users u2 ON u2.id = f1.followee_id
           JOIN library_items oli
             ON oli.user_id = u2.id AND oli.paper_id = li.paper_id AND oli.pdf_url IS NOT NULL
          WHERE f1.follower_id = $1 AND u2.accept_pdf_requests = TRUE
          LIMIT 1
       ) col ON TRUE
      WHERE ${conditions.join(' AND ')}
      ORDER BY li.added_at DESC`,
    params,
  );
  return result.rows;
}

export async function updateLibraryItem(
  userId: string,
  itemId: string,
  patch: { collectionId?: string; tags?: string[]; note?: string },
): Promise<boolean> {
  const sets: string[] = [];
  const params: any[] = [];

  if (patch.collectionId !== undefined) {
    const collectionId = await resolveCollectionId(userId, patch.collectionId);
    params.push(collectionId);
    sets.push(`collection_id = $${params.length}`);
  }
  if (patch.tags !== undefined) {
    params.push(patch.tags);
    sets.push(`tags = $${params.length}`);
  }
  if (patch.note !== undefined) {
    params.push(patch.note);
    sets.push(`note = $${params.length}`);
  }
  if (sets.length === 0) return false;

  params.push(itemId, userId);
  const result = await query(
    `UPDATE library_items SET ${sets.join(', ')}
     WHERE id = $${params.length - 1} AND user_id = $${params.length}`,
    params,
  );
  return result.rowCount > 0;
}

/** Returns the removed item's pdf_url (if any) so the caller can delete the blob. */
export async function removeLibraryItem(userId: string, itemId: string): Promise<{ pdfUrl: string | null } | null> {
  const result = await query<{ pdf_url: string | null }>(
    'DELETE FROM library_items WHERE id = $1 AND user_id = $2 RETURNING pdf_url',
    [itemId, userId],
  );
  if (result.rowCount === 0) return null;
  return { pdfUrl: result.rows[0].pdf_url };
}

// ----------------------------------------------------------------------------
// PDF attachment (file lives in object storage; we store URL + metadata)
// ----------------------------------------------------------------------------

/** Attach an uploaded PDF; returns the previous pdf_url (to clean up) or null. */
export async function attachPdf(
  userId: string,
  itemId: string,
  pdf: { url: string; name: string; size: number },
): Promise<{ previousUrl: string | null } | null> {
  const prev = await query<{ pdf_url: string | null }>(
    `SELECT pdf_url FROM library_items WHERE id = $1 AND user_id = $2`,
    [itemId, userId],
  );
  if (prev.rowCount === 0) return null;
  await query(
    `UPDATE library_items SET pdf_url = $1, pdf_name = $2, pdf_size = $3
      WHERE id = $4 AND user_id = $5`,
    [pdf.url, pdf.name, pdf.size, itemId, userId],
  );
  return { previousUrl: prev.rows[0].pdf_url };
}

/** Detach the PDF; returns the removed pdf_url so the caller can delete the blob. */
export async function detachPdf(userId: string, itemId: string): Promise<{ pdfUrl: string | null } | null> {
  const prev = await query<{ pdf_url: string | null }>(
    `SELECT pdf_url FROM library_items WHERE id = $1 AND user_id = $2`,
    [itemId, userId],
  );
  if (prev.rowCount === 0) return null;
  await query(
    `UPDATE library_items SET pdf_url = NULL, pdf_name = NULL, pdf_size = NULL
      WHERE id = $1 AND user_id = $2`,
    [itemId, userId],
  );
  return { pdfUrl: prev.rows[0].pdf_url };
}
