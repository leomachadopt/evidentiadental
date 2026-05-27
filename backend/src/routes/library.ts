import { Router } from 'express';
import { z } from 'zod';
import { authRequired } from '../middleware/auth.js';
import {
  addToLibrary,
  listLibrary,
  listFolders,
  updateLibraryItem,
  removeLibraryItem,
} from '../services/library-service.js';

export const libraryRouter = Router();

libraryRouter.use(authRequired);

// POST /api/library — save a paper
libraryRouter.post('/', async (req, res) => {
  const schema = z.object({
    paperId: z.string().uuid(),
    folder: z.string().min(1).max(100).optional(),
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

// GET /api/library — list saved papers (optional ?folder= / ?tag=)
libraryRouter.get('/', async (req, res) => {
  const folder = typeof req.query.folder === 'string' ? req.query.folder : undefined;
  const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;
  const items = await listLibrary(req.userId!, { folder, tag });
  res.json({ items });
});

// GET /api/library/folders — folders with counts
libraryRouter.get('/folders', async (req, res) => {
  const folders = await listFolders(req.userId!);
  res.json({ folders });
});

// PATCH /api/library/:id — update folder/tags/note
libraryRouter.patch('/:id', async (req, res) => {
  const schema = z.object({
    folder: z.string().min(1).max(100).optional(),
    tags: z.array(z.string()).max(20).optional(),
    note: z.string().max(5000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const ok = await updateLibraryItem(req.userId!, req.params.id, parsed.data);
  if (!ok) return res.status(404).json({ error: 'Item não encontrado' });
  res.json({ ok: true });
});

// DELETE /api/library/:id — remove a saved paper
libraryRouter.delete('/:id', async (req, res) => {
  const ok = await removeLibraryItem(req.userId!, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Item não encontrado' });
  res.json({ ok: true });
});
