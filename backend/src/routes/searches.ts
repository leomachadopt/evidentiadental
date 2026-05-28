import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/client.js';
import { authRequired } from '../middleware/auth.js';
import { monthlyLimit } from '../middleware/tier-limits.js';
import { createSearch, executeSearch } from '../services/search-service.js';
import { generateSynthesis } from '../services/synthesis-service.js';

export const searchesRouter = Router();

// All routes require auth
searchesRouter.use(authRequired);

// ============================================================
// POST /api/searches — create a new search (generates PICO)
// ============================================================
searchesRouter.post('/', monthlyLimit('search'), async (req, res) => {
  const schema = z.object({ question: z.string().min(10).max(1000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await createSearch(req.userId!, parsed.data.question);
    res.json(result);
  } catch (e: any) {
    console.error('[POST /searches]', e);
    res.status(500).json({ error: e.message ?? 'Internal error' });
  }
});

// ============================================================
// POST /api/searches/:id/execute — run the actual PubMed query
// ============================================================
searchesRouter.post('/:id/execute', async (req, res) => {
  const schema = z.object({ maxResults: z.number().int().min(5).max(100).default(30) });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await executeSearch(req.params.id, req.userId!, { maxResults: parsed.data.maxResults });
    res.json(result);
  } catch (e: any) {
    console.error('[POST /searches/:id/execute]', e);
    res.status(500).json({ error: e.message ?? 'Internal error' });
  }
});

// ============================================================
// PATCH /api/searches/:id — update PICO before executing
// ============================================================
searchesRouter.patch('/:id', async (req, res) => {
  const schema = z.object({ pico: z.record(z.any()) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const result = await query(
    `UPDATE searches SET pico = $1 WHERE id = $2 AND user_id = $3 RETURNING *`,
    [JSON.stringify(parsed.data.pico), req.params.id, req.userId],
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Search not found' });
  res.json(result.rows[0]);
});

// ============================================================
// GET /api/searches — list user searches
// ============================================================
searchesRouter.get('/', async (req, res) => {
  const result = await query(
    `SELECT id, raw_question, status, total_results, created_at, completed_at
     FROM searches WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.userId],
  );
  res.json({ searches: result.rows });
});

// ============================================================
// GET /api/searches/:id — get search with results
// ============================================================
searchesRouter.get('/:id', async (req, res) => {
  const searchRes = await query(
    'SELECT * FROM searches WHERE id = $1 AND user_id = $2',
    [req.params.id, req.userId],
  );
  if (searchRes.rows.length === 0) return res.status(404).json({ error: 'Search not found' });

  const resultsRes = await query(
    `SELECT sr.id as result_id, sr.relevance_score, sr.relevance_reasoning, sr.position,
            sr.selected_for_synthesis, sr.user_tags, sr.user_note,
            p.id as paper_id, p.pmid, p.doi, p.nct_id, p.source, p.title, p.authors,
            p.journal, p.year, p.abstract, p.publication_types, p.is_open_access, p.oa_pdf_url
     FROM search_results sr
     JOIN papers p ON p.id = sr.paper_id
     WHERE sr.search_id = $1
     ORDER BY sr.relevance_score DESC NULLS LAST, sr.position ASC`,
    [req.params.id],
  );

  res.json({ search: searchRes.rows[0], results: resultsRes.rows });
});

// ============================================================
// POST /api/searches/:id/synthesis — generate mini-synthesis
// ============================================================
searchesRouter.post('/:id/synthesis', monthlyLimit('synthesis'), async (req, res) => {
  const schema = z.object({
    selectedPaperIds: z.array(z.string().uuid()).min(2).max(20),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await generateSynthesis({
      searchId: req.params.id as string,
      userId: req.userId!,
      selectedPaperIds: parsed.data.selectedPaperIds,
    });
    res.json(result);
  } catch (e: any) {
    console.error('[POST /synthesis]', e);
    res.status(500).json({ error: e.message ?? 'Internal error' });
  }
});

// ============================================================
// GET /api/searches/:id/synthesis — get latest synthesis
// ============================================================
searchesRouter.get('/:id/synthesis', async (req, res) => {
  const result = await query(
    `SELECT s.* FROM syntheses s
     JOIN searches se ON se.id = s.search_id
     WHERE s.search_id = $1 AND se.user_id = $2
     ORDER BY s.created_at DESC LIMIT 1`,
    [req.params.id, req.userId],
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'No synthesis yet' });
  res.json(result.rows[0]);
});
