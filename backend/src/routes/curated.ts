import { Router } from 'express';
import { query } from '../db/client.js';
import { authRequired } from '../middleware/auth.js';

export const curatedRouter = Router();

curatedRouter.use(authRequired);

// GET /api/curated — list curated queries (optional ?area=)
curatedRouter.get('/', async (req, res) => {
  const area = typeof req.query.area === 'string' ? req.query.area : undefined;
  const params: any[] = [];
  let where = '';
  if (area) {
    params.push(area);
    where = 'WHERE area = $1';
  }
  const result = await query(
    `SELECT id, area, subarea, clinical_question, description, is_validated, usage_count
     FROM curated_queries ${where}
     ORDER BY area, subarea NULLS FIRST, clinical_question`,
    params,
  );
  res.json({ queries: result.rows });
});

// GET /api/curated/areas — distinct areas with counts
curatedRouter.get('/areas', async (_req, res) => {
  const result = await query<{ area: string; count: string }>(
    `SELECT area, COUNT(*)::int AS count FROM curated_queries GROUP BY area ORDER BY area`,
  );
  res.json({ areas: result.rows.map((r) => ({ area: r.area, count: Number(r.count) })) });
});

// POST /api/curated/:id/instantiate — create a search pre-filled from a curated query
curatedRouter.post('/:id/instantiate', async (req, res) => {
  const curatedRes = await query<{
    clinical_question: string;
    pico_template: any;
    pubmed_query: string;
  }>(
    `SELECT clinical_question, pico_template, pubmed_query FROM curated_queries WHERE id = $1`,
    [req.params.id],
  );
  if (curatedRes.rows.length === 0) return res.status(404).json({ error: 'Query curada não encontrada' });

  const curated = curatedRes.rows[0];
  const template = typeof curated.pico_template === 'string' ? JSON.parse(curated.pico_template) : curated.pico_template;

  // Curated queries already carry a validated PICO + PubMed query, so we skip
  // the Claude PICO step and go straight to 'pico_ready'.
  const pico = {
    population: template.population ?? '',
    intervention: template.intervention ?? '',
    comparator: template.comparator ?? 'none',
    outcomes: template.outcomes ?? [],
    assumptions: template.assumptions ?? [],
    pubmed_query: curated.pubmed_query,
    rationale: 'Query curada e validada clinicamente.',
  };

  const searchRes = await query<{ id: string }>(
    `INSERT INTO searches (user_id, raw_question, pico, status)
     VALUES ($1, $2, $3, 'pico_ready')
     RETURNING id`,
    [req.userId!, curated.clinical_question, JSON.stringify(pico)],
  );

  await query('UPDATE curated_queries SET usage_count = usage_count + 1 WHERE id = $1', [req.params.id]);
  await query(
    `INSERT INTO usage_events (user_id, event_type, resource_id) VALUES ($1, 'curated_instantiate', $2)`,
    [req.userId!, searchRes.rows[0].id],
  );

  res.json({ searchId: searchRes.rows[0].id });
});
