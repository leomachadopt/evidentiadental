/**
 * PubMed E-utilities client
 *
 * NCBI rate limits:
 *   - No API key: 3 req/s
 *   - With API key: 10 req/s
 *
 * Reference: https://www.ncbi.nlm.nih.gov/books/NBK25497/
 *
 * IMPORTANT: This client is the source of truth for PMIDs.
 * The LLM never invents PMIDs — every PMID in the product
 * came from a real response of this client.
 */

import { parseStringPromise } from 'xml2js';
import { config } from './config.js';

const BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

// Rate limiter: simple token bucket
class RateLimiter {
  private queue: Array<() => void> = [];
  private inFlight = 0;
  private lastRequestTime = 0;

  constructor(
    private maxPerSecond: number,
    private maxConcurrent: number = 5,
  ) {}

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.process();
    });
  }

  private async process() {
    if (this.queue.length === 0) return;
    if (this.inFlight >= this.maxConcurrent) return;

    const minInterval = 1000 / this.maxPerSecond;
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < minInterval) {
      setTimeout(() => this.process(), minInterval - elapsed);
      return;
    }

    const next = this.queue.shift();
    if (!next) return;

    this.inFlight++;
    this.lastRequestTime = Date.now();
    next();
  }

  release() {
    this.inFlight--;
    this.process();
  }
}

const limiter = new RateLimiter(config.NCBI_API_KEY ? 9 : 2, 5); // conservative

async function rateLimitedFetch(url: string): Promise<Response> {
  await limiter.acquire();
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': `EvidentiaDental/0.1 (${config.NCBI_EMAIL})` },
    });
    if (!res.ok) {
      throw new Error(`PubMed API error ${res.status}: ${await res.text()}`);
    }
    return res;
  } finally {
    limiter.release();
  }
}

function buildUrl(endpoint: string, params: Record<string, string | number>): string {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set('email', config.NCBI_EMAIL);
  url.searchParams.set('tool', 'EvidentiaDental');
  if (config.NCBI_API_KEY) {
    url.searchParams.set('api_key', config.NCBI_API_KEY);
  }
  return url.toString();
}

// ============================================================
// ESEARCH: query → list of PMIDs
// ============================================================

export interface ESearchResult {
  count: number;
  pmids: string[];
  queryTranslation: string;
}

export async function esearch(
  query: string,
  options: { retmax?: number; retstart?: number } = {},
): Promise<ESearchResult> {
  const url = buildUrl('esearch.fcgi', {
    db: 'pubmed',
    term: query,
    retmax: options.retmax ?? 50,
    retstart: options.retstart ?? 0,
    retmode: 'json',
  });

  const res = await rateLimitedFetch(url);
  const data = await res.json();

  return {
    count: parseInt(data.esearchresult?.count ?? '0', 10),
    pmids: data.esearchresult?.idlist ?? [],
    queryTranslation: data.esearchresult?.querytranslation ?? '',
  };
}

// ============================================================
// EFETCH: PMIDs → full metadata + abstracts
// ============================================================

export interface PubMedArticle {
  pmid: string;
  doi: string | null;
  title: string;
  abstract: string | null;
  authors: Array<{ name: string; affiliation?: string }>;
  journal: string | null;
  year: number | null;
  publicationTypes: string[];
  meshTerms: string[];
  keywords: string[];
}

export async function efetch(pmids: string[]): Promise<PubMedArticle[]> {
  if (pmids.length === 0) return [];

  // EFetch supports POST for large id lists, but for ≤200 a GET works fine
  const url = buildUrl('efetch.fcgi', {
    db: 'pubmed',
    id: pmids.join(','),
    retmode: 'xml',
  });

  const res = await rateLimitedFetch(url);
  const xml = await res.text();
  const parsed = await parseStringPromise(xml, { explicitArray: true });

  const articles = parsed.PubmedArticleSet?.PubmedArticle ?? [];
  return articles.map(parsePubmedArticle).filter(Boolean) as PubMedArticle[];
}

function parsePubmedArticle(raw: any): PubMedArticle | null {
  try {
    const citation = raw.MedlineCitation?.[0];
    const article = citation?.Article?.[0];
    if (!article) return null;

    const pmid = citation.PMID?.[0]?._ ?? citation.PMID?.[0];
    const title = extractText(article.ArticleTitle?.[0]);

    // Abstract: concatenate all AbstractText nodes
    const abstractParts = article.Abstract?.[0]?.AbstractText ?? [];
    const abstract = abstractParts
      .map((part: any) => {
        const label = part?.$?.Label ? `${part.$.Label}: ` : '';
        const text = typeof part === 'string' ? part : part?._ ?? '';
        return label + text;
      })
      .join('\n\n')
      .trim() || null;

    // Authors
    const authorList = article.AuthorList?.[0]?.Author ?? [];
    const authors = authorList
      .map((a: any) => {
        const last = a.LastName?.[0];
        const first = a.ForeName?.[0] ?? a.Initials?.[0];
        if (!last) return null;
        return {
          name: `${last}${first ? ' ' + first : ''}`,
          affiliation: a.AffiliationInfo?.[0]?.Affiliation?.[0],
        };
      })
      .filter(Boolean);

    // Journal + year
    const journal = article.Journal?.[0]?.Title?.[0] ?? article.Journal?.[0]?.ISOAbbreviation?.[0] ?? null;
    const yearStr =
      article.Journal?.[0]?.JournalIssue?.[0]?.PubDate?.[0]?.Year?.[0] ??
      article.Journal?.[0]?.JournalIssue?.[0]?.PubDate?.[0]?.MedlineDate?.[0]?.slice(0, 4);
    const year = yearStr ? parseInt(yearStr, 10) : null;

    // Publication types
    const publicationTypes =
      article.PublicationTypeList?.[0]?.PublicationType?.map((pt: any) =>
        typeof pt === 'string' ? pt : pt._,
      ) ?? [];

    // MeSH terms
    const meshTerms =
      citation.MeshHeadingList?.[0]?.MeshHeading?.map((mh: any) =>
        typeof mh.DescriptorName?.[0] === 'string' ? mh.DescriptorName[0] : mh.DescriptorName?.[0]?._,
      ).filter(Boolean) ?? [];

    // Keywords
    const keywords =
      citation.KeywordList?.[0]?.Keyword?.map((kw: any) =>
        typeof kw === 'string' ? kw : kw._,
      ).filter(Boolean) ?? [];

    // DOI
    const articleIds = raw.PubmedData?.[0]?.ArticleIdList?.[0]?.ArticleId ?? [];
    const doiEntry = articleIds.find((id: any) => id.$?.IdType === 'doi');
    const doi = doiEntry?._ ?? null;

    return {
      pmid,
      doi,
      title: title ?? '(no title)',
      abstract,
      authors,
      journal,
      year,
      publicationTypes,
      meshTerms,
      keywords,
    };
  } catch (e) {
    console.error('[pubmed] Failed to parse article', e);
    return null;
  }
}

function extractText(node: any): string {
  if (typeof node === 'string') return node;
  if (node?._) return node._;
  if (Array.isArray(node)) return node.map(extractText).join(' ');
  return '';
}
