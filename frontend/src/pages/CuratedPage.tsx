import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Loader2, ArrowRight, CheckCircle2, Library } from 'lucide-react';
import { api } from '../lib/api';

export function CuratedPage() {
  const navigate = useNavigate();
  const [area, setArea] = useState<string | undefined>(undefined);
  const [instantiatingId, setInstantiatingId] = useState<string | null>(null);

  const { data: areasData } = useQuery({
    queryKey: ['curated-areas'],
    queryFn: () => api.listCuratedAreas(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['curated', area],
    queryFn: () => api.listCurated(area),
  });

  const instantiateMutation = useMutation({
    mutationFn: (id: string) => api.instantiateCurated(id),
    onSuccess: (res) => navigate(`/searches/${res.searchId}`),
  });

  const areas = areasData?.areas ?? [];
  const queries = data?.queries ?? [];

  return (
    <div className="animate-fade-up">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Library className="h-6 w-6 text-primary-600" /> Bibliotecas curadas
        </h1>
        <p className="text-slate-600 mt-1 text-sm">
          Perguntas clínicas pré-construídas com PICO e query PubMed. Clica para executar a busca diretamente.
        </p>
      </div>

      {areas.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setArea(undefined)}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${
              !area ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-200 hover:border-primary-300'
            }`}
          >
            Todas
          </button>
          {areas.map((a) => (
            <button
              key={a.area}
              onClick={() => setArea(a.area)}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${
                area === a.area ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-200 hover:border-primary-300'
              }`}
            >
              {a.area} ({a.count})
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-8 text-slate-500">A carregar...</div>
      ) : queries.length === 0 ? (
        <p className="text-slate-500">
          Ainda não há queries curadas. Corre <code className="text-xs bg-slate-100 px-1 rounded">npm run seed:curated</code> no backend para adicionar exemplos.
        </p>
      ) : (
        <div className="space-y-3">
          {queries.map((q: any) => (
            <div key={q.id} className="card flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs px-2 py-0.5 bg-primary-50 text-primary-700 rounded">{q.area}</span>
                  {q.subarea && <span className="text-xs text-slate-400">{q.subarea}</span>}
                  {q.is_validated ? (
                    <span className="text-xs text-emerald-600 inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> validada
                    </span>
                  ) : (
                    <span className="text-xs text-amber-600">não validada</span>
                  )}
                </div>
                <h3 className="font-medium text-slate-900 leading-snug">{q.clinical_question}</h3>
                {q.description && <p className="text-xs text-slate-500 mt-1">{q.description}</p>}
              </div>
              <button
                onClick={() => {
                  setInstantiatingId(q.id);
                  instantiateMutation.mutate(q.id);
                }}
                disabled={instantiateMutation.isPending}
                className="btn-primary text-xs shrink-0"
              >
                {instantiateMutation.isPending && instantiatingId === q.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>Executar <ArrowRight className="h-3 w-3 ml-1" /></>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
