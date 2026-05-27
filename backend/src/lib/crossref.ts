/**
 * Crossref client — authoritative DOI metadata.
 *
 * Docs: https://api.crossref.org/swagger-ui/index.html
 * No key required; we join the "polite pool" by sending a mailto in the
 * User-Agent (handled in http.ts) and the query param.
 *
 * Used to backfill missing journal/year/authors on records that came from a
 * source other than PubMed (Europe PMC, ClinicalTrials). We never fabricate a
 * DOI — we only enrich a DOI that already exists on the record.
 */

import { config } from './config.js';
import { fetchJson, HttpError } from './http.js';

const BASE_URL = 'https://api.crossref.org/works';

export interface CrossrefMetadata {
  doi: string;
  title: string | null;
  journal: string | null;
  year: number | null;
  authors: Array<{ name: string }>;
  type: string | null; // 'journal-article', 'review', ...
}

interface CrossrefResponse {
  message: {
    DOI: string;
    title?: string[];
    'container-title'?: string[];
    'published'?: { 'date-parts'?: number[][] };
    'published-print'?: { 'date-parts'?: number[][] };
    'published-online'?: { 'date-parts'?: number[][] };
    author?: Array<{ given?: string; family?: string; name?: string }>;
    type?: string;
  };
}

export async function getCrossrefByDoi(doi: string): Promise<CrossrefMetadata | null> {
  if (!doi) return null;
  const url = `${BASE_URL}/${encodeURIComponent(doi)}?mailto=${encodeURIComponent(config.CROSSREF_EMAIL)}`;

  try {
    const data = await fetchJson<CrossrefResponse>(url, { timeoutMs: 10000 });
    const m = data.message;
    const dateParts =
      m.published?.['date-parts']?.[0] ??
      m['published-print']?.['date-parts']?.[0] ??
      m['published-online']?.['date-parts']?.[0];

    return {
      doi: m.DOI ?? doi,
      title: m.title?.[0] ?? null,
      journal: m['container-title']?.[0] ?? null,
      year: dateParts?.[0] ?? null,
      authors: (m.author ?? [])
        .map((a) => {
          const name = a.name ?? [a.family, a.given].filter(Boolean).join(' ');
          return name ? { name } : null;
        })
        .filter((a): a is { name: string } => a !== null),
      type: m.type ?? null,
    };
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null;
    console.warn(`[crossref] lookup failed for ${doi}:`, (e as Error).message);
    return null;
  }
}
