import { describe, it, expect } from 'vitest';
import {
  vancouverReference,
  buildSynthesisMarkdown,
  buildSynthesisHtml,
  type ExportSynthesis,
} from './export-service.js';

const sample: ExportSynthesis = {
  rawQuestion: 'PRF em socket preservation: vale a pena?',
  synthesisMd: '## O que a evidência mostra\nO PRF ajuda [PMID 123].\n\n## Implicação clínica\n- Usar com critério.',
  evidenceStrength: 'moderate',
  createdAt: '2026-05-27T10:00:00.000Z',
  papers: [
    { pmid: '123', doi: '10.1000/abc', title: 'A trial on PRF.', authors: [{ name: 'Silva J' }, { name: 'Costa M' }], journal: 'J Dent', year: 2024 },
    { pmid: '456', doi: null, title: 'Another study.', authors: [{ name: 'Reis A' }], journal: 'Clin Oral', year: 2023 },
  ],
};

describe('vancouverReference', () => {
  it('includes author, title, journal, year and PMID', () => {
    const ref = vancouverReference(sample.papers[0], 1);
    expect(ref).toContain('1. Silva J, Costa M');
    expect(ref).toContain('A trial on PRF.');
    expect(ref).toContain('J Dent.');
    expect(ref).toContain('2024.');
    expect(ref).toContain('PMID: 123');
    expect(ref).toContain('doi:10.1000/abc');
  });
});

describe('buildSynthesisMarkdown', () => {
  it('emits Obsidian frontmatter, body and a references section', () => {
    const md = buildSynthesisMarkdown(sample);
    expect(md.startsWith('---')).toBe(true);
    expect(md).toContain('evidence_strength: moderate');
    expect(md).toContain('pmids: [123, 456]');
    expect(md).toContain('## Referências');
    expect(md).toContain('https://pubmed.ncbi.nlm.nih.gov/123/');
    expect(md).toContain('O PRF ajuda [PMID 123].');
  });
});

describe('buildSynthesisHtml', () => {
  it('produces a self-contained printable HTML document', () => {
    const html = buildSynthesisHtml(sample);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('PRF em socket preservation');
    expect(html).toContain('<h2>O que a evidência mostra</h2>');
    expect(html).toContain('Referências');
  });

  it('escapes HTML-significant characters in titles', () => {
    const html = buildSynthesisHtml({
      ...sample,
      papers: [{ ...sample.papers[0], title: 'A & B <tag> trial' }],
    });
    expect(html).toContain('A &amp; B &lt;tag&gt; trial');
  });
});
