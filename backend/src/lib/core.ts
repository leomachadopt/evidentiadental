/**
 * CORE client — world's largest aggregator of open-access research.
 *
 * Docs: https://api.core.ac.uk/docs/v3
 * Requires a free API key (CORE_API_KEY). If absent, this resolver is skipped
 * gracefully. Only returns legally open full-text links.
 */

import { config } from './config.js';

interface CoreDiscoverResponse {
  fullTextLink?: string | null;
}

export async function getCoreFullText(doi: string): Promise<string | null> {
  if (!doi || !config.CORE_API_KEY) return null;

  try {
    const res = await fetch('https://api.core.ac.uk/v3/discover', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.CORE_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ doi }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as CoreDiscoverResponse;
    return data.fullTextLink ?? null;
  } catch (e) {
    console.warn(`[core] lookup failed for ${doi}:`, (e as Error).message);
    return null;
  }
}
