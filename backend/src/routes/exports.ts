import { Router } from 'express';
import { query } from '../db/client.js';
import { authRequired } from '../middleware/auth.js';
import {
  buildSynthesisMarkdown,
  buildSynthesisHtml,
  type ExportPaper,
  type ExportSynthesis,
} from '../services/export-service.js';

export const exportsRouter = Router();

exportsRouter.use(authRequired);

/**
 * Load the latest synthesis for a search (owned by the user) plus its cited
 * papers, ready to render in any export format.
 */
async function loadSynthesis(searchId: string, userId: string): Promise<ExportSynthesis | null> {
  const res = await query<{
    raw_question: string;
    synthesis_md: string;
    evidence_strength: string | null;
    created_at: string;
    selected_paper_ids: string[];
  }>(
    `SELECT se.raw_question, s.synthesis_md, s.evidence_strength, s.created_at, s.selected_paper_ids
     FROM syntheses s
     JOIN searches se ON se.id = s.search_id
     WHERE s.search_id = $1 AND se.user_id = $2
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [searchId, userId],
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];

  const papersRes = await query<{
    pmid: string | null;
    doi: string | null;
    title: string;
    authors: any;
    journal: string | null;
    year: number | null;
  }>(
    `SELECT pmid, doi, title, authors, journal, year
     FROM papers WHERE id = ANY($1::uuid[])`,
    [row.selected_paper_ids],
  );

  const papers: ExportPaper[] = papersRes.rows.map((p) => ({
    pmid: p.pmid,
    doi: p.doi,
    title: p.title,
    authors: typeof p.authors === 'string' ? JSON.parse(p.authors) : p.authors ?? [],
    journal: p.journal,
    year: p.year,
  }));

  return {
    rawQuestion: row.raw_question,
    synthesisMd: row.synthesis_md,
    evidenceStrength: row.evidence_strength,
    createdAt: row.created_at,
    papers,
  };
}

async function trackExport(userId: string, searchId: string, format: string) {
  await query(
    `INSERT INTO usage_events (user_id, event_type, resource_id, api_calls)
     VALUES ($1, 'export', $2, $3)`,
    [userId, searchId, JSON.stringify({ format })],
  );
}

// GET /api/searches/:id/export/synthesis.md
exportsRouter.get('/:id/export/synthesis.md', async (req, res) => {
  const data = await loadSynthesis(req.params.id, req.userId!);
  if (!data) return res.status(404).json({ error: 'Sem síntese para exportar' });
  await trackExport(req.userId!, req.params.id, 'markdown');

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="sintese.md"');
  res.send(buildSynthesisMarkdown(data));
});

// GET /api/searches/:id/export/synthesis.html  (print → save as PDF)
exportsRouter.get('/:id/export/synthesis.html', async (req, res) => {
  const data = await loadSynthesis(req.params.id, req.userId!);
  if (!data) return res.status(404).json({ error: 'Sem síntese para exportar' });
  await trackExport(req.userId!, req.params.id, 'pdf_html');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(buildSynthesisHtml(data));
});
