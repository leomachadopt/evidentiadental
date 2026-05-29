import { Router } from 'express';
import { z } from 'zod';
import { put } from '@vercel/blob';
import { authRequired } from '../middleware/auth.js';
import { query } from '../db/client.js';
import { config } from '../lib/config.js';
import { addToLibrary, attachPdf } from '../services/library-service.js';
import {
  followUser,
  unfollowUser,
  listFollowing,
  listFollowers,
  searchUsers,
  friendActivity,
  userProfile,
  getImportablePdf,
  createPdfRequest,
  listIncomingPdfRequests,
  resolvePdfRequest,
} from '../services/friends-service.js';

export const friendsRouter = Router();
friendsRouter.use(authRequired);

/** Best-effort product analytics; never blocks the request. */
async function track(userId: string, eventType: string, resourceId?: string) {
  try {
    await query(
      `INSERT INTO usage_events (user_id, event_type, resource_id) VALUES ($1, $2, $3)`,
      [userId, eventType, resourceId ?? null],
    );
  } catch (e: any) {
    console.error('[friends] usage track failed:', e?.message ?? e);
  }
}

// ============================================================
// Follow graph
// ============================================================

// GET /api/friends/following — people I follow (with follows_me)
friendsRouter.get('/following', async (req, res) => {
  res.json({ following: await listFollowing(req.userId!) });
});

// GET /api/friends/followers — people who follow me (with i_follow)
friendsRouter.get('/followers', async (req, res) => {
  res.json({ followers: await listFollowers(req.userId!) });
});

// GET /api/friends/search?q= — find discoverable users by name/speciality/city
friendsRouter.get('/search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  res.json({ results: await searchUsers(req.userId!, q) });
});

// GET /api/friends/activity — saves of people I follow (no private notes)
friendsRouter.get('/activity', async (req, res) => {
  res.json({ activity: await friendActivity(req.userId!) });
});

// POST /api/friends/follow { userId } — start following (instant)
friendsRouter.post('/follow', async (req, res) => {
  const schema = z.object({ userId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { status } = await followUser(req.userId!, parsed.data.userId);
  if (status === 'self') return res.status(400).json({ error: 'Não te podes seguir a ti próprio.' });
  if (status === 'not_found') return res.status(404).json({ error: 'Utilizador não encontrado.' });
  if (status === 'followed') await track(req.userId!, 'follow', parsed.data.userId);
  res.json({ status });
});

// DELETE /api/friends/follow/:userId — stop following
friendsRouter.delete('/follow/:userId', async (req, res) => {
  const ok = await unfollowUser(req.userId!, req.params.userId);
  if (!ok) return res.status(404).json({ error: 'Não seguias este utilizador.' });
  res.json({ ok: true });
});

// GET /api/friends/:userId/profile — a user's profile + their saves (if visible)
friendsRouter.get('/:userId/profile', async (req, res) => {
  const data = await userProfile(req.userId!, req.params.userId);
  if (!data) return res.status(404).json({ error: 'Utilizador não encontrado.' });
  res.json(data);
});

// ============================================================
// Import (metadata; copies the friend's OA PDF into our own blob)
// ============================================================

/** Duplicate a (public, OA) PDF blob into our own storage; returns the new URL. */
async function copyPdfBlob(srcUrl: string, name: string | null): Promise<{ url: string; size: number }> {
  const res = await fetch(srcUrl);
  if (!res.ok) throw new Error(`fetch blob ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const safe = (name ?? 'artigo.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
  const blob = await put(`library/import/${Date.now()}-${safe}`, buf, {
    access: 'public',
    contentType: 'application/pdf',
    token: config.BLOB_READ_WRITE_TOKEN!,
  });
  return { url: blob.url, size: buf.length };
}

// POST /api/friends/import { paperId, ownerId?, collectionId? }
friendsRouter.post('/import', async (req, res) => {
  const schema = z.object({
    paperId: z.string().uuid(),
    ownerId: z.string().uuid().optional(),
    collectionId: z.string().uuid().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const item = await addToLibrary(req.userId!, {
    paperId: parsed.data.paperId,
    collectionId: parsed.data.collectionId,
  });

  // Best-effort: copy the friend's OA PDF into the importer's own storage.
  if (parsed.data.ownerId && config.BLOB_READ_WRITE_TOKEN) {
    try {
      const src = await getImportablePdf(req.userId!, parsed.data.ownerId, parsed.data.paperId);
      if (src) {
        const copied = await copyPdfBlob(src.url, src.name);
        await attachPdf(req.userId!, item.id, {
          url: copied.url,
          name: src.name ?? 'artigo.pdf',
          size: src.size ?? copied.size,
        });
      }
    } catch (e: any) {
      console.error('[friends] OA pdf copy failed:', e?.message ?? e);
    }
  }

  await track(req.userId!, 'friend_import', parsed.data.paperId);
  res.json(item);
});

// ============================================================
// PDF requests ("reprint" — mutual follow required, file moves off-platform)
// ============================================================

// POST /api/friends/pdf-requests { paperId, ownerId } — returns external deep-link
friendsRouter.post('/pdf-requests', async (req, res) => {
  const schema = z.object({ paperId: z.string().uuid(), ownerId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const out = await createPdfRequest(req.userId!, parsed.data);
  if (!out.ok) {
    const messages: Record<string, string> = {
      not_mutual: 'Só podes pedir PDFs a quem te segue e que tu segues de volta.',
      not_accepting: 'Este colega não está a aceitar pedidos de PDF.',
      open_access: 'Este artigo é de acesso aberto — usa o acesso direto.',
      no_pdf: 'O teu colega já não tem o PDF deste artigo.',
    };
    const code = out.reason === 'not_mutual' || out.reason === 'not_accepting' ? 403 : 409;
    return res.status(code).json({ error: messages[out.reason] });
  }
  await track(req.userId!, 'pdf_request', parsed.data.paperId);
  res.json(out.result);
});

// GET /api/friends/pdf-requests/incoming — requests others made to me
friendsRouter.get('/pdf-requests/incoming', async (req, res) => {
  res.json({ requests: await listIncomingPdfRequests(req.userId!) });
});

// PATCH /api/friends/pdf-requests/:id { status } — fulfilled / declined
friendsRouter.patch('/pdf-requests/:id', async (req, res) => {
  const schema = z.object({ status: z.enum(['fulfilled', 'declined']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const ok = await resolvePdfRequest(req.userId!, req.params.id, parsed.data.status);
  if (!ok) return res.status(404).json({ error: 'Pedido não encontrado.' });
  res.json({ ok: true });
});
