/**
 * Export service — turns a synthesis + its cited papers into shareable formats.
 *
 * Pure string builders (no DB / no IO) so they are trivially unit-testable.
 * The route layer loads the data and picks the format.
 *
 * Markdown export carries Obsidian-compatible YAML frontmatter so it drops
 * straight into the user's vault / Método RNS article protocol.
 */

export interface ExportPaper {
  pmid: string | null;
  doi: string | null;
  title: string;
  authors: Array<{ name: string }>;
  journal: string | null;
  year: number | null;
}

export interface ExportSynthesis {
  rawQuestion: string;
  synthesisMd: string;
  evidenceStrength: string | null;
  createdAt: string;
  papers: ExportPaper[];
}

function yamlEscape(value: string): string {
  // Quote and escape strings that could break YAML.
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function authorsShort(authors: Array<{ name: string }>): string {
  if (authors.length === 0) return '—';
  const names = authors.slice(0, 3).map((a) => a.name);
  return names.join(', ') + (authors.length > 3 ? ' et al.' : '');
}

/** Vancouver-ish reference line (simplified: no volume/issue/pages). */
export function vancouverReference(p: ExportPaper, index: number): string {
  const bits: string[] = [`${index}. ${authorsShort(p.authors)} ${p.title}`];
  if (p.journal) bits.push(`${p.journal}.`);
  if (p.year) bits.push(`${p.year}.`);
  const ids: string[] = [];
  if (p.pmid) ids.push(`PMID: ${p.pmid}`);
  if (p.doi) ids.push(`doi:${p.doi}`);
  return [bits.join(' '), ids.join('. ')].filter(Boolean).join(' ');
}

export function buildSynthesisMarkdown(s: ExportSynthesis): string {
  const pmids = s.papers.map((p) => p.pmid).filter(Boolean) as string[];
  const dois = s.papers.map((p) => p.doi).filter(Boolean) as string[];

  const frontmatter = [
    '---',
    `title: ${yamlEscape(s.rawQuestion)}`,
    `created: ${s.createdAt}`,
    `evidence_strength: ${s.evidenceStrength ?? 'unknown'}`,
    `source: EvidentiaDental`,
    `pmids: [${pmids.join(', ')}]`,
    dois.length ? `dois: [${dois.map(yamlEscape).join(', ')}]` : 'dois: []',
    `tags: [evidencia, ${s.evidenceStrength ?? 'unknown'}]`,
    '---',
  ].join('\n');

  const references = s.papers
    .map((p, i) => `${vancouverReference(p, i + 1)}${p.pmid ? ` — https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/` : ''}`)
    .join('\n\n');

  return `${frontmatter}

# ${s.rawQuestion}

${s.synthesisMd.trim()}

## Referências

${references || '_Sem referências._'}

---
_Gerado por EvidentiaDental. Cada PMID veio de uma chamada real ao PubMed._
`;
}

/** A single saved paper as an Obsidian note. */
export function buildPaperMarkdown(p: ExportPaper): string {
  const frontmatter = [
    '---',
    `title: ${yamlEscape(p.title)}`,
    `authors: [${p.authors.map((a) => yamlEscape(a.name)).join(', ')}]`,
    `year: ${p.year ?? 'unknown'}`,
    `journal: ${p.journal ? yamlEscape(p.journal) : '""'}`,
    `pmid: ${p.pmid ?? '""'}`,
    `doi: ${p.doi ? yamlEscape(p.doi) : '""'}`,
    `source: EvidentiaDental`,
    '---',
  ].join('\n');

  return `${frontmatter}

# ${p.title}

${authorsShort(p.authors)} · ${p.journal ?? '—'} · ${p.year ?? '—'}

${p.pmid ? `[PubMed](https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/)` : ''}${
    p.doi ? ` · [DOI](https://doi.org/${p.doi})` : ''
  }
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Print-ready HTML (open in browser → Print → Save as PDF). */
export function buildSynthesisHtml(s: ExportSynthesis): string {
  const references = s.papers
    .map((p, i) => `<li>${escapeHtml(vancouverReference(p, i + 1))}</li>`)
    .join('\n');

  // Minimal markdown → HTML for the synthesis body (headings, bullets, bold).
  const body = s.synthesisMd
    .split('\n')
    .map((line) => {
      if (/^##\s/.test(line)) return `<h2>${escapeHtml(line.replace(/^##\s/, ''))}</h2>`;
      if (/^#\s/.test(line)) return `<h1>${escapeHtml(line.replace(/^#\s/, ''))}</h1>`;
      if (/^[-*]\s/.test(line)) return `<li>${escapeHtml(line.replace(/^[-*]\s/, ''))}</li>`;
      if (line.trim() === '') return '';
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join('\n')
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);

  return `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(s.rawQuestion)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 720px; margin: 40px auto; padding: 0 24px; color: #1e293b; line-height: 1.6; }
  h1 { font-size: 22px; }
  h2 { font-size: 17px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-top: 28px; }
  .meta { color: #64748b; font-size: 13px; margin-bottom: 24px; }
  .badge { display: inline-block; background: #f1f5f9; border-radius: 4px; padding: 2px 8px; font-size: 12px; }
  ol { font-size: 14px; }
  footer { margin-top: 40px; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 12px; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
  <h1>${escapeHtml(s.rawQuestion)}</h1>
  <div class="meta">
    Força da evidência: <span class="badge">${escapeHtml(s.evidenceStrength ?? 'unknown')}</span>
    · ${escapeHtml(new Date(s.createdAt).toLocaleDateString('pt-PT'))}
  </div>
  ${body}
  <h2>Referências</h2>
  <ol>${references || '<li>Sem referências.</li>'}</ol>
  <footer>Gerado por EvidentiaDental. Cada PMID veio de uma chamada real ao PubMed.</footer>
</body>
</html>`;
}
