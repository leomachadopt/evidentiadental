import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock, ChevronRight, Search } from 'lucide-react';
import { api } from '../lib/api';

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pico_ready: { label: 'PICO pronto', cls: 'bg-blue-50 text-blue-700' },
  querying: { label: 'A executar', cls: 'bg-amber-50 text-amber-700' },
  completed: { label: 'Concluído', cls: 'bg-emerald-50 text-emerald-700' },
  failed: { label: 'Falhou', cls: 'bg-red-50 text-red-700' },
};

export function HistoryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['searches'],
    queryFn: () => api.listSearches(),
  });

  const searches = data?.searches ?? [];

  return (
    <div className="animate-fade-up">
      <h1 className="text-2xl font-semibold tracking-tight">Histórico de buscas</h1>
      <p className="mt-1 text-sm text-slate-500">As tuas perguntas clínicas anteriores.</p>

      <div className="mt-6">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card space-y-2">
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton h-3 w-40" />
              </div>
            ))}
          </div>
        ) : searches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 px-6 py-16 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
              <Search className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <h2 className="mt-4 text-sm font-medium text-slate-900">Ainda sem buscas</h2>
            <p className="mt-1 text-sm text-slate-500">A tua primeira pergunta clínica aparece aqui.</p>
            <Link to="/" className="btn-primary mt-5">Nova busca</Link>
          </div>
        ) : (
          <div className="space-y-2">
            {searches.map((s: any) => {
              const status = STATUS_LABEL[s.status] ?? { label: s.status, cls: 'bg-slate-100 text-slate-600' };
              return (
                <Link key={s.id} to={`/searches/${s.id}`} className="card card-interactive block">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-medium text-slate-900">{s.raw_question}</h3>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {new Date(s.created_at).toLocaleString('pt-PT')}
                        </span>
                        <span className="nums">{s.total_results ?? 0} resultados</span>
                        <span className={`rounded-full px-2 py-0.5 ${status.cls}`}>{status.label}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
