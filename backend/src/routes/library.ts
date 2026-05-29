import { Router } from 'express';
import { z } from 'zod';
import { del } from '@vercel/blob';
import { authRequired } from '../middleware/auth.js';
import { config } from '../lib/config.js';
import {
  addToLibrary,
  listLibrary,
  listCollections,
  createCollection,
  renameCollection,
  deleteCollection,
  updateLibraryItem,
  removeLibraryItem,
  attachPdf,
  detachPdf,
} from '../services/library-service.js';

export const libraryRouter = Router();

libraryRouter.use(authRequired);

/** Best-effort delete of a blob (no-op if storage unconfigured). */
async function deleteBlob(url: string | null | undefined) {
  if (!url || !config.BLOB_READ_WRITE_TOKEN) return;
  try {
    await del(url, { token: config.BLOB_READ_WRITE_TOKEN });
  } catch (e: any) {
    console.error('[library] blob del failed:', e?.message ?? e);
  }
}

// ============================================================
// Collections (folders)
// ============================================================

// GET /api/library/collections — collections with item counts
libraryRouter.get('/collections', async (req, res) => {
  const collections = await listCollections(req.userId!);
  res.json({ collections });
});

// POST /api/library/collections — create a folder
libraryRouter.post('/collections', async (req, res) => {
  const schema = z.object({ name: z.string().trim().min(1).max(100) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const collection = await createCollection(req.userId!, parsed.data.name);
    res.json(collection);
  } catch (e: any) {
    if (e?.code === '23505') return res.status(409).json({ error: 'Já existe uma pasta com esse nome.' });
    console.error('[POST /library/collections]', e);
    res.status(500).json({ error: 'Internal error' });
  }
});

// PATCH /api/library/collections/:id — rename
libraryRouter.patch('/collections/:id', async (req, res) => {
  const schema = z.object({ name: z.string().trim().min(1).max(100) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const ok = await renameCollection(req.userId!, req.params.id, parsed.data.name);
    if (!ok) return res.status(404).json({ error: 'Pasta não encontrada (ou Inbox).' });
    res.json({ ok: true });
  } catch (e: any) {
    if (e?.code === '23505') return res.status(409).json({ error: 'Já existe uma pasta com esse nome.' });
    throw e;
  }
});

// DELETE /api/library/collections/:id — delete (items fall back to Inbox)
libraryRouter.delete('/collections/:id', async (req, res) => {
  const ok = await deleteCollection(req.userId!, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Pasta não encontrada (ou Inbox).' });
  res.json({ ok: true });
});

// ============================================================
// Items
// ============================================================

// POST /api/library — save a paper
libraryRouter.post('/', async (req, res) => {
  const schema = z.object({
    paperId: z.string().uuid(),
    collectionId: z.string().uuid().optional(),
    tags: z.array(z.string()).max(20).optional(),
    note: z.string().max(5000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const item = await addToLibrary(req.userId!, parsed.data);
    res.json(item);
  } catch (e: any) {
    console.error('[POST /library]', e);
    res.status(500).json({ error: e.message ?? 'Internal error' });
  }
});

// GET /api/library — list saved papers (optional ?collectionId= / ?tag=)
libraryRouter.get('/', async (req, res) => {
  const collectionId = typeof req.query.collectionId === 'string' ? req.query.collectionId : undefined;
  const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;
  const items = await listLibrary(req.userId!, { collectionId, tag });
  res.json({ items });
});

// PATCH /api/library/:id — move folder / update tags / note
libraryRouter.patch('/:id', async (req, res) => {
  const schema = z.object({
    collectionId: z.string().uuid().optional(),
    tags: z.array(z.string()).max(20).optional(),
    note: z.string().max(5000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const ok = await updateLibraryItem(req.userId!, req.params.id, parsed.data);
  if (!ok) return res.status(404).json({ error: 'Item não encontrado' });
  res.json({ ok: true });
});

// POST /api/library/:id/pdf — confirm an uploaded PDF (file already in Blob)
libraryRouter.post('/:id/pdf', async (req, res) => {
  const schema = z.object({
    url: z.string().url(),
    name: z.string().min(1).max(300),
    size: z.number().int().nonnegative(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const result = await attachPdf(req.userId!, req.params.id, parsed.data);
  if (!result) return res.status(404).json({ error: 'Item não encontrado' });
  // Replaced an existing PDF → delete the old blob.
  if (result.previousUrl && result.previousUrl !== parsed.data.url) await deleteBlob(result.previousUrl);
  res.json({ ok: true });
});

// DELETE /api/library/:id/pdf — remove the uploaded PDF
libraryRouter.delete('/:id/pdf', async (req, res) => {
  const result = await detachPdf(req.userId!, req.params.id);
  if (!result) return res.status(404).json({ error: 'Item não encontrado' });
  await deleteBlob(result.pdfUrl);
  res.json({ ok: true });
});

// DELETE /api/library/:id — remove a saved paper (and its PDF blob)
libraryRouter.delete('/:id', async (req, res) => {
  const result = await removeLibraryItem(req.userId!, req.params.id);
  if (!result) return res.status(404).json({ error: 'Item não encontrado' });
  await deleteBlob(result.pdfUrl);
  res.json({ ok: true });
});
