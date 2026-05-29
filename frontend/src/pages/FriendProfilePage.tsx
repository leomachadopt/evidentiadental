import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';
import { Avatar } from '../components/Avatar';
import { SavedArticleCard } from '../components/SavedArticleCard';

export function FriendProfilePage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const profile = useQuery({
    queryKey: ['friend-profile', id],
    queryFn: () => api.friendProfile(id),
    enabled: !!id,
    retry: false,
  });

  const importItem = useMutation({
    mutationFn: (paperId: string) => api.importFromFriend(paperId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['friend-profile', id] }),
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
    } catch (e: any) {
      setError(e.message ?? 'Não foi possível criar o pedido.');
    }
  }

  const back = (
    <Link to="/friends" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
      <ArrowLeft className="h-4 w-4" /> Colegas
    </Link>
  );

  if (profile.isLoading) {
    return (
      <div className="space-y-6">
        {back}
        <p className="text-sm text-slate-500">A carregar…</p>
      </div>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <div className="space-y-6">
        {back}
        <p className="text-sm text-slate-500">
          Colega não encontrado, ou ainda não são amigos.
        </p>
      </div>
    );
  }

  const { profile: p, sharesActivity, items } = profile.data;

  return (
    <div className="space-y-6">
      {back}

      <div className="flex items-center gap-4">
        <Avatar url={p.avatar_url} name={p.name} size={64} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{p.name ?? 'Colega'}</h1>
          <p className="text-sm text-slate-500">
            {[p.speciality, p.city].filter(Boolean).join(' · ') || 'Sem detalhes de perfil'}
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Artigos guardados</h2>
        {!sharesActivity ? (
          <p className="text-sm text-slate-500">Este colega não partilha a atividade da biblioteca.</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">Este colega ainda não guardou artigos.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((it) => (
              <SavedArticleCard
                key={it.paper_id}
                item={it}
                showFriend={false}
                importing={importItem.isPending}
                onOpenOA={openOA}
                onAskPdf={askPdf}
                onImport={(pid) => importItem.mutate(pid)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
