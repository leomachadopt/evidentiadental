/**
 * Small shared HTTP helpers used by the external API clients
 * (Europe PMC, Crossref, Unpaywall, ClinicalTrials.gov).
 *
 * PubMed has its own dedicated rate limiter in pubmed.ts because the NCBI
 * limits are strict and IP-bannable. The other APIs are more forgiving, so
 * here we just need a polite User-Agent, a timeout, and bounded concurrency.
 */

import { config } from './config.js';

export const USER_AGENT = `EvidentiaDental/0.1 (mailto:${config.CROSSREF_EMAIL})`;

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
    public body: string,
  ) {
    super(`HTTP ${status} for ${url}: ${body.slice(0, 200)}`);
    this.name = 'HttpError';
  }
}

export async function fetchJson<T>(
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<T> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...opts.headers },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
  });
  if (!res.ok) {
    throw new HttpError(res.status, url, await res.text().catch(() => ''));
  }
  return (await res.json()) as T;
}

/**
 * Map over items with bounded concurrency. Keeps us polite with per-DOI
 * lookups (Unpaywall/Crossref) without firing dozens of requests at once.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
