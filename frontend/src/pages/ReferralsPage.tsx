import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type CircleStatus } from '../lib/api';

const SHARE_MESSAGE =
  'Olá! 👋\n\n' +
  'Lembrei-me de ti. Ando a usar uma ferramenta que me dá a evidência do PubMed para as ' +
  'dúvidas do dia a dia, em segundos e com as citações certas — e tem-me poupado imenso tempo.\n\n' +
  'Pensei que podia fazer sentido para ti. Fica aqui o meu link com desconto, caso queiras ' +
  'te juntares a mim 👇';

/** Estado de um convidado como passo do funil, com rótulo e cor. */
function inviteState(f: { status: string | null; counts: boolean }): { label: string; cls: string } {
  if (f.counts) return { label: 'A pagar ✓', cls: 'bg-emerald-100 text-emerald-700' };
  switch (f.status) {
    case 'active':
      return { label: 'A pagar', cls: 'bg-emerald-100 text-emerald-700' };
    case 'trialing':
      return { label: 'Em trial', cls: 'bg-blue-100 text-blue-700' };
    case 'past_due':
      return { label: 'Pagamento em falta', cls: 'bg-amber-100 text-amber-700' };
    case 'canceled':
      return { label: 'Cancelou', cls: 'bg-slate-200 text-slate-500' };
    default:
      return { label: 'Registou-se', cls: 'bg-slate-100 text-slate-500' };
  }
}

export function ReferralsPage() {
  const { data, isLoading, error } = useQuery<CircleStatus>({
    queryKey: ['referrals', 'me'],
    queryFn: () => api.myCircle(),
  });
  const [copied, setCopied] = useState(false);

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard indisponível — o utilizador pode copiar manualmente */
    }
  }

  if (isLoading) {
    return <div className="text-slate-400">A carregar...</div>;
  }
  if (error || !data) {
    return <div className="text-red-600">Não foi possível carregar o teu círculo de indicações.</div>;
  }

  const { activePaying, threshold, discountPct, isFree, searchesPerMonth, bonusSearches, link, friends } = data;
  const remaining = Math.max(0, threshold - activePaying);
  const progress = Math.min(100, (activePaying / threshold) * 100);

  const waLink = `https://wa.me/?text=${encodeURIComponent(`${SHARE_MESSAGE}\n${link}`)}`;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Convidar colegas</h1>
        <p className="text-slate-500 mt-1">
          Por cada colega que assine, a tua mensalidade baixa 20%. Com 5 colegas a pagar, fica{' '}
          <strong>grátis</strong>. A partir daí, cada colega dá-te <strong>+20% de buscas</strong>.
        </p>
      </div>

      {/* Medidor do círculo */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        {isFree ? (
          <p className="text-lg font-semibold text-emerald-700">
            🎉 Mensalidade GRÁTIS — {activePaying}/{threshold} colegas a pagar. Mantém o círculo!
          </p>
        ) : (
          <p className="text-lg font-semibold text-slate-900">
            {activePaying}/{threshold} colegas a pagar
            {discountPct > 0 && (
              <span className="text-blue-600"> — {discountPct}% de desconto na tua mensalidade</span>
            )}
          </p>
        )}

        <div className="mt-3 h-3 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isFree ? 'bg-emerald-500' : 'bg-blue-600'}`}
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="mt-3 text-sm text-slate-600">
          {isFree ? (
            <>
              Tens <strong>{searchesPerMonth} buscas/mês</strong>
              {bonusSearches > 0 && <> (+{bonusSearches} pelas indicações além do 5º colega ⚡)</>}. Cada
              novo colega a pagar dá-te mais 20% de buscas.
            </>
          ) : (
            <>
              Falta{remaining === 1 ? '' : 'm'} <strong>{remaining}</strong> colega
              {remaining === 1 ? '' : 's'} a pagar para a tua mensalidade ficar grátis.
            </>
          )}
        </p>
      </div>

      {/* Link de partilha */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700">O teu link de convite</label>
          <div className="mt-2 flex gap-2">
            <input
              readOnly
              value={link}
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-700 text-sm"
            />
            <button
              onClick={() => copyLink(link)}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition whitespace-nowrap"
            >
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
        </div>

        <a
          href={waLink}
          target="_blank"
          rel="noreferrer"
          className="block text-center px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition"
        >
          Enviar por WhatsApp
        </a>
      </div>

      {/* Lista de colegas */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">
          Colegas que convidaste ({friends.length})
        </h2>
        {friends.length === 0 ? (
          <p className="text-sm text-slate-500">
            Ainda não convidaste ninguém. Partilha o teu link para começar.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {friends.map((f, i) => {
              const st = inviteState(f);
              return (
                <li key={i} className="flex items-center justify-between py-2.5">
                  <span className="text-slate-800">{f.name || 'Colega'}</span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
