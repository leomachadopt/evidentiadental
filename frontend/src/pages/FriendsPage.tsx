import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, UserPlus, UserMinus, UserCheck, Check, X, Inbox, Search } from 'lucide-react';
import { api } from '../lib/api';
import { Avatar } from '../components/Avatar';
import { SavedArticleCard } from '../components/SavedArticleCard';
import type { UserSearchResult, FollowUser } from '../lib/api';

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

function detail(u: { speciality: string | null; city: string | null }): string {
  return [u.speciality, u.city].filter(Boolean).join(' · ');
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

  const following = useQuery({ queryKey: ['following'], queryFn: () => api.listFollowing() });
  const followers = useQuery({ queryKey: ['followers'], queryFn: () => api.listFollowers() });
  const activity = useQuery({ queryKey: ['friend-activity'], queryFn: () => api.friendActivity() });
  const incoming = useQuery({ queryKey: ['pdf-requests-incoming'], queryFn: () => api.incomingPdfRequests() });
  const peopleSearch = useQuery({
    queryKey: ['user-search', debounced],
    queryFn: () => api.searchUsers(debounced),
    enabled: debounced.length >= 2,
  });

  const invalidateGraph = () => {
    qc.invalidateQueries({ queryKey: ['user-search'] });
    qc.invalidateQueries({ queryKey: ['following'] });
    qc.invalidateQueries({ queryKey: ['followers'] });
    qc.invalidateQueries({ queryKey: ['friend-activity'] });
  };

  const follow = useMutation({
    mutationFn: (userId: string) => api.follow(userId),
    onSuccess: invalidateGraph,
    onError: (e: any) => setError(e.message ?? 'Não foi possível seguir.'),
  });
  const unfollow = useMutation({
    mutationFn: (userId: string) => api.unfollow(userId),
    onSuccess: invalidateGraph,
  });

  const importItem = useMutation({
    mutationFn: ({ paperId, ownerId }: { paperId: string; ownerId: string }) =>
      api.importFromFriend(paperId, ownerId),
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

  /** Follow/seguir-de-volta/a-seguir button for a person row. */
  function FollowButton({ u }: { u: { id: string; i_follow?: boolean; follows_me?: boolean } }) {
    if (u.i_follow) {
      return (
        <button className="btn-ghost text-xs" onClick={() => unfollow.mutate(u.id)} title="Deixar de seguir">
          <UserCheck className="h-3.5 w-3.5" /> A seguir
        </button>
      );
    }
    return (
      <button className="btn-primary text-xs" onClick={() => follow.mutate(u.id)} disabled={follow.isPending}>
        <UserPlus className="h-3.5 w-3.5" /> {u.follows_me ? 'Seguir de volta' : 'Seguir'}
      </button>
    );
  }

  function PersonRow({ u, action }: { u: FollowUser | UserSearchResult; action: React.ReactNode }) {
    return (
      <li className="flex items-center justify-between gap-3 py-2">
        <Link to={`/friends/${u.id}`} className="flex min-w-0 items-center gap-2 hover:opacity-80">
          <Avatar url={u.avatar_url} name={u.name} size={32} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium hover:underline">{u.name ?? 'Sem nome'}</span>
            <span className="block truncate text-xs text-slate-500">{detail(u) || '—'}</span>
          </span>
        </Link>
        <span className="flex shrink-0 items-center gap-2">{action}</span>
      </li>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Colegas</h1>
        <p className="mt-1 text-sm text-slate-500">
          Segue colegas para veres no teu feed o que eles guardam. Open access abre direto; para os
          restantes, o pedido de PDF requer seguimento mútuo. Definições de partilha no teu{' '}
          <Link to="/profile" className="text-primary-600 underline">
            perfil
          </Link>
          .
        </p>
      </div>

      {/* Compact header: find + counts toggle */}
      <section className="card space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Procurar colega por nome, especialidade ou cidade…"
              className="input-field pl-9"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowLists((v) => !v)}
            className="flex items-center justify-center gap-1.5 self-start whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 sm:self-auto"
          >
            <Users className="h-4 w-4 text-primary-600" />
            Segues {following.data?.following.length ?? 0} ·{' '}
            {followers.data?.followers.length ?? 0} seguidor
            {(followers.data?.followers.length ?? 0) === 1 ? '' : 'es'}
            <ChevronDown className={`h-4 w-4 transition-transform ${showLists ? 'rotate-180' : ''}`} />
          </button>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}

        {debounced.length >= 2 &&
          (peopleSearch.isLoading ? (
            <p className="text-sm text-slate-500">A procurar…</p>
          ) : (peopleSearch.data?.results.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500">Ninguém encontrado.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {peopleSearch.data!.results.map((u) => (
                <PersonRow key={u.id} u={u} action={<FollowButton u={u} />} />
              ))}
            </ul>
          ))}
        <p className="text-xs text-slate-400">
          Só aparecem colegas que permitem ser encontrados. O email nunca é mostrado.
        </p>
      </section>

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
                    <strong>{r.requester_name ?? 'Um colega'}</strong> pediu{' '}
                    <span className="italic">“{r.title}”</span>
                  </span>
                  <span className="flex shrink-0 gap-2">
                    <button className="btn-primary" onClick={() => resolveReq.mutate({ id: r.id, status: 'fulfilled' })}>
                      <Check className="h-4 w-4" /> Enviei
                    </button>
                    <button className="btn-ghost" onClick={() => resolveReq.mutate({ id: r.id, status: 'declined' })}>
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}

      {/* Following + Followers — expandable from the header toggle */}
      {showLists && (
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Users className="h-5 w-5 text-primary-600" /> A seguir
          </h2>
          {following.data?.following.length ? (
            <ul className="divide-y divide-slate-100">
              {following.data.following.map((u) => (
                <PersonRow
                  key={u.id}
                  u={u}
                  action={
                    <>
                      {u.follows_me && <span className="text-xs text-slate-400">Segue-te</span>}
                      <button
                        className="btn-ghost text-rose-600"
                        onClick={() => unfollow.mutate(u.id)}
                        title="Deixar de seguir"
                      >
                        <UserMinus className="h-4 w-4" />
                      </button>
                    </>
                  }
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Ainda não segues ninguém. Procura colegas acima.</p>
          )}
        </section>

        <section className="card space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Users className="h-5 w-5 text-primary-600" /> Seguidores
          </h2>
          {followers.data?.followers.length ? (
            <ul className="divide-y divide-slate-100">
              {followers.data.followers.map((u) => (
                <PersonRow
                  key={u.id}
                  u={u}
                  action={
                    u.i_follow ? (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        <UserCheck className="h-3.5 w-3.5" /> A seguir
                      </span>
                    ) : (
                      <button
                        className="btn-primary text-xs"
                        onClick={() => follow.mutate(u.id)}
                        disabled={follow.isPending}
                      >
                        <UserPlus className="h-3.5 w-3.5" /> Seguir de volta
                      </button>
                    )
                  }
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Ainda não tens seguidores.</p>
          )}
        </section>
      </div>
      )}

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
            Sem atividade ainda. Segue colegas que partilham e os saves deles aparecem aqui.
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
                onImport={(pid, oid) => importItem.mutate({ paperId: pid, ownerId: oid })}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
