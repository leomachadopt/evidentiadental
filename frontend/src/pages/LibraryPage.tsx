import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Unlock, Trash2, Folder } from 'lucide-react';
import { api } from '../lib/api';

export function LibraryPage() {
  const queryClient = useQueryClient();
  const [folder, setFolder] = useState<string | undefined>(undefined);

  const { data: foldersData } = useQuery({
    queryKey: ['library-folders'],
    queryFn: () => api.listFolders(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['library', folder],
    queryFn: () => api.listLibrary(folder ? { folder } : {}),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.removeLibraryItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library'] });
      queryClient.invalidateQueries({ queryKey: ['library-folders'] });
    },
  });

  const folders = foldersData?.folders ?? [];
  const items = data?.items ?? [];

  return (
    <div className="animate-fade-up">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">A minha biblioteca</h1>

      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setFolder(undefined)}
          className={`text-xs px-3 py-1.5 rounded-full border transition ${
            !folder ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-200 hover:border-primary-300'
          }`}
        >
          Todos
        </button>
        {folders.map((f) => (
          <button
            key={f.folder}
            onClick={() => setFolder(f.folder)}
            className={`text-xs px-3 py-1.5 rounded-full border transition inline-flex items-center gap-1 ${
              folder === f.folder ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-200 hover:border-primary-300'
            }`}
          >
            <Folder className="h-3 w-3" /> {f.folder} ({f.count})
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-slate-500">A carregar...</div>
      ) : items.length === 0 ? (
        <p className="text-slate-500">
          Ainda não guardaste papers. Usa o botão <strong>Guardar</strong> nos resultados de uma busca.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item: any) => {
            const authors = typeof item.authors === 'string' ? JSON.parse(item.authors) : item.authors ?? [];
            const authorsStr = authors.slice(0, 3).map((a: any) => a.name).join(', ') + (authors.length > 3 ? ' et al' : '');
            return (
              <div key={item.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-slate-900 leading-snug">{item.title}</h3>
                    <div className="text-xs text-slate-500 mt-1">{authorsStr} · {item.journal} · {item.year}</div>
                    <div className="flex flex-wrap gap-3 mt-2 text-xs items-center">
                      {item.pmid && (
                        <a href={`https://pubmed.ncbi.nlm.nih.gov/${item.pmid}/`} target="_blank" rel="noopener"
                           className="text-primary-600 hover:underline inline-flex items-center gap-1">
                          PMID {item.pmid} <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {item.is_open_access && item.oa_pdf_url && (
                        <a href={item.oa_pdf_url} target="_blank" rel="noopener"
                           className="text-emerald-700 hover:underline inline-flex items-center gap-1">
                          <Unlock className="h-3 w-3" /> PDF grátis
                        </a>
                      )}
                      <span className="text-slate-400">{item.folder}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => removeMutation.mutate(item.id)}
                    className="text-slate-400 hover:text-red-600 shrink-0"
                    title="Remover da biblioteca"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
