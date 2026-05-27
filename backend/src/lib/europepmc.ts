/**
 * Europe PMC client — complementary literature source to PubMed.
 *
 * Docs: https://europepmc.org/RestfulWebService
 * No key required. resultType=core returns abstracts + full author lists +
 * open-access flags, which lets us surface papers PubMed may not index and
 * enrich open-access status without a separate Unpaywall call.
 *
 * Like PubMed, identifiers (PMID/DOI) come straight from the API response —
 * never invented.
 */

import { fetchJson } from './http.js';

const BASE_URL = 'https://www.ebi.ac.uk/europepmc/webservices/rest';

export interface EuropePmcArticle {
  pmid: string | null;
  doi: string | null;
  title: string;
  abstract: string | null;
  authors: Array<{ name: string }>;
  journal: string | null;
  year: number | null;
  publicationTypes: string[];
  isOpenAccess: boolean;
  pdfUrl: string | null;
  source: 'europepmc';
}

interface EuropePmcResult {
  id?: string;
  source?: string;
  pmid?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  authorList?: { author?: Array<{ fullName?: string; firstName?: string; lastName?: string }> };
  journalTitle?: string;
  journalInfo?: { journal?: { title?: string } };
  pubYear?: string;
  abstractText?: string;
  pubTypeList?: { pubType?: string[] | string };
  isOpenAccess?: string; // 'Y' | 'N'
  fullTextUrlList?: { fullTextUrl?: Array<{ url?: string; documentStyle?: string }> };
}

interface EuropePmcSearchResponse {
  hitCount?: number;
  resultList?: { result?: EuropePmcResult[] };
}

export interface EuropePmcSearchResult {
  count: number;
  articles: EuropePmcArticle[];
}

export async function searchEuropePmc(
  query: string,
  options: { pageSize?: number } = {},
): Promise<EuropePmcSearchResult> {
  const url = new URL(`${BASE_URL}/search`);
  url.searchParams.set('query', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('resultType', 'core');
  url.searchParams.set('pageSize', String(options.pageSize ?? 25));

  const data = await fetchJson<EuropePmcSearchResponse>(url.toString(), { timeoutMs: 20000 });
  const results = data.resultList?.result ?? [];

  return {
    count: data.hitCount ?? results.length,
    articles: results.map(normalize),
  };
}

function normalize(r: EuropePmcResult): EuropePmcArticle {
  const pubTypeRaw = r.pubTypeList?.pubType;
  const publicationTypes = Array.isArray(pubTypeRaw)
    ? pubTypeRaw
    : pubTypeRaw
      ? [pubTypeRaw]
      : [];

  const authors = r.authorList?.author?.length
    ? r.authorList.author
        .map((a) => ({ name: a.fullName ?? [a.lastName, a.firstName].filter(Boolean).join(' ') }))
        .filter((a) => a.name)
    : (r.authorString ?? '')
        .split(',')
        .map((n) => ({ name: n.trim() }))
        .filter((a) => a.name);

  const pdf = r.fullTextUrlList?.fullTextUrl?.find(
    (u) => u.documentStyle === 'pdf' && u.url,
  )?.url;

  return {
    pmid: r.pmid ?? null,
    doi: r.doi ?? null,
    title: r.title ?? '(no title)',
    abstract: r.abstractText ?? null,
    authors,
    journal: r.journalTitle ?? r.journalInfo?.journal?.title ?? null,
    year: r.pubYear ? parseInt(r.pubYear, 10) : null,
    publicationTypes,
    isOpenAccess: r.isOpenAccess === 'Y',
    pdfUrl: pdf ?? null,
    source: 'europepmc',
  };
}
