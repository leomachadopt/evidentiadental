import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserPlus,
  Users,
  Check,
  X,
  Trash2,
  Unlock,
  Download,
  Send,
  Inbox,
  Loader2,
  ExternalLink,
  Search,
} from 'lucide-react';
import { api } from '../lib/api';
import { Avatar } from '../components/Avatar';

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

function authorLine(authors: any, journal: string | null, year: number | null): string {
  const list = parseAuthors(authors);
  const names = list.slice(0, 3).map((a: any) => a.name).join(', ') + (list.length > 3 ? ' et al' : '');
  return [names, journal, year].filter(Boolean).join(' · ');
}

export function FriendsPage() {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [period, setPeriod] = useState<PeriodKey>('all');

  const friends = useQuery({ queryKey: ['friends'], queryFn: () => api.listFriends() });
  const requests = useQuery({ queryKey: ['friend-requests'], queryFn: () => api.listFriendRequests() });
  const activity = useQuery({ queryKey: ['friend-activity'], queryFn: () => api.friendActivity() });
  const incoming = useQuery({ queryKey: ['pdf-requests-incoming'], queryFn: () => api.incomingPdfRequests() });

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

  const addFriend = useMutation({
    mutationFn: () => api.addFriend(email.trim()),
    onSuccess: (r) => {
      setError(null);
      const msgs: Record<string, string> = {
        sent: 'Pedido enviado.',
        accepted: 'Já eram amigos pendentes — agora estão ligados!',
        already_pending: 'Já tens um pedido pendente para este colega.',
        already_friends: 'Já são amigos.',
      };
      setNotice(msgs[r.status] ?? 'Pedido enviado.');
      setEmail('');
      invalidateAll();
    },
    onError: (e: any) => {
      setNotice(null);
      setError(e.message ?? 'Não foi possível enviar o pedido.');
    },
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

      {/* Add friend */}
      <section className="card space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <UserPlus className="h-5 w-5 text-primary-600" /> Adicionar colega
        </h2>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) addFriend.mutate();
          }}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@do-colega.com"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <button type="submit" className="btn-primary" disabled={addFriend.isPending}>
            {addFriend.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar pedido'}
          </button>
        </form>
        {notice && <p className="text-sm text-emerald-600">{notice}</p>}
        {error && <p className="text-sm text-rose-600">{error}</p>}
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
                <span className="flex items-center gap-2">
                  <Avatar url={f.avatar_url} name={f.name ?? f.email} size={32} />
                  <span>
                    <strong>{f.name ?? f.email}</strong>
                    {f.name && <span className="text-slate-400"> · {f.email}</span>}
                  </span>
                </span>
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
              <li key={`${it.friend_id}-${it.paper_id}`} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <Avatar url={it.friend_avatar} name={it.friend_name} size={36} />
                    <div className="min-w-0">
                      <p className="text-xs text-primary-600">{it.friend_name ?? 'Um colega'} guardou</p>
                      <p className="font-medium leading-snug">{it.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {authorLine(it.authors, it.journal, it.year)}
                      </p>
                    </div>
                  </div>
                  {it.is_open_access && (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
                      Open access
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {it.is_open_access ? (
                    <button className="btn-ghost text-xs" onClick={() => openOA(it.paper_id)}>
                      <Unlock className="h-3.5 w-3.5" /> Aceder (OA)
                    </button>
                  ) : it.friend_has_pdf && it.friend_accepts_requests ? (
                    <button className="btn-ghost text-xs" onClick={() => askPdf(it.paper_id, it.friend_id)}>
                      <Send className="h-3.5 w-3.5" /> Pedir PDF a {it.friend_name ?? 'colega'}
                    </button>
                  ) : null}

                  {it.pmid && (
                    <a
                      className="btn-ghost text-xs"
                      href={`https://pubmed.ncbi.nlm.nih.gov/${it.pmid}/`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> PubMed
                    </a>
                  )}

                  {it.in_my_library ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-400">
                      <Check className="h-3.5 w-3.5" /> Na tua biblioteca
                    </span>
                  ) : (
                    <button
                      className="btn-primary text-xs"
                      onClick={() => importItem.mutate(it.paper_id)}
                      disabled={importItem.isPending}
                    >
                      <Download className="h-3.5 w-3.5" /> Adicionar à biblioteca
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
