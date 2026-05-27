/**
 * ClinicalTrials.gov v2 client — registered trials matching a query.
 *
 * Docs: https://clinicaltrials.gov/data-api/api
 * JSON API, no key required. Trials are surfaced as a separate section because
 * they are not journal papers: they carry an NCT id (not a PMID) and represent
 * ongoing/registered studies rather than published evidence.
 */

import { fetchJson } from './http.js';

const BASE_URL = 'https://clinicaltrials.gov/api/v2/studies';

export interface ClinicalTrial {
  nctId: string;
  title: string;
  status: string | null; // 'RECRUITING' | 'COMPLETED' | 'ACTIVE_NOT_RECRUITING' | ...
  summary: string | null;
  conditions: string[];
  interventions: string[];
  year: number | null; // start year
  studyType: string | null;
  phase: string[];
}

interface CTStudy {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string; officialTitle?: string };
    statusModule?: { overallStatus?: string; startDateStruct?: { date?: string } };
    descriptionModule?: { briefSummary?: string };
    conditionsModule?: { conditions?: string[] };
    designModule?: { studyType?: string; phases?: string[] };
    armsInterventionsModule?: { interventions?: Array<{ name?: string }> };
  };
}

interface CTResponse {
  studies?: CTStudy[];
  totalCount?: number;
}

export interface ClinicalTrialsResult {
  count: number;
  trials: ClinicalTrial[];
}

export async function searchClinicalTrials(
  term: string,
  options: { pageSize?: number } = {},
): Promise<ClinicalTrialsResult> {
  const url = new URL(BASE_URL);
  url.searchParams.set('query.term', term);
  url.searchParams.set('pageSize', String(options.pageSize ?? 15));
  url.searchParams.set('format', 'json');
  url.searchParams.set('countTotal', 'true');

  const data = await fetchJson<CTResponse>(url.toString(), { timeoutMs: 20000 });
  const studies = data.studies ?? [];

  return {
    count: data.totalCount ?? studies.length,
    trials: studies.map(normalize).filter((t): t is ClinicalTrial => t !== null),
  };
}

function normalize(s: CTStudy): ClinicalTrial | null {
  const p = s.protocolSection;
  const nctId = p?.identificationModule?.nctId;
  if (!nctId) return null;

  const startDate = p?.statusModule?.startDateStruct?.date; // e.g. "2019-03" or "2019-03-01"
  const year = startDate ? parseInt(startDate.slice(0, 4), 10) : null;

  return {
    nctId,
    title: p?.identificationModule?.briefTitle ?? p?.identificationModule?.officialTitle ?? '(untitled trial)',
    status: p?.statusModule?.overallStatus ?? null,
    summary: p?.descriptionModule?.briefSummary ?? null,
    conditions: p?.conditionsModule?.conditions ?? [],
    interventions: (p?.armsInterventionsModule?.interventions ?? [])
      .map((i) => i.name)
      .filter((n): n is string => Boolean(n)),
    year: Number.isFinite(year) ? year : null,
    studyType: p?.designModule?.studyType ?? null,
    phase: p?.designModule?.phases ?? [],
  };
}
