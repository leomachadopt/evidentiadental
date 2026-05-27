/**
 * Full-text access service.
 *
 * Aggregates LEGAL routes to the full text of a paper, on demand:
 *   1. Open access  — cached, else Unpaywall / Open Access Button / CORE
 *   2. PubMed Central free full text
 *   3. Institutional access (LibKey / EZproxy) for paywalled content
 *   4. Publisher page via DOI
 *   5. Author request (ResearchGate) + Google Scholar discovery
 *
 * Deliberately does NOT use pirate mirrors. Every link is either openly licensed
 * or routed through the user's legitimate institutional subscription.
 */

import { query } from '../db/client.js';
import { getOpenAccess } from '../lib/unpaywall.js';
import { getOaButton } from '../lib/openaccessbutton.js';
import { getCoreFullText } from '../lib/core.js';
import { getPmcFullText } from '../lib/pmc.js';
import type { InstitutionalSettings } from '../routes/settings.js';

export type AccessKind = 'oa' | 'pmc' | 'institutional' | 'publisher' | 'request';

export interface AccessLink {
  label: string;
  url: string;
  kind: AccessKind;
  free: boolean;
  note?: string;
}

interface PaperRow {
  id: string;
  pmid: string | null;
  doi: string | null;
  title: string;
  is_open_access: boolean;
  oa_pdf_url: string | null;
}

export async function resolveFullTextAccess(
  paperId: string,
  settings: InstitutionalSettings,
): Promise<{ links: AccessLink[]; isOpenAccess: boolean }> {
  const res = await query<PaperRow>(
    'SELECT id, pmid, doi, title, is_open_access, oa_pdf_url FROM papers WHERE id = $1',
    [paperId],
  );
  if (res.rows.length === 0) throw new Error('Paper not found');
  const p = res.rows[0];

  const links: AccessLink[] = [];
  let oaUrl: string | null = p.oa_pdf_url;

  // 1. Open access — cached first, then live resolvers (first hit wins).
  if (!oaUrl && p.doi) {
    oaUrl = (await getOpenAccess(p.doi))?.pdfUrl ?? null;
    if (!oaUrl) oaUrl = await getOaButton(p.doi);
    if (!oaUrl) oaUrl = await getCoreFullText(p.doi);
    if (oaUrl) {
      await query(
        'UPDATE papers SET is_open_access = TRUE, oa_pdf_url = COALESCE(oa_pdf_url, $1) WHERE id = $2',
        [oaUrl, p.id],
      );
    }
  }
  if (oaUrl) links.push({ label: 'PDF open-access', url: oaUrl, kind: 'oa', free: true });

  // 2. PubMed Central free full text.
  if (p.pmid) {
    const pmc = await getPmcFullText(p.pmid);
    if (pmc) links.push({ label: 'PubMed Central (grátis)', url: pmc.url, kind: 'pmc', free: true });
  }

  // 3. Institutional access for paywalled content (legitimate subscription).
  if (p.doi && settings.libkeyLibraryId) {
    links.push({
      label: 'Acesso via LibKey',
      url: `https://libkey.io/libraries/${settings.libkeyLibraryId}/${p.doi}`,
      kind: 'institutional',
      free: false,
      note: 'Pela tua instituição',
    });
  }
  if (p.doi && settings.ezproxyPrefix) {
    links.push({
      label: 'Acesso via biblioteca (EZproxy)',
      url: `${settings.ezproxyPrefix}https://doi.org/${p.doi}`,
      kind: 'institutional',
      free: false,
      note: 'Pela tua instituição',
    });
  }

  // 4. Publisher page via DOI.
  if (p.doi) {
    links.push({ label: 'Página do editor (DOI)', url: `https://doi.org/${p.doi}`, kind: 'publisher', free: false });
  }

  // 5. Author request / discovery.
  const q = encodeURIComponent(p.title);
  links.push({ label: 'Pedir aos autores (ResearchGate)', url: `https://www.researchgate.net/search?q=${q}`, kind: 'request', free: true });
  links.push({ label: 'Google Scholar', url: `https://scholar.google.com/scholar?q=${q}`, kind: 'request', free: true });

  return { links, isOpenAccess: Boolean(oaUrl) };
}
