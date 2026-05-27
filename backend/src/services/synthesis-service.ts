/**
 * Synthesis service
 *
 * Generates a clinical mini-synthesis from selected papers.
 * Enforces citation validity via a retry loop (max 3 attempts).
 */

import { query } from '../db/client.js';
import { callClaudeText } from '../lib/claude.js';
import { config } from '../lib/config.js';
import {
  SYNTHESIS_SYSTEM_PROMPT,
  buildSynthesisUserPrompt,
  buildSynthesisRetryPrompt,
} from '../prompts/synthesis.js';
import {
  validateSynthesis,
  extractEvidenceStrength,
  stripEvidenceStrengthLine,
} from './citation-validator.js';

const MAX_ATTEMPTS = 3;

export async function generateSynthesis(opts: {
  searchId: string;
  userId: string;
  selectedPaperIds: string[];
}): Promise<{
  synthesisId: string;
  synthesisMd: string;
  evidenceStrength: string | null;
  attempts: number;
  finalValidation: { valid: boolean; errors: string[] };
}> {
  // Load search + selected papers
  const searchRes = await query<{ raw_question: string; pico: any }>(
    'SELECT raw_question, pico FROM searches WHERE id = $1 AND user_id = $2',
    [opts.searchId, opts.userId],
  );
  if (searchRes.rows.length === 0) throw new Error('Search not found');
  const search = searchRes.rows[0];

  const papersRes = await query<{
    id: string;
    pmid: string;
    title: string;
    abstract: string | null;
    authors: any;
    year: number | null;
    journal: string | null;
    publication_types: string[];
  }>(
    `SELECT id, pmid, title, abstract, authors, year, journal, publication_types
     FROM papers
     WHERE id = ANY($1::uuid[]) AND pmid IS NOT NULL`,
    [opts.selectedPaperIds],
  );

  if (papersRes.rows.length === 0) {
    throw new Error('No valid papers selected');
  }

  const papers = papersRes.rows.map((p) => ({
    pmid: p.pmid,
    title: p.title,
    abstract: p.abstract,
    authors: typeof p.authors === 'string' ? JSON.parse(p.authors) : p.authors,
    year: p.year,
    journal: p.journal,
    publicationTypes: p.publication_types,
  }));

  const allowedPmids = papers.map((p) => p.pmid);
  const picoSummary = buildPicoSummary(search.pico);

  // Initial prompt
  const initialPrompt = buildSynthesisUserPrompt({
    rawQuestion: search.raw_question,
    picoSummary,
    papers,
  });

  let currentPrompt = initialPrompt;
  let synthesisMd = '';
  let validation = { valid: false, errors: [] as string[] };
  let totalTokensInput = 0;
  let totalTokensOutput = 0;
  let attempts = 0;

  for (attempts = 1; attempts <= MAX_ATTEMPTS; attempts++) {
    const result = await callClaudeText({
      system: SYNTHESIS_SYSTEM_PROMPT,
      user: currentPrompt,
      maxTokens: 4096,
    });
    totalTokensInput += result.tokensInput;
    totalTokensOutput += result.tokensOutput;

    synthesisMd = result.data;
    validation = validateSynthesis(synthesisMd, allowedPmids);

    if (validation.valid) break;

    console.warn(`[synthesis] Attempt ${attempts} failed validation:`, validation.errors);

    if (attempts < MAX_ATTEMPTS) {
      currentPrompt = buildSynthesisRetryPrompt(initialPrompt, validation.errors);
    }
  }

  const evidenceStrength = extractEvidenceStrength(synthesisMd);
  const cleanMd = stripEvidenceStrengthLine(synthesisMd);

  // Persist
  const insertRes = await query<{ id: string }>(
    `INSERT INTO syntheses
       (search_id, selected_paper_ids, selected_pmids, synthesis_md, evidence_strength,
        validation_status, validation_errors, generation_attempts, llm_model,
        llm_tokens_input, llm_tokens_output)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      opts.searchId,
      opts.selectedPaperIds,
      allowedPmids,
      cleanMd,
      evidenceStrength,
      validation.valid ? 'valid' : 'invalid_citations',
      JSON.stringify(validation.errors),
      attempts,
      config.CLAUDE_MODEL,
      totalTokensInput,
      totalTokensOutput,
    ],
  );

  await query(
    `INSERT INTO usage_events (user_id, event_type, resource_id, llm_tokens_input, llm_tokens_output)
     VALUES ($1, 'synthesis', $2, $3, $4)`,
    [opts.userId, insertRes.rows[0].id, totalTokensInput, totalTokensOutput],
  );

  // Mark selected_for_synthesis on search_results
  await query(
    `UPDATE search_results SET selected_for_synthesis = TRUE
     WHERE search_id = $1 AND paper_id = ANY($2::uuid[])`,
    [opts.searchId, opts.selectedPaperIds],
  );

  return {
    synthesisId: insertRes.rows[0].id,
    synthesisMd: cleanMd,
    evidenceStrength,
    attempts,
    finalValidation: validation,
  };
}

function buildPicoSummary(pico: any): string {
  return `P: ${pico.population} | I: ${pico.intervention} | C: ${pico.comparator} | O: ${
    Array.isArray(pico.outcomes) ? pico.outcomes.join(', ') : pico.outcomes
  }`;
}
