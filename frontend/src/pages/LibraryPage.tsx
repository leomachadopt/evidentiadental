import { useState, useEffect, useRef } from 'react';
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
  Search,
  StickyNote,
  Save,
  Calendar,
  Send,
} from 'lucide-react';
import { api } from '../lib/api';
import { FullTextAccess } from '../components/FullTextAccess';

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function parseAuthors(a: any): any[] {
  return typeof a === 'string' ? JSON.parse(a) : a ?? [];
}

export function LibraryPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | undefined>(undefined); // collectionId; undefined = Todos
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Search + filters (client-side over the full library)
  const [search, setSearch] = useState('');
  const [onlyOA, setOnlyOA] = useState(false);
  const [onlyPdf, setOnlyPdf] = useState(false);
  const [sort, setSort] = useState<'recent' | 'old'>('recent');

  const { data: colData } = useQuery({ queryKey: ['collections'], queryFn: () => api.listCollections() });
  const collections = colData?.collections ?? [];

  const { data, isLoading } = useQuery({ queryKey: ['library'], queryFn: () => api.listLibrary({}) });
  const allItems: any[] = data?.items ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['library'] });
    qc.invalidateQueries({ queryKey: ['collections'] });
    qc.invalidateQueries({ queryKey: ['library-ids'] });
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
  const noteMut = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => api.updateLibraryItem(id, { note }),
    onSuccess: invalidate,
  });

  // Materialize OA PDFs into our own blob so they show as attached files (with
  // size), not external links. Runs once per item; the "PDF grátis" link stays
  // as a fallback until the file lands.
  const attemptedOa = useRef<Set<string>>(new Set());
  const materializeMut = useMutation({
    mutationFn: (itemId: string) => api.materializeOaPdf(itemId),
    onSuccess: (r) => { if (r.ok) invalidate(); },
  });
  useEffect(() => {
    for (const it of allItems) {
      if (it.is_open_access && !it.pdf_url && it.oa_pdf_url && !attemptedOa.current.has(it.id)) {
        attemptedOa.current.add(it.id);
        materializeMut.mutate(it.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems]);

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

  /** Ask a mutually-followed colleague (who has the PDF) for a paywalled paper. */
  async function askColleaguePdf(paperId: string, colleagueId: string) {
    setError(null);
    try {
      const { deeplink } = await api.requestPdf(paperId, colleagueId);
      window.open(deeplink, '_blank');
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível pedir o PDF.');
    }
  }

  const selectedCol = collections.find((c) => c.id === selected);
  const canManage = selectedCol && selectedCol.name !== 'Inbox';

  const q = search.trim().toLowerCase();
  const items = allItems
    .filter((i) => (selected ? i.collection_id === selected : true))
    .filter((i) => (onlyOA ? i.is_open_access : true))
    .filter((i) => (onlyPdf ? !!i.pdf_url : true))
    .filter((i) => {
      if (!q) return true;
      const authors = parseAuthors(i.authors).map((a: any) => a.name).join(' ');
      return [i.title, i.journal, authors, i.note, i.pmid, String(i.year ?? '')]
        .some((f) => (f ?? '').toString().toLowerCase().includes(q));
    })
    .sort((a, b) => {
      const da = new Date(a.added_at).getTime();
      const db = new Date(b.added_at).getTime();
      return sort === 'recent' ? db - da : da - db;
    });

  return (
    <div className="animate-fade-up">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">A minha biblioteca</h1>

      {/* Folder chips */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
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

      {/* Search + filters */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar por título, autor, revista, nota ou PMID…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-primary-400 focus:outline-none"
          />
        </div>
        <button
          onClick={() => setOnlyOA((v) => !v)}
          className={`rounded-full border px-3 py-1.5 text-xs transition ${
            onlyOA ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-primary-300'
          }`}
        >
          Open access
        </button>
        <button
          onClick={() => setOnlyPdf((v) => !v)}
          className={`rounded-full border px-3 py-1.5 text-xs transition ${
            onlyPdf ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-slate-200 bg-white text-slate-600 hover:border-primary-300'
          }`}
        >
          Com PDF
        </button>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as 'recent' | 'old')}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600 focus:border-primary-400 focus:outline-none"
        >
          <option value="recent">Mais recentes</option>
          <option value="old">Mais antigos</option>
        </select>
      </div>

      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      {isLoading ? (
        <div className="py-8 text-center text-slate-500">A carregar...</div>
      ) : allItems.length === 0 ? (
        <p className="text-slate-500">
          Ainda não guardaste papers. Usa o botão <strong>Guardar</strong> nos resultados de uma busca.
        </p>
      ) : items.length === 0 ? (
        <p className="text-slate-500">Nenhum artigo corresponde aos filtros.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item: any) => {
            const authors = parseAuthors(item.authors);
            const authorsStr =
              authors.slice(0, 3).map((a: any) => a.name).join(', ') + (authors.length > 3 ? ' et al' : '');
            const isUploading = uploadingId === item.id;
            return (
              <div key={item.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium leading-snug text-slate-900">{item.title}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                      <span>{authorsStr} · {item.journal} · {item.year}</span>
                      {item.added_at && (
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <Calendar className="h-3 w-3" /> Guardado a {formatDate(item.added_at)}
                        </span>
                      )}
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
                      {item.is_open_access && item.oa_pdf_url && !item.pdf_url && (
                        <a
                          href={item.oa_pdf_url}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
                        >
                          <Unlock className="h-3 w-3" />
                          {materializeMut.isPending ? 'A obter PDF…' : 'PDF grátis'}
                        </a>
                      )}
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
                      {!item.pdf_url && !item.is_open_access && item.colleague_id && (
                        <button
                          onClick={() => askColleaguePdf(item.paper_id, item.colleague_id)}
                          className="inline-flex items-center gap-1 text-primary-600 hover:underline"
                          title="Pedir o PDF a um colega que o tem"
                        >
                          <Send className="h-3 w-3" /> Pedir PDF a {item.colleague_name ?? 'colega'}
                        </button>
                      )}
                    </div>

                    <NoteEditor
                      key={item.note ?? ''}
                      note={item.note}
                      saving={noteMut.isPending}
                      onSave={(note) => noteMut.mutate({ id: item.id, note })}
                    />

                    <FullTextAccess paperId={item.paper_id} />
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
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

function NoteEditor({
  note,
  saving,
  onSave,
}: {
  note: string | null;
  saving: boolean;
  onSave: (note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note ?? '');

  if (!editing) {
    return note ? (
      <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 text-sm text-slate-700">
        <div className="mb-1 flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
            <StickyNote className="h-3 w-3" /> Nota
          </span>
          <button onClick={() => { setText(note); setEditing(true); }} className="text-xs text-primary-600 hover:underline">
            Editar
          </button>
        </div>
        <p className="whitespace-pre-wrap">{note}</p>
      </div>
    ) : (
      <button
        onClick={() => { setText(''); setEditing(true); }}
        className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-primary-700"
      >
        <StickyNote className="h-3 w-3" /> Adicionar nota
      </button>
    );
  }

  return (
    <div className="mt-2">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Escreve uma nota sobre este artigo…"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none"
      />
      <div className="mt-1 flex items-center gap-2">
        <button
          onClick={() => { onSave(text.trim()); setEditing(false); }}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-md bg-primary-600 px-3 py-1.5 text-xs text-white disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Guardar nota
        </button>
        <button onClick={() => setEditing(false)} className="text-xs text-slate-500 hover:text-slate-700">
          Cancelar
        </button>
      </div>
    </div>
  );
}
