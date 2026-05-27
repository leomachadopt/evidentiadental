/**
 * PubMed Central (PMC) resolver.
 *
 * Uses NCBI's official ID Converter to map a PMID to a PMCID. A PMCID means the
 * article has a free, legal full text in PubMed Central.
 *
 * Docs: https://www.ncbi.nlm.nih.gov/pmc/tools/id-converter-api/
 * Free, no key required.
 */

import { config } from './config.js';
import { fetchJson } from './http.js';

const IDCONV_URL = 'https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/';

interface IdConvResponse {
  records?: Array<{ pmid?: string; pmcid?: string; status?: string }>;
}

export interface PmcResult {
  pmcid: string;
  /** Public article page (most reliable in a browser). */
  url: string;
  /** Direct PDF (may be rate-limited for bots; offered as a secondary link). */
  pdfUrl: string;
}

export async function getPmcFullText(pmid: string): Promise<PmcResult | null> {
  if (!pmid) return null;
  const url = `${IDCONV_URL}?ids=${encodeURIComponent(pmid)}&format=json&tool=EvidentiaDental&email=${encodeURIComponent(config.NCBI_EMAIL)}`;

  try {
    const data = await fetchJson<IdConvResponse>(url, { timeoutMs: 10000 });
    const pmcid = data.records?.find((r) => r.pmcid)?.pmcid;
    if (!pmcid) return null;
    return {
      pmcid,
      url: `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/`,
      pdfUrl: `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/pdf/`,
    };
  } catch (e) {
    console.warn(`[pmc] id conversion failed for ${pmid}:`, (e as Error).message);
    return null;
  }
}
