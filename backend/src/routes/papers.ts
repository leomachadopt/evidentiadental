import { Router } from 'express';
import { query } from '../db/client.js';
import { authRequired } from '../middleware/auth.js';
import { getSettings } from './settings.js';
import { resolveFullTextAccess } from '../services/fulltext-service.js';

export const papersRouter = Router();
papersRouter.use(authRequired);

// GET /api/papers/:id/access — aggregate legal full-text access routes
papersRouter.get('/:id/access', async (req, res) => {
  try {
    const settings = await getSettings(req.userId!);
    const result = await resolveFullTextAccess(req.params.id as string, settings);
    await query(
      `INSERT INTO usage_events (user_id, event_type, resource_id) VALUES ($1, 'fulltext_lookup', $2)`,
      [req.userId, req.params.id],
    );
    res.json(result);
  } catch (e: any) {
    if (e.message === 'Paper not found') return res.status(404).json({ error: 'Artigo não encontrado' });
    console.error('[GET /papers/:id/access]', e);
    res.status(500).json({ error: e.message ?? 'Internal error' });
  }
});
