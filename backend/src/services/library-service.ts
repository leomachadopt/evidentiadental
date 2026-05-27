/**
 * Personal library service — a user's saved papers, organized in folders with
 * tags and notes. Backed by the `library_items` table (unique per user+paper).
 */

import { query } from '../db/client.js';

export interface LibraryItem {
  id: string;
  paper_id: string;
  folder: string;
  tags: string[];
  note: string | null;
  added_at: string;
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
}

export async function addToLibrary(
  userId: string,
  opts: { paperId: string; folder?: string; tags?: string[]; note?: string },
): Promise<{ id: string }> {
  const result = await query<{ id: string }>(
    `INSERT INTO library_items (user_id, paper_id, folder, tags, note)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, paper_id) DO UPDATE
       SET folder = EXCLUDED.folder,
           tags = EXCLUDED.tags,
           note = COALESCE(EXCLUDED.note, library_items.note)
     RETURNING id`,
    [userId, opts.paperId, opts.folder ?? 'Inbox', opts.tags ?? [], opts.note ?? null],
  );
  return result.rows[0];
}

export async function listLibrary(
  userId: string,
  opts: { folder?: string; tag?: string } = {},
): Promise<LibraryItem[]> {
  const conditions = ['li.user_id = $1'];
  const params: any[] = [userId];

  if (opts.folder) {
    params.push(opts.folder);
    conditions.push(`li.folder = $${params.length}`);
  }
  if (opts.tag) {
    params.push(opts.tag);
    conditions.push(`$${params.length} = ANY(li.tags)`);
  }

  const result = await query<LibraryItem>(
    `SELECT li.id, li.paper_id, li.folder, li.tags, li.note, li.added_at,
            p.pmid, p.doi, p.nct_id, p.title, p.authors, p.journal, p.year,
            p.is_open_access, p.oa_pdf_url
     FROM library_items li
     JOIN papers p ON p.id = li.paper_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY li.added_at DESC`,
    params,
  );
  return result.rows;
}

export async function listFolders(userId: string): Promise<Array<{ folder: string; count: number }>> {
  const result = await query<{ folder: string; count: string }>(
    `SELECT folder, COUNT(*)::int AS count
     FROM library_items
     WHERE user_id = $1
     GROUP BY folder
     ORDER BY folder`,
    [userId],
  );
  return result.rows.map((r) => ({ folder: r.folder, count: Number(r.count) }));
}

export async function updateLibraryItem(
  userId: string,
  itemId: string,
  patch: { folder?: string; tags?: string[]; note?: string },
): Promise<boolean> {
  const sets: string[] = [];
  const params: any[] = [];

  if (patch.folder !== undefined) {
    params.push(patch.folder);
    sets.push(`folder = $${params.length}`);
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

export async function removeLibraryItem(userId: string, itemId: string): Promise<boolean> {
  const result = await query('DELETE FROM library_items WHERE id = $1 AND user_id = $2', [
    itemId,
    userId,
  ]);
  return result.rowCount > 0;
}
