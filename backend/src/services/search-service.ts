/**
 * Search service — orchestrates the full retrieval pipeline:
 *   1. Generate PICO + PubMed query from raw question (Claude)
 *   2. Execute query against PubMed (esearch + efetch) — the source of truth
 *   3. Complement with Europe PMC (PMID-bearing results only)
 *   4. Enrich open-access status via Unpaywall
 *   5. Fetch registered trials from ClinicalTrials.gov (separate section)
 *   6. Cache everything in the global `papers` table
 *   7. Score relevance of journal papers via Claude (in batches)
 *   8. Store results
 *
 * Resilience: external sources beyond PubMed are best-effort. If Europe PMC,
 * Unpaywall, or ClinicalTrials fail, the core PubMed result still completes.
 */

import { query, withTransaction } from '../db/client.js';
import { callClaudeJson } from '../lib/claude.js';
import { esearch, efetch, type PubMedArticle } from '../lib/pubmed.js';
import { searchEuropePmc } from '../lib/europepmc.js';
import { searchClinicalTrials } from '../lib/clinicaltrials.js';
import { getOpenAccess } from '../lib/unpaywall.js';
import { mapLimit } from '../lib/http.js';
import {
  PICO_SYSTEM_PROMPT,
  buildPicoUserPrompt,
  PicoResponseSchema,
  type PicoResponse,
} from '../prompts/pico.js';
import {
  RELEVANCE_SYSTEM_PROMPT,
  buildRelevanceUserPrompt,
  RelevanceResponseSchema,
} from '../prompts/relevance.js';

export interface SearchRecord {
  id: string;
  user_id: string;
  raw_question: string;
  pico: any;
  status: string;
  total_results: number;
  created_at: string;
  completed_at: string | null;
}

/** Normalized shape every source maps into before caching. */
interface PaperInput {
  pmid: string | null;
  doi: string | null;
  nctId: string | null;
  title: string;
  authors: Array<{ name: string }>;
  journal: string | null;
  year: number | null;
  abstract: string | null;
  publicationTypes: string[];
  meshTerms: string[];
  keywords: string[];
  isOpenAccess: boolean;
  oaPdfUrl: string | null;
  source: string;
  raw: unknown;
}

// ============================================================
// Step 1: create search + generate PICO
// ============================================================

export async function createSearch(
  userId: string,
  rawQuestion: string,
  opts: { yearFrom?: number } = {},
): Promise<{ search: SearchRecord; pico: PicoResponse }> {
  const picoResult = await callClaudeJson<unknown>({
    system: PICO_SYSTEM_PROMPT,
    user: buildPicoUserPrompt(rawQuestion),
    maxTokens: 1500,
  });

  const parsed = PicoResponseSchema.safeParse(picoResult.data);
  if (!parsed.success) {
    throw new Error(`Claude returned invalid PICO structure: ${parsed.error.message}`);
  }
  const pico = parsed.data;

  // Persist the chosen period inside the PICO so it's auditable and reproducible.
  const picoJson: Record<string, unknown> = {
    ...pico.pico,
    pubmed_query: pico.pubmed_query,
    rationale: pico.rationale,
  };
  if (opts.yearFrom) picoJson.filters = { year_from: opts.yearFrom };

  const result = await query<SearchRecord>(
    `INSERT INTO searches (user_id, raw_question, pico, status)
     VALUES ($1, $2, $3, 'pico_ready')
     RETURNING *`,
    [userId, rawQuestion, JSON.stringify(picoJson)],
  );

  await query(
    `INSERT INTO usage_events (user_id, event_type, resource_id, llm_tokens_input, llm_tokens_output)
     VALUES ($1, 'pico_generation', $2, $3, $4)`,
    [userId, result.rows[0].id, picoResult.tokensInput, picoResult.tokensOutput],
  );

  return { search: result.rows[0], pico };
}

// ============================================================
// Step 2-8: execute query + fetch papers + enrich + score
// ============================================================

export async function executeSearch(
  searchId: string,
  userId: string,
  opts: { maxResults?: number } = {},
): Promise<{ resultsCount: number; trialsCount: number }> {
  const maxResults = opts.maxResults ?? 30;

  const searchRes = await query<SearchRecord>(
    'SELECT * FROM searches WHERE id = $1 AND user_id = $2',
    [searchId, userId],
  );
  if (searchRes.rows.length === 0) throw new Error('Search not found');
  const search = searchRes.rows[0];

  const pubmedQuery = (search.pico as any).pubmed_query as string;
  if (!pubmedQuery) throw new Error('No PubMed query in search');
  const keywordTerm = buildKeywordTerm(search.pico);

  await query("UPDATE searches SET status = 'querying' WHERE id = $1", [searchId]);

  const apiCalls: Record<string, number> = {};

  // Optional publication-date window from the saved PICO filters.
  const yearFrom = (search.pico as any).filters?.year_from as number | undefined;
  const dateOpts = yearFrom
    ? { mindate: String(yearFrom), maxdate: String(new Date().getFullYear()), datetype: 'pdat' }
    : {};

  try {
    // --- 2. PubMed (source of truth) ---
    const esearchResult = await esearch(pubmedQuery, { retmax: maxResults, ...dateOpts });
    apiCalls.pubmed = (apiCalls.pubmed ?? 0) + 1;
    await recordQuery(searchId, 'pubmed', pubmedQuery, 'success', esearchResult.count, {
      queryTranslation: esearchResult.queryTranslation,
      returned: esearchResult.pmids.length,
    });

    const pubmedArticles =
      esearchResult.pmids.length > 0 ? await efetch(esearchResult.pmids) : [];
    if (esearchResult.pmids.length > 0) apiCalls.pubmed++;

    const pubmedInputs = pubmedArticles.map(fromPubMed);
    const knownPmids = new Set(pubmedInputs.map((p) => p.pmid).filter(Boolean) as string[]);

    // --- 3. Europe PMC (complementary, PMID-bearing, best-effort) ---
    let europeInputs: PaperInput[] = [];
    try {
      const epmc = await searchEuropePmc(keywordTerm, { pageSize: Math.min(maxResults, 25) });
      apiCalls.europepmc = (apiCalls.europepmc ?? 0) + 1;
      europeInputs = epmc.articles
        .filter((a) => a.pmid && !knownPmids.has(a.pmid))
        .map(fromEuropePmc);
      await recordQuery(searchId, 'europepmc', keywordTerm, 'success', epmc.count, {
        added: europeInputs.length,
      });
    } catch (e: any) {
      await recordQuery(searchId, 'europepmc', keywordTerm, 'failed', null, null, e.message);
    }

    const journalInputs = [...pubmedInputs, ...europeInputs];

    // --- 4. Open-access enrichment via Unpaywall (best-effort) ---
    const needsOa = journalInputs.filter((p) => p.doi && !p.isOpenAccess);
    if (needsOa.length > 0) {
      await mapLimit(needsOa, 5, async (paper) => {
        const oa = await getOpenAccess(paper.doi!);
        apiCalls.unpaywall = (apiCalls.unpaywall ?? 0) + 1;
        if (oa?.isOpenAccess) {
          paper.isOpenAccess = true;
          paper.oaPdfUrl = paper.oaPdfUrl ?? oa.pdfUrl;
        }
      });
    }

    // --- 5. ClinicalTrials.gov (separate section, best-effort) ---
    let trialInputs: PaperInput[] = [];
    try {
      const ct = await searchClinicalTrials(keywordTerm, { pageSize: 15 });
      apiCalls.clinicaltrials = (apiCalls.clinicaltrials ?? 0) + 1;
      trialInputs = ct.trials.map(fromTrial);
      await recordQuery(searchId, 'clinicaltrials', keywordTerm, 'success', ct.count, {
        added: trialInputs.length,
      });
    } catch (e: any) {
      await recordQuery(searchId, 'clinicaltrials', keywordTerm, 'failed', null, null, e.message);
    }

    const allInputs = [...journalInputs, ...trialInputs];
    if (allInputs.length === 0) {
      await query(
        "UPDATE searches SET status = 'completed', total_results = 0, completed_at = NOW() WHERE id = $1",
        [searchId],
      );
      await recordApiUsage(userId, searchId, apiCalls);
      return { resultsCount: 0, trialsCount: 0 };
    }

    // --- 6. Cache papers ---
    const keyToPaperId = await cachePapers(allInputs);

    // --- 7. Score relevance (journal papers with a PMID only) ---
    const scorable = journalInputs.filter((p): p is PaperInput & { pmid: string } => Boolean(p.pmid));
    const picoSummary = buildPicoSummary(search.pico);
    const scored = await scoreRelevance(
      search.raw_question,
      picoSummary,
      scorable.map((p) => ({
        pmid: p.pmid,
        title: p.title,
        abstract: p.abstract,
        publicationTypes: p.publicationTypes,
        year: p.year,
      })),
      userId,
      searchId,
      apiCalls,
    );

    // --- 8. Persist search_results (journal papers first, then trials) ---
    await withTransaction(async (client) => {
      let position = 0;
      for (const paper of journalInputs) {
        const key = paper.pmid ?? paper.nctId;
        const paperId = key ? keyToPaperId.get(key) : undefined;
        if (!paperId) continue;
        const score = paper.pmid ? scored.find((s) => s.pmid === paper.pmid) : undefined;
        await client.query(
          `INSERT INTO search_results (search_id, paper_id, relevance_score, relevance_reasoning, position)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (search_id, paper_id) DO NOTHING`,
          [searchId, paperId, score?.score ?? null, score?.reasoning ?? null, position++],
        );
      }
      for (const trial of trialInputs) {
        const paperId = trial.nctId ? keyToPaperId.get(trial.nctId) : undefined;
        if (!paperId) continue;
        await client.query(
          `INSERT INTO search_results (search_id, paper_id, relevance_score, relevance_reasoning, position)
           VALUES ($1, $2, NULL, NULL, $3)
           ON CONFLICT (search_id, paper_id) DO NOTHING`,
          [searchId, paperId, position++],
        );
      }
    });

    await query(
      "UPDATE searches SET status = 'completed', total_results = $1, completed_at = NOW() WHERE id = $2",
      [journalInputs.length, searchId],
    );
    await recordApiUsage(userId, searchId, apiCalls);

    return { resultsCount: journalInputs.length, trialsCount: trialInputs.length };
  } catch (e: any) {
    await query("UPDATE searches SET status = 'failed' WHERE id = $1", [searchId]);
    await recordQuery(searchId, 'pubmed', pubmedQuery, 'failed', null, null, e.message ?? String(e));
    throw e;
  }
}

// ============================================================
// Source → PaperInput mappers
// ============================================================

function fromPubMed(a: PubMedArticle): PaperInput {
  return {
    pmid: a.pmid,
    doi: a.doi,
    nctId: null,
    title: a.title,
    authors: a.authors,
    journal: a.journal,
    year: a.year,
    abstract: a.abstract,
    publicationTypes: a.publicationTypes,
    meshTerms: a.meshTerms,
    keywords: a.keywords,
    isOpenAccess: false,
    oaPdfUrl: null,
    source: 'pubmed',
    raw: a,
  };
}

function fromEuropePmc(a: import('../lib/europepmc.js').EuropePmcArticle): PaperInput {
  return {
    pmid: a.pmid,
    doi: a.doi,
    nctId: null,
    title: a.title,
    authors: a.authors,
    journal: a.journal,
    year: a.year,
    abstract: a.abstract,
    publicationTypes: a.publicationTypes,
    meshTerms: [],
    keywords: [],
    isOpenAccess: a.isOpenAccess,
    oaPdfUrl: a.pdfUrl,
    source: 'europepmc',
    raw: a,
  };
}

function fromTrial(t: import('../lib/clinicaltrials.js').ClinicalTrial): PaperInput {
  const badges = ['Clinical Trial'];
  if (t.status) badges.push(t.status.replace(/_/g, ' '));
  for (const ph of t.phase) badges.push(ph);

  return {
    pmid: null,
    doi: null,
    nctId: t.nctId,
    title: t.title,
    authors: [],
    journal: 'ClinicalTrials.gov',
    year: t.year,
    abstract: t.summary,
    publicationTypes: badges,
    meshTerms: t.conditions,
    keywords: t.interventions,
    isOpenAccess: false,
    oaPdfUrl: null,
    source: 'clinicaltrials',
    raw: t,
  };
}

// ============================================================
// Caching
// ============================================================

async function cachePapers(inputs: PaperInput[]): Promise<Map<string, string>> {
  const keyToId = new Map<string, string>();

  for (const p of inputs) {
    const key = p.pmid ?? p.nctId;
    if (!key) continue;

    // Conflict target depends on which natural id this record carries.
    const conflict = p.pmid
      ? `ON CONFLICT (pmid) DO UPDATE SET
           refreshed_at = NOW(),
           abstract = COALESCE(EXCLUDED.abstract, papers.abstract),
           doi = COALESCE(EXCLUDED.doi, papers.doi),
           is_open_access = papers.is_open_access OR EXCLUDED.is_open_access,
           oa_pdf_url = COALESCE(EXCLUDED.oa_pdf_url, papers.oa_pdf_url)`
      : `ON CONFLICT (nct_id) DO UPDATE SET
           refreshed_at = NOW(),
           abstract = COALESCE(EXCLUDED.abstract, papers.abstract)`;

    const result = await query<{ id: string }>(
      `INSERT INTO papers
         (pmid, doi, nct_id, title, authors, journal, year, abstract,
          publication_types, mesh_terms, keywords, is_open_access, oa_pdf_url, source, raw_metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ${conflict}
       RETURNING id`,
      [
        p.pmid,
        p.doi,
        p.nctId,
        p.title,
        JSON.stringify(p.authors),
        p.journal,
        p.year,
        p.abstract,
        p.publicationTypes,
        p.meshTerms,
        p.keywords,
        p.isOpenAccess,
        p.oaPdfUrl,
        p.source,
        JSON.stringify(p.raw),
      ],
    );
    keyToId.set(key, result.rows[0].id);
  }

  return keyToId;
}

// ============================================================
// Relevance scoring
// ============================================================

async function scoreRelevance(
  rawQuestion: string,
  picoSummary: string,
  articles: Array<{
    pmid: string;
    title: string;
    abstract: string | null;
    publicationTypes: string[];
    year: number | null;
  }>,
  userId: string,
  searchId: string,
  apiCalls: Record<string, number>,
): Promise<Array<{ pmid: string; score: number; reasoning: string }>> {
  const BATCH_SIZE = 8;
  const allScores: Array<{ pmid: string; score: number; reasoning: string }> = [];

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);
    const result = await callClaudeJson<unknown>({
      system: RELEVANCE_SYSTEM_PROMPT,
      user: buildRelevanceUserPrompt(rawQuestion, picoSummary, batch),
      maxTokens: 1500,
    });
    apiCalls.claude = (apiCalls.claude ?? 0) + 1;

    const parsed = RelevanceResponseSchema.safeParse(result.data);
    if (!parsed.success) {
      console.warn('[relevance] Invalid response, skipping batch', parsed.error.message);
      continue;
    }

    // CRITICAL: only accept scores for PMIDs actually in this batch.
    const allowedPmids = new Set(batch.map((a) => a.pmid));
    allScores.push(...parsed.data.scores.filter((s) => allowedPmids.has(s.pmid)));

    await query(
      `INSERT INTO usage_events (user_id, event_type, resource_id, llm_tokens_input, llm_tokens_output)
       VALUES ($1, 'relevance_scoring', $2, $3, $4)`,
      [userId, searchId, result.tokensInput, result.tokensOutput],
    );
  }

  return allScores;
}

// ============================================================
// Helpers
// ============================================================

function buildPicoSummary(pico: any): string {
  return `P: ${pico.population} | I: ${pico.intervention} | C: ${pico.comparator} | O: ${
    Array.isArray(pico.outcomes) ? pico.outcomes.join(', ') : pico.outcomes
  }`;
}

/**
 * A plain-text term for sources that don't speak PubMed field-tag syntax
 * (Europe PMC free text, ClinicalTrials.gov). Built from the most salient PICO
 * elements rather than the MeSH-heavy PubMed query.
 */
function buildKeywordTerm(pico: any): string {
  const parts = [pico.intervention, pico.population, Array.isArray(pico.outcomes) ? pico.outcomes[0] : pico.outcomes];
  return parts.filter((x) => x && String(x).toLowerCase() !== 'none').join(' ');
}

async function recordQuery(
  searchId: string,
  source: string,
  queryString: string,
  status: 'success' | 'failed',
  resultsCount: number | null,
  raw: unknown,
  errorMessage?: string,
) {
  await query(
    `INSERT INTO search_queries (search_id, source, query_string, results_count, status, raw_response, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [searchId, source, queryString, resultsCount, status, raw ? JSON.stringify(raw) : null, errorMessage ?? null],
  );
}

async function recordApiUsage(userId: string, searchId: string, apiCalls: Record<string, number>) {
  await query(
    `INSERT INTO usage_events (user_id, event_type, resource_id, api_calls)
     VALUES ($1, 'search_apis', $2, $3)`,
    [userId, searchId, JSON.stringify(apiCalls)],
  );
}
