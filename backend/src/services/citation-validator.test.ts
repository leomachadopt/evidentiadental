import { describe, it, expect } from 'vitest';
import {
  validateSynthesis,
  extractEvidenceStrength,
  stripEvidenceStrengthLine,
} from './citation-validator.js';

describe('validateSynthesis', () => {
  it('accepts a synthesis where every factual claim cites an allowed PMID', () => {
    const md = `## O que a evidência mostra
O PRF reduziu a reabsorção óssea de forma significativa [PMID 123].
A meta-análise encontrou benefício consistente entre estudos [PMID 456].

EVIDENCE_STRENGTH: moderate`;
    const result = validateSynthesis(md, ['123', '456']);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.citedPmids.sort()).toEqual(['123', '456']);
  });

  it('rejects a synthesis citing a PMID outside the allowed list', () => {
    const md = `O estudo demonstrou uma redução significativa da perda óssea [PMID 999].`;
    const result = validateSynthesis(md, ['123']);
    expect(result.valid).toBe(false);
    expect(result.invalidPmids).toContain('999');
  });

  it('flags a factual sentence with no citation', () => {
    const md = `O estudo demonstrou uma redução significativa da perda óssea no grupo tratado.`;
    const result = validateSynthesis(md, ['123']);
    expect(result.valid).toBe(false);
    expect(result.uncitedFactualSentences.length).toBeGreaterThan(0);
  });

  it('does not flag markdown headings or the evidence-strength line', () => {
    const md = `## Força da evidência
EVIDENCE_STRENGTH: high`;
    const result = validateSynthesis(md, []);
    expect(result.valid).toBe(true);
  });
});

describe('extractEvidenceStrength', () => {
  it('parses the evidence-strength marker', () => {
    expect(extractEvidenceStrength('texto\nEVIDENCE_STRENGTH: high')).toBe('high');
    expect(extractEvidenceStrength('EVIDENCE_STRENGTH: very_low')).toBe('very_low');
  });

  it('returns null when absent', () => {
    expect(extractEvidenceStrength('sem marcador')).toBeNull();
  });
});

describe('stripEvidenceStrengthLine', () => {
  it('removes the trailing evidence-strength line', () => {
    const out = stripEvidenceStrengthLine('Conteúdo da síntese.\n\nEVIDENCE_STRENGTH: moderate');
    expect(out).toBe('Conteúdo da síntese.');
  });
});
