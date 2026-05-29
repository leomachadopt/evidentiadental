import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ExternalLink,
  Unlock,
  Trash2,
  Folder,
  FolderPlus,
  Pencil,
  FileText,
  Upload,
  Loader2,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { FullTextAccess } from '../components/FullTextAccess';

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function LibraryPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | undefined>(undefined); // collectionId; undefined = Todos
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: colData } = useQuery({ queryKey: ['collections'], queryFn: () => api.listCollections() });
  const collections = colData?.collections ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ['library', selected],
    queryFn: () => api.listLibrary(selected ? { collectionId: selected } : {}),
  });
  const items = data?.items ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['library'] });
    qc.invalidateQueries({ queryKey: ['collections'] });
  };

  const createMut = useMutation({
    mutationFn: (name: string) => api.createCollection(name),
    onSuccess: () => { setNewName(''); setAdding(false); setError(null); invalidate(); },
    onError: (e: any) => setError(e.message),
  });
  const renameMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.renameCollection(id, name),
    onSuccess: invalidate,
    onError: (e: any) => setError(e.message),
  });
  const deleteColMut = useMutation({
    mutationFn: (id: string) => api.deleteCollection(id),
    onSuccess: () => { setSelected(undefined); invalidate(); },
  });
  const moveMut = useMutation({
    mutationFn: ({ id, collectionId }: { id: string; collectionId: string }) =>
      api.updateLibraryItem(id, { collectionId }),
    onSuccess: invalidate,
  });
  const removeMut = useMutation({ mutationFn: (id: string) => api.removeLibraryItem(id), onSuccess: invalidate });
  const removePdfMut = useMutation({ mutationFn: (id: string) => api.removePdf(id), onSuccess: invalidate });

  async function handleUpload(itemId: string, file?: File | null) {
    if (!file) return;
    if (file.type !== 'application/pdf') { setError('Só são aceites ficheiros PDF.'); return; }
    setError(null);
    setUploadingId(itemId);
    try {
      await api.uploadPdf(itemId, file);
      invalidate();
    } catch (e: any) {
      setError(e?.message ?? 'Falha no upload do PDF.');
    } finally {
      setUploadingId(null);
    }
  }

  const selectedCol = collections.find((c) => c.id === selected);
  const canManage = selectedCol && selectedCol.name !== 'Inbox';

  return (
    <div className="animate-fade-up">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">A minha biblioteca</h1>

      {/* Folder chips */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setSelected(undefined)}
          className={`rounded-full border px-3 py-1.5 text-xs transition ${
            !selected ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-primary-300'
          }`}
        >
          Todos
        </button>
        {collections.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelected(c.id)}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition ${
              selected === c.id ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-primary-300'
            }`}
          >
            <Folder className="h-3 w-3" /> {c.name} ({c.count})
          </button>
        ))}

        {adding ? (
          <span className="inline-flex items-center gap-1">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) createMut.mutate(newName.trim()); if (e.key === 'Escape') setAdding(false); }}
              placeholder="Nome da pasta"
              className="rounded-full border border-slate-300 px-3 py-1.5 text-xs focus:border-primary-400 focus:outline-none"
            />
            <button
              onClick={() => newName.trim() && createMut.mutate(newName.trim())}
              disabled={createMut.isPending}
              className="rounded-full bg-primary-600 px-3 py-1.5 text-xs text-white"
            >
              Criar
            </button>
            <button onClick={() => { setAdding(false); setError(null); }} className="text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </span>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500 transition hover:border-primary-300 hover:text-primary-700"
          >
            <FolderPlus className="h-3 w-3" /> Nova pasta
          </button>
        )}

        {canManage && (
          <span className="ml-1 inline-flex items-center gap-2 text-slate-400">
            <button
              title="Renomear pasta"
              onClick={() => {
                const name = window.prompt('Novo nome da pasta:', selectedCol!.name)?.trim();
                if (name && name !== selectedCol!.name) renameMut.mutate({ id: selectedCol!.id, name });
              }}
              className="hover:text-primary-700"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              title="Apagar pasta (os artigos vão para o Inbox)"
              onClick={() => {
                if (window.confirm(`Apagar a pasta "${selectedCol!.name}"? Os artigos vão para o Inbox.`))
                  deleteColMut.mutate(selectedCol!.id);
              }}
              className="hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </span>
        )}
      </div>

      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      {isLoading ? (
        <div className="py-8 text-center text-slate-500">A carregar...</div>
      ) : items.length === 0 ? (
        <p className="text-slate-500">
          {selected ? 'Esta pasta está vazia.' : 'Ainda não guardaste papers. Usa o botão '}
          {!selected && <strong>Guardar</strong>}
          {!selected && ' nos resultados de uma busca.'}
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item: any) => {
            const authors = typeof item.authors === 'string' ? JSON.parse(item.authors) : item.authors ?? [];
            const authorsStr =
              authors.slice(0, 3).map((a: any) => a.name).join(', ') + (authors.length > 3 ? ' et al' : '');
            const isUploading = uploadingId === item.id;
            return (
              <div key={item.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium leading-snug text-slate-900">{item.title}</h3>
                    <div className="mt-1 text-xs text-slate-500">
                      {authorsStr} · {item.journal} · {item.year}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                      {item.pmid && (
                        <a
                          href={`https://pubmed.ncbi.nlm.nih.gov/${item.pmid}/`}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex items-center gap-1 text-primary-600 hover:underline"
                        >
                          PMID {item.pmid} <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {item.is_open_access && item.oa_pdf_url && (
                        <a
                          href={item.oa_pdf_url}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
                        >
                          <Unlock className="h-3 w-3" /> PDF grátis
                        </a>
                      )}
                      {/* Uploaded PDF */}
                      {item.pdf_url ? (
                        <span className="inline-flex items-center gap-1">
                          <a
                            href={item.pdf_url}
                            target="_blank"
                            rel="noopener"
                            className="inline-flex items-center gap-1 text-primary-700 hover:underline"
                          >
                            <FileText className="h-3 w-3" /> PDF{item.pdf_size ? ` (${formatSize(item.pdf_size)})` : ''}
                          </a>
                          <button
                            onClick={() => removePdfMut.mutate(item.id)}
                            title="Remover PDF"
                            className="text-slate-400 hover:text-red-600"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ) : (
                        <label className="inline-flex cursor-pointer items-center gap-1 text-slate-500 hover:text-primary-700">
                          {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                          {isUploading ? 'A enviar...' : 'Carregar PDF'}
                          <input
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            disabled={isUploading}
                            onChange={(e) => handleUpload(item.id, e.target.files?.[0])}
                          />
                        </label>
                      )}
                    </div>
                    <FullTextAccess paperId={item.paper_id} />
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {/* Move between folders */}
                    <select
                      value={item.collection_id ?? ''}
                      onChange={(e) => moveMut.mutate({ id: item.id, collectionId: e.target.value })}
                      className="max-w-[10rem] rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 focus:border-primary-400 focus:outline-none"
                      title="Mover para pasta"
                    >
                      {collections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeMut.mutate(item.id)}
                      className="text-slate-400 hover:text-red-600"
                      title="Remover da biblioteca"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
