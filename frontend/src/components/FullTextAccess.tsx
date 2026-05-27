import { useState } from 'react';
import { BookOpen, ExternalLink, Loader2, Unlock, Building2, FileText, Users } from 'lucide-react';
import { api } from '../lib/api';

interface AccessLink {
  label: string;
  url: string;
  kind: string;
  free: boolean;
  note?: string;
}

const KIND_ICON: Record<string, typeof BookOpen> = {
  oa: Unlock,
  pmc: Unlock,
  institutional: Building2,
  publisher: FileText,
  request: Users,
};

/**
 * On-demand "full text" resolver for a paper. Fetches all legal access routes
 * (open access, PMC, institutional, publisher, author request) only when the
 * user asks — keeps result lists fast.
 */
export function FullTextAccess({ paperId }: { paperId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState<AccessLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (links) {
      setOpen((o) => !o);
      return;
    }
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPaperAccess(paperId);
      setLinks(res.links);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={toggle}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-700 transition hover:text-primary-800"
      >
        <BookOpen className="h-3.5 w-3.5" />
        Texto completo
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-white/60 bg-white/70 p-3 backdrop-blur-sm">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> A procurar vias de acesso…
            </div>
          ) : error ? (
            <div className="text-xs text-red-600">{error}</div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {links?.map((l) => {
                const Icon = KIND_ICON[l.kind] ?? FileText;
                return (
                  <li key={l.label}>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener"
                      className="group flex items-center gap-2 text-sm text-slate-700 transition hover:text-primary-700"
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${l.free ? 'text-emerald-600' : 'text-slate-400'}`} strokeWidth={1.75} />
                      <span className="flex-1">{l.label}</span>
                      {l.free ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">grátis</span>
                      ) : l.note ? (
                        <span className="text-[10px] text-slate-400">{l.note}</span>
                      ) : null}
                      <ExternalLink className="h-3 w-3 text-slate-300 transition group-hover:text-primary-500" />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] leading-relaxed text-slate-400">
            Apenas vias legais: open-access, PubMed Central, e — se configurado — o teu acesso
            institucional. Sem fontes pirateadas.
          </p>
        </div>
      )}
    </div>
  );
}
