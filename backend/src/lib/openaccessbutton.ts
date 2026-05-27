/**
 * Open Access Button client — finds a LEGAL open-access copy of a paper by DOI.
 *
 * Docs: https://openaccessbutton.org/api
 * Free, no key. Aggregates legal OA repositories/preprints. Returns null when
 * no free copy exists (i.e. the paper is genuinely paywalled).
 *
 * This is a legal alternative to pirate mirrors: it only ever returns links the
 * author or publisher made openly available.
 */

import { config } from './config.js';
import { fetchJson } from './http.js';

const BASE_URL = 'https://api.openaccessbutton.org/find';

interface OaButtonResponse {
  url?: string | null;
  metadata?: { url?: string | null } | null;
  data?: { url?: string | null } | null;
  availability?: Array<{ url?: string | null }> | null;
}

export async function getOaButton(doi: string): Promise<string | null> {
  if (!doi) return null;
  const url = `${BASE_URL}?id=${encodeURIComponent(doi)}&email=${encodeURIComponent(config.UNPAYWALL_EMAIL)}`;

  try {
    const data = await fetchJson<OaButtonResponse>(url, { timeoutMs: 12000 });
    return (
      data.url ??
      data.data?.url ??
      data.metadata?.url ??
      data.availability?.find((a) => a.url)?.url ??
      null
    );
  } catch (e) {
    console.warn(`[oabutton] lookup failed for ${doi}:`, (e as Error).message);
    return null;
  }
}
