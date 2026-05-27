/**
 * Citation validator
 *
 * This is the architectural guarantee against hallucination.
 * Every [PMID xxxxx] in the synthesis must be in the allowed list.
 * Sentences that look factual but lack a citation are flagged.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  citedPmids: string[];
  invalidPmids: string[];
  uncitedFactualSentences: string[];
}

const PMID_PATTERN = /\[PMID\s+(\d+)\]/g;

// Sentences that contain these patterns are factual claims that need citations
const FACTUAL_VERBS = [
  /\bdemonstr\w+/i,
  /\bmostr\w+/i,
  /\brevel\w+/i,
  /\bencontr\w+/i,
  /\bconclu\w+/i,
  /\bindic\w+/i,
  /\bsugeri\w+/i,
  /\bestima\w+/i,
  /\breduz\w+/i,
  /\baument\w+/i,
  /\bdiferen[çc]\w+/i,
  /\befic[áa]\w+/i,
  /\bdesfech\w+/i,
  /\boutcome/i,
  /\bestud\w+/i,
  /\bensai\w+/i,
  /\bmeta-?an[áa]lise/i,
  /\brisco/i,
  /\bp\s*[<>=]\s*0?\.\d+/i, // p-values
  /\bIC\s*9[05]%/i, // confidence intervals
  /\b\d+\s*%/i, // percentages
];

// Things that don't need citation (linking phrases, opinions, recommendations)
const NON_FACTUAL_PATTERNS = [
  /^#{1,6}\s/, // markdown headers
  /^[-*]\s/, // bullets (often summary)
  /^EVIDENCE_STRENGTH:/,
  /^>?\s*$/, // empty / blockquote markers
];

export function validateSynthesis(synthesisMd: string, allowedPmids: string[]): ValidationResult {
  const allowed = new Set(allowedPmids.map(String));
  const citedMatches = [...synthesisMd.matchAll(PMID_PATTERN)];
  const citedPmids = citedMatches.map((m) => m[1]);
  const invalidPmids = [...new Set(citedPmids.filter((p) => !allowed.has(p)))];

  const errors: string[] = [];

  if (invalidPmids.length > 0) {
    errors.push(
      `PMIDs inválidos citados (não estão na lista fornecida): ${invalidPmids.join(', ')}`,
    );
  }

  // Check for factual sentences without citations
  const lines = synthesisMd.split('\n');
  const uncitedFactualSentences: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (NON_FACTUAL_PATTERNS.some((p) => p.test(trimmed))) continue;

    // Split into sentences (rough)
    const sentences = trimmed.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      if (sentence.length < 30) continue; // skip very short fragments
      const hasCitation = /\[PMID\s+\d+\]/.test(sentence);
      const looksFactual = FACTUAL_VERBS.some((p) => p.test(sentence));
      if (looksFactual && !hasCitation) {
        uncitedFactualSentences.push(sentence.slice(0, 200));
      }
    }
  }

  if (uncitedFactualSentences.length > 0) {
    errors.push(
      `Afirmações factuais sem citação [PMID xxxxx]:\n${uncitedFactualSentences
        .map((s) => `  - "${s}"`)
        .join('\n')}`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    citedPmids: [...new Set(citedPmids)],
    invalidPmids,
    uncitedFactualSentences,
  };
}

export function extractEvidenceStrength(
  synthesisMd: string,
): 'high' | 'moderate' | 'low' | 'very_low' | 'insufficient' | null {
  const match = synthesisMd.match(/EVIDENCE_STRENGTH:\s*(high|moderate|low|very_low|insufficient)/i);
  if (!match) return null;
  return match[1].toLowerCase() as any;
}

export function stripEvidenceStrengthLine(synthesisMd: string): string {
  return synthesisMd.replace(/\n*EVIDENCE_STRENGTH:\s*\w+\s*$/i, '').trim();
}
