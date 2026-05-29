import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Users, Check, X, Trash2, Inbox, Search } from 'lucide-react';
import { api } from '../lib/api';
import { Avatar } from '../components/Avatar';
import { SavedArticleCard } from '../components/SavedArticleCard';

const PERIODS = [
  { key: 'all', label: 'Tudo' },
  { key: 'today', label: 'Hoje' },
  { key: 'yesterday', label: 'Ontem' },
  { key: '7d', label: 'Últimos 7 dias' },
  { key: '30d', label: 'Últimos 30 dias' },
] as const;

type PeriodKey = (typeof PERIODS)[number]['key'];

function inPeriod(iso: string, period: PeriodKey): boolean {
  if (period === 'all') return true;
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'today') return d >= startOfToday;
  if (period === 'yesterday') {
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfToday.getDate() - 1);
    return d >= startOfYesterday && d < startOfToday;
  }
  const cutoff = new Date(startOfToday);
  cutoff.setDate(startOfToday.getDate() - (period === '7d' ? 6 : 29));
  return d >= cutoff;
}

function parseAuthors(a: any): any[] {
  return typeof a === 'string' ? JSON.parse(a) : a ?? [];
}

export function FriendsPage() {
  const qc = useQueryClient();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [period, setPeriod] = useState<PeriodKey>('all');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  const friends = useQuery({ queryKey: ['friends'], queryFn: () => api.listFriends() });
  const requests = useQuery({ queryKey: ['friend-requests'], queryFn: () => api.listFriendRequests() });
  const activity = useQuery({ queryKey: ['friend-activity'], queryFn: () => api.friendActivity() });
  const incoming = useQuery({ queryKey: ['pdf-requests-incoming'], queryFn: () => api.incomingPdfRequests() });
  const peopleSearch = useQuery({
    queryKey: ['user-search', debounced],
    queryFn: () => api.searchUsers(debounced),
    enabled: debounced.length >= 2,
  });

  const filteredActivity = useMemo(() => {
    const items = activity.data?.activity ?? [];
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      if (!inPeriod(it.added_at, period)) return false;
      if (!needle) return true;
      const authors = parseAuthors(it.authors).map((a: any) => a.name).join(' ');
      return [it.title, it.journal, it.friend_name, authors, it.year]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [activity.data, q, period]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['friends'] });
    qc.invalidateQueries({ queryKey: ['friend-requests'] });
    qc.invalidateQueries({ queryKey: ['friend-activity'] });
  };

  const addById = useMutation({
    mutationFn: (userId: string) => api.addFriendById(userId),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ['user-search'] });
      qc.invalidateQueries({ queryKey: ['friend-requests'] });
      qc.invalidateQueries({ queryKey: ['friends'] });
    },
    onError: (e: any) => setError(e.message ?? 'Não foi possível enviar o pedido.'),
  });

  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => api.respondFriendRequest(id, accept),
    onSuccess: invalidateAll,
  });

  const remove = useMutation({
    mutationFn: (friendId: string) => api.removeFriend(friendId),
    onSuccess: invalidateAll,
  });

  const importItem = useMutation({
    mutationFn: (paperId: string) => api.importFromFriend(paperId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['friend-activity'] }),
  });

  const resolveReq = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'fulfilled' | 'declined' }) =>
      api.resolvePdfRequest(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pdf-requests-incoming'] }),
  });

  async function openOA(paperId: string) {
    try {
      const { links } = await api.getPaperAccess(paperId);
      const free = links.find((l) => l.free) ?? links[0];
      if (free) window.open(free.url, '_blank');
      else setError('Sem via de acesso aberta disponível.');
    } catch (e: any) {
      setError(e.message ?? 'Não foi possível obter o acesso.');
    }
  }

  async function askPdf(paperId: string, ownerId: string) {
    try {
      const { deeplink } = await api.requestPdf(paperId, ownerId);
      window.open(deeplink, '_blank');
      qc.invalidateQueries({ queryKey: ['pdf-requests-incoming'] });
    } catch (e: any) {
      setError(e.message ?? 'Não foi possível criar o pedido.');
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Colegas</h1>
        <p className="mt-1 text-sm text-slate-500">
          Vê o que os teus colegas estão a guardar e troca artigos. Artigos de acesso aberto abrem
          diretamente; para os restantes, pedes o PDF ao colega — a troca acontece no vosso canal. As
          definições de partilha estão no teu{' '}
          <Link to="/profile" className="text-primary-600 underline">
            perfil
          </Link>
          .
        </p>
      </div>

      {/* Find colleagues by name */}
      <section className="card space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <UserPlus className="h-5 w-5 text-primary-600" /> Encontrar colegas
        </h2>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Procurar colega por nome…"
            className="input-field pl-9"
          />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}

        {debounced.length >= 2 &&
          (peopleSearch.isLoading ? (
            <p className="text-sm text-slate-500">A procurar…</p>
          ) : (peopleSearch.data?.results.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500">Ninguém encontrado com esse nome.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {peopleSearch.data!.results.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar url={u.avatar_url} name={u.name} size={32} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{u.name ?? 'Sem nome'}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {[u.speciality, u.city].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </span>
                  </span>
                  {u.relationship === 'friends' ? (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                      <Check className="h-3.5 w-3.5" /> Amigos
                    </span>
                  ) : u.relationship === 'pending_out' ? (
                    <span className="text-xs text-slate-400">Pendente</span>
                  ) : u.relationship === 'pending_in' ? (
                    <span className="text-xs text-primary-600">Pediu-te amizade</span>
                  ) : (
                    <button
                      className="btn-primary text-xs"
                      onClick={() => addById.mutate(u.id)}
                      disabled={addById.isPending}
                    >
                      <UserPlus className="h-3.5 w-3.5" /> Adicionar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ))}
        <p className="text-xs text-slate-400">
          Só aparecem colegas que permitem ser encontrados. O email nunca é mostrado.
        </p>
      </section>

      {/* Incoming friend requests */}
      {(requests.data?.requests.length ?? 0) > 0 && (
        <section className="card space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Pedidos de amizade</h2>
          <ul className="space-y-2">
            {requests.data!.requests.map((r) => (
              <li key={r.friendship_id} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2">
                  <Avatar url={r.avatar_url} name={r.name ?? r.email} size={32} />
                  <span>
                    <strong>{r.name ?? r.email}</strong>
                    {r.name && <span className="text-slate-400"> · {r.email}</span>}
                  </span>
                </span>
                <span className="flex gap-2">
                  <button
                    className="btn-primary"
                    onClick={() => respond.mutate({ id: r.friendship_id, accept: true })}
                  >
                    <Check className="h-4 w-4" /> Aceitar
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => respond.mutate({ id: r.friendship_id, accept: false })}
                  >
                    <X className="h-4 w-4" /> Recusar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Incoming PDF requests */}
      {(incoming.data?.requests.filter((r) => r.status === 'pending').length ?? 0) > 0 && (
        <section className="card space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Inbox className="h-5 w-5 text-primary-600" /> Pedidos de PDF
          </h2>
          <p className="text-xs text-slate-500">
            Um colega pediu-te um artigo. Envia-lho pelo vosso canal e marca como enviado.
          </p>
          <ul className="space-y-3">
            {incoming.data!.requests
              .filter((r) => r.status === 'pending')
              .map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 text-sm">
                  <span>
                    <strong>{r.requester_name ?? r.requester_email}</strong> pediu{' '}
                    <span className="italic">“{r.title}”</span>
                  </span>
                  <span className="flex shrink-0 gap-2">
                    <button
                      className="btn-primary"
                      onClick={() => resolveReq.mutate({ id: r.id, status: 'fulfilled' })}
                    >
                      <Check className="h-4 w-4" /> Enviei
                    </button>
                    <button
                      className="btn-ghost"
                      onClick={() => resolveReq.mutate({ id: r.id, status: 'declined' })}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}

      {/* Friends list */}
      <section className="card space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Users className="h-5 w-5 text-primary-600" /> Os meus colegas
        </h2>
        {friends.data?.friends.length ? (
          <ul className="divide-y divide-slate-100">
            {friends.data.friends.map((f) => (
              <li key={f.friendship_id} className="flex items-center justify-between py-2 text-sm">
                <Link to={`/friends/${f.id}`} className="flex min-w-0 items-center gap-2 hover:opacity-80">
                  <Avatar url={f.avatar_url} name={f.name ?? f.email} size={32} />
                  <span className="min-w-0">
                    <strong className="hover:underline">{f.name ?? f.email}</strong>
                    {f.name && <span className="text-slate-400"> · {f.email}</span>}
                  </span>
                </Link>
                <button className="btn-ghost text-rose-600" onClick={() => remove.mutate(f.id)} title="Remover">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Ainda não tens colegas. Adiciona um pelo email acima.</p>
        )}
      </section>

      {/* Activity feed */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">O que os teus colegas guardaram</h2>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Procurar por título, autor, revista…"
              className="input-field pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={
                  period === p.key
                    ? 'rounded-lg bg-primary-50 px-2.5 py-1.5 text-xs font-medium text-primary-700'
                    : 'rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100'
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {activity.isLoading ? (
          <p className="text-sm text-slate-500">A carregar…</p>
        ) : (activity.data?.activity.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-500">
            Sem atividade ainda. Os saves dos teus colegas aparecem aqui quando eles ativam a partilha.
          </p>
        ) : filteredActivity.length === 0 ? (
          <p className="text-sm text-slate-500">Nada corresponde à tua busca/filtro.</p>
        ) : (
          <ul className="space-y-3">
            {filteredActivity.map((it) => (
              <SavedArticleCard
                key={`${it.friend_id}-${it.paper_id}`}
                item={it}
                importing={importItem.isPending}
                onOpenOA={openOA}
                onAskPdf={askPdf}
                onImport={(id) => importItem.mutate(id)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
