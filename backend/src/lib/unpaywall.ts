/**
 * Unpaywall client — open-access status + best free PDF for a DOI.
 *
 * Docs: https://unpaywall.org/products/api
 * Free, email required as a query param. ~100k calls/day soft limit.
 *
 * We never invent open-access claims: is_open_access / oa_pdf_url come straight
 * from Unpaywall's response for a real DOI.
 */

import { config } from './config.js';
import { fetchJson, HttpError } from './http.js';

const BASE_URL = 'https://api.unpaywall.org/v2';

export interface OpenAccessInfo {
  doi: string;
  isOpenAccess: boolean;
  pdfUrl: string | null;
  oaStatus: string | null; // 'gold' | 'green' | 'hybrid' | 'bronze' | 'closed'
}

interface UnpaywallResponse {
  doi: string;
  is_oa: boolean;
  oa_status?: string;
  best_oa_location?: { url_for_pdf?: string | null; url?: string | null } | null;
}

/**
 * Look up open-access info for a single DOI. Returns null on any failure
 * (404 = not in Unpaywall, network error, etc.) so callers can degrade gracefully.
 */
export async function getOpenAccess(doi: string): Promise<OpenAccessInfo | null> {
  if (!doi) return null;
  const url = `${BASE_URL}/${encodeURIComponent(doi)}?email=${encodeURIComponent(config.UNPAYWALL_EMAIL)}`;

  try {
    const data = await fetchJson<UnpaywallResponse>(url, { timeoutMs: 10000 });
    return {
      doi: data.doi ?? doi,
      isOpenAccess: Boolean(data.is_oa),
      pdfUrl: data.best_oa_location?.url_for_pdf ?? data.best_oa_location?.url ?? null,
      oaStatus: data.oa_status ?? null,
    };
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null;
    console.warn(`[unpaywall] lookup failed for ${doi}:`, (e as Error).message);
    return null;
  }
}
