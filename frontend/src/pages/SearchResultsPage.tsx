import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import {
  Loader2,
  ExternalLink,
  FileText,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Unlock,
  BookmarkPlus,
  BookmarkCheck,
  FlaskConical,
  Download,
  Printer,
} from 'lucide-react';
import { api } from '../lib/api';
import { FullTextAccess } from '../components/FullTextAccess';

export function SearchResultsPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [synthesis, setSynthesis] = useState<any>(null);
  const [executing, setExecuting] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['search', id],
    queryFn: () => api.getSearch(id!),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.search?.status === 'querying' ? 2000 : false),
  });

  // Which papers are already in the library — so the "Guardado" badge persists
  // across reloads and shows up when revisiting a search from the history.
  const { data: libraryData } = useQuery({ queryKey: ['library-ids'], queryFn: () => api.listLibrary({}) });
  const libIds = new Set<string>((libraryData?.items ?? []).map((i: any) => i.paper_id));

  const executeMutation = useMutation({
    mutationFn: () => api.executeSearch(id!, 30),
    onSuccess: () => refetch(),
  });

  const synthesisMutation = useMutation({
    mutationFn: () => api.generateSynthesis(id!, Array.from(selectedIds)),
    onSuccess: (data) => setSynthesis(data),
  });

  async function saveToLibrary(paperId: string) {
    setSavedIds((prev) => new Set(prev).add(paperId)); // optimistic
    try {
      await api.addToLibrary({ paperId });
      queryClient.invalidateQueries({ queryKey: ['library-ids'] });
      queryClient.invalidateQueries({ queryKey: ['library'] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    } catch {
      setSavedIds((prev) => {
        const next = new Set(prev);
        next.delete(paperId);
        return next;
      });
    }
  }

  // Auto-execute if status is pico_ready
  useEffect(() => {
    if (data?.search?.status === 'pico_ready' && !executing) {
      setExecuting(true);
      executeMutation.mutate();
    }
  }, [data?.search?.status]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="card space-y-4">
          <div className="skeleton h-6 w-2/3" />
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="skeleton h-3 w-20" />
                <div className="skeleton h-4 w-full" />
              </div>
            ))}
          </div>
        </div>
        <PaperSkeletonList />
      </div>
    );
  }

  if (!data) return <div className="text-slate-500">Não encontrado.</div>;

  const { search, results } = data;
  const pico = search.pico;

  const papers = results?.filter((r: any) => r.pmid) ?? [];
  const trials = results?.filter((r: any) => r.nct_id && !r.pmid) ?? [];

  return (
    <div className="space-y-6">
      {/* PICO Card */}
      <div className="card">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-sm font-medium text-slate-500">Pergunta clínica</h2>
            <h1 className="text-lg font-semibold text-slate-900 mt-1">{search.raw_question}</h1>
          </div>
          <StatusBadge status={search.status} />
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
          <PicoField label="Population" value={pico.population} />
          <PicoField label="Intervention" value={pico.intervention} />
          <PicoField label="Comparator" value={pico.comparator} />
          <PicoField label="Outcomes" value={Array.isArray(pico.outcomes) ? pico.outcomes.join(', ') : pico.outcomes} />
        </div>

        {pico.filters?.year_from && (
          <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
            Período: desde {pico.filters.year_from}
          </div>
        )}

        {pico.pubmed_query && (
          <details className="mt-4">
            <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">
              Ver query PubMed executada
            </summary>
            <pre className="mt-2 p-3 bg-slate-50 rounded text-xs overflow-x-auto whitespace-pre-wrap">
              {pico.pubmed_query}
            </pre>
          </details>
        )}
      </div>

      {/* Status de execução */}
      {search.status === 'querying' && (
        <>
          <div className="flex items-center gap-3 rounded-2xl border border-primary-200 bg-primary-50 px-5 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary-600" />
            <span className="text-sm text-primary-900">
              A executar busca no PubMed, Europe PMC e ClinicalTrials, e a avaliar relevância…
            </span>
          </div>
          <PaperSkeletonList />
        </>
      )}

      {search.status === 'failed' && (
        <div className="card bg-red-50 border-red-200">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <span className="font-medium">Falha na execução</span>
          </div>
        </div>
      )}

      {/* Resultados */}
      {papers.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              {papers.length} papers encontrados ({selectedIds.size} selecionados)
            </h2>
            {selectedIds.size >= 2 && (
              <button
                onClick={() => synthesisMutation.mutate()}
                disabled={synthesisMutation.isPending}
                className="btn-primary"
              >
                {synthesisMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> A sintetizar...</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" /> Gerar mini-síntese</>
                )}
              </button>
            )}
          </div>

          <div className="space-y-3">
            {papers.map((r: any) => (
              <PaperCard
                key={r.result_id}
                result={r}
                selected={selectedIds.has(r.paper_id)}
                saved={savedIds.has(r.paper_id) || libIds.has(r.paper_id)}
                onToggle={() => {
                  const next = new Set(selectedIds);
                  if (next.has(r.paper_id)) next.delete(r.paper_id);
                  else next.add(r.paper_id);
                  setSelectedIds(next);
                }}
                onSave={() => saveToLibrary(r.paper_id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Ensaios clínicos registados */}
      {trials.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-slate-500" /> {trials.length} ensaios registados (ClinicalTrials.gov)
          </h2>
          <div className="space-y-3">
            {trials.map((t: any) => (
              <TrialCard key={t.result_id} result={t} />
            ))}
          </div>
        </div>
      )}

      {/* Síntese */}
      {synthesis && (
        <div className="card border-primary-300 bg-gradient-to-br from-primary-50/50 to-white">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-xl font-bold">Mini-síntese clínica</h2>
            <div className="flex items-center gap-2">
              {synthesis.finalValidation.valid ? (
                <span className="flex items-center gap-1 text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
                  <CheckCircle2 className="h-3 w-3" /> Citações validadas
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full">
                  <AlertCircle className="h-3 w-3" /> Validação parcial
                </span>
              )}
              {synthesis.evidenceStrength && (
                <span className="text-xs px-2 py-1 bg-slate-100 text-slate-700 rounded-full uppercase font-medium">
                  Evidência: {synthesis.evidenceStrength}
                </span>
              )}
            </div>
          </div>
          <div className="prose prose-slate prose-sm max-w-none">
            <ReactMarkdown>{synthesis.synthesisMd}</ReactMarkdown>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => navigator.clipboard.writeText(synthesis.synthesisMd)} className="btn-secondary text-xs">
              <FileText className="h-3 w-3 mr-1" /> Copiar markdown
            </button>
            <button onClick={() => api.exportSynthesisMarkdown(id!)} className="btn-secondary text-xs">
              <Download className="h-3 w-3 mr-1" /> Download .md
            </button>
            <button onClick={() => api.exportSynthesisPdf(id!)} className="btn-secondary text-xs">
              <Printer className="h-3 w-3 mr-1" /> Imprimir / PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PicoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-sm text-slate-900 mt-0.5">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: 'Rascunho', className: 'bg-slate-100 text-slate-700' },
    pico_ready: { label: 'PICO pronto', className: 'bg-blue-100 text-blue-700' },
    querying: { label: 'A executar', className: 'bg-amber-100 text-amber-700' },
    completed: { label: 'Concluído', className: 'bg-green-100 text-green-700' },
    failed: { label: 'Falhou', className: 'bg-red-100 text-red-700' },
  };
  const { label, className } = map[status] ?? { label: status, className: 'bg-slate-100 text-slate-700' };
  return <span className={`text-xs px-2 py-1 rounded-full ${className}`}>{label}</span>;
}

function PaperCard({
  result,
  selected,
  saved,
  onToggle,
  onSave,
}: {
  result: any;
  selected: boolean;
  saved: boolean;
  onToggle: () => void;
  onSave: () => void;
}) {
  const authors = typeof result.authors === 'string' ? JSON.parse(result.authors) : result.authors;
  const authorsStr = authors.slice(0, 3).map((a: any) => a.name).join(', ') + (authors.length > 3 ? ' et al' : '');

  return (
    <div className={`card transition ${selected ? 'border-primary-400 ring-2 ring-primary-100' : ''}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-medium text-slate-900 leading-snug">{result.title}</h3>
            <div className="flex items-center gap-1 shrink-0">
              {result.is_open_access && (
                <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">
                  <Unlock className="h-3 w-3" /> OA
                </span>
              )}
              {result.relevance_score !== null && <RelevanceBadge score={result.relevance_score} />}
            </div>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {authorsStr} · {result.journal} · {result.year}
          </div>
          {result.publication_types?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {result.publication_types.slice(0, 3).map((pt: string) => (
                <span key={pt} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">{pt}</span>
              ))}
            </div>
          )}
          {result.relevance_reasoning && (
            <p className="text-xs text-slate-600 italic mt-2">{result.relevance_reasoning}</p>
          )}
          <details className="mt-2">
            <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">Ver abstract</summary>
            <p className="mt-2 text-sm text-slate-700 leading-relaxed whitespace-pre-line">{result.abstract || '(sem abstract)'}</p>
          </details>
          <div className="flex flex-wrap gap-3 mt-2 text-xs items-center">
            <a href={`https://pubmed.ncbi.nlm.nih.gov/${result.pmid}/`} target="_blank" rel="noopener"
               className="text-primary-600 hover:underline inline-flex items-center gap-1">
              PMID {result.pmid} <ExternalLink className="h-3 w-3" />
            </a>
            {result.doi && (
              <a href={`https://doi.org/${result.doi}`} target="_blank" rel="noopener"
                 className="text-primary-600 hover:underline inline-flex items-center gap-1">
                DOI <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {result.is_open_access && result.oa_pdf_url && (
              <a href={result.oa_pdf_url} target="_blank" rel="noopener"
                 className="text-emerald-700 hover:underline inline-flex items-center gap-1">
                PDF grátis <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <button
              onClick={onSave}
              disabled={saved}
              className="ml-auto inline-flex items-center gap-1 text-slate-500 hover:text-primary-600 disabled:text-emerald-600"
            >
              {saved ? (
                <><BookmarkCheck className="h-3.5 w-3.5" /> Guardado</>
              ) : (
                <><BookmarkPlus className="h-3.5 w-3.5" /> Guardar</>
              )}
            </button>
          </div>
          <FullTextAccess paperId={result.paper_id} />
        </div>
      </div>
    </div>
  );
}

function TrialCard({ result }: { result: any }) {
  return (
    <div className="card">
      <h3 className="font-medium text-slate-900 leading-snug">{result.title}</h3>
      <div className="text-xs text-slate-500 mt-1">{result.journal} · {result.year ?? '—'}</div>
      {result.publication_types?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {result.publication_types.map((pt: string) => (
            <span key={pt} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">{pt}</span>
          ))}
        </div>
      )}
      {result.abstract && (
        <p className="mt-2 text-sm text-slate-700 leading-relaxed line-clamp-3">{result.abstract}</p>
      )}
      <a href={`https://clinicaltrials.gov/study/${result.nct_id}`} target="_blank" rel="noopener"
         className="text-primary-600 hover:underline inline-flex items-center gap-1 text-xs mt-2">
        {result.nct_id} <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function PaperSkeletonList() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card space-y-3" style={{ animationDelay: `${i * 60}ms` }}>
          <div className="skeleton h-4 w-3/4" />
          <div className="skeleton h-3 w-1/3" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-5/6" />
        </div>
      ))}
    </div>
  );
}

function RelevanceBadge({ score }: { score: number }) {
  let cls = 'bg-slate-100 text-slate-600';
  if (score >= 80) cls = 'bg-green-100 text-green-700';
  else if (score >= 60) cls = 'bg-blue-100 text-blue-700';
  else if (score >= 40) cls = 'bg-amber-100 text-amber-700';
  return <span className={`text-xs font-medium px-2 py-1 rounded-full ${cls}`}>{score}</span>;
}
