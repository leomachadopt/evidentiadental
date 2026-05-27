import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Loader2, Zap, Building2 } from 'lucide-react';
import { api } from '../lib/api';

const PLANS = [
  {
    id: 'clinical' as const,
    name: 'Clinical',
    price: '19€',
    period: '/mês',
    features: ['50 buscas por dia', 'Mini-sínteses com citações validadas', 'Biblioteca pessoal', 'Exports Markdown + PDF'],
  },
  {
    id: 'pro' as const,
    name: 'Pro',
    price: '49€',
    period: '/mês',
    features: ['Buscas ilimitadas', 'Tudo do Clinical', 'Bibliotecas curadas', 'Acesso prioritário a novas features'],
    highlight: true,
  },
];

export function BillingPage() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const params = new URLSearchParams(window.location.search);
  const justSucceeded = params.get('success') === 'true';

  const { data: status } = useQuery({
    queryKey: ['billing-status'],
    queryFn: () => api.billingStatus(),
  });

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings() });
  const [libkey, setLibkey] = useState('');
  const [ezproxy, setEzproxy] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [savedSettings, setSavedSettings] = useState(false);

  useEffect(() => {
    if (settings) {
      setLibkey(settings.libkeyLibraryId ?? '');
      setEzproxy(settings.ezproxyPrefix ?? '');
    }
  }, [settings]);

  async function saveSettings() {
    setSavingSettings(true);
    setSavedSettings(false);
    try {
      await api.updateSettings({ libkeyLibraryId: libkey, ezproxyPrefix: ezproxy });
      setSavedSettings(true);
    } finally {
      setSavingSettings(false);
    }
  }

  async function checkout(plan: 'clinical' | 'pro') {
    setError(null);
    setLoadingPlan(plan);
    try {
      const { url } = await api.billingCheckout(plan);
      window.location.href = url;
    } catch (e: any) {
      setError(e.message);
      setLoadingPlan(null);
    }
  }

  async function openPortal() {
    setError(null);
    try {
      const { url } = await api.billingPortal();
      window.location.href = url;
    } catch (e: any) {
      setError(e.message);
    }
  }

  const tierLabel: Record<string, string> = { trial: 'Trial', clinical: 'Clinical', pro: 'Pro' };

  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">A tua conta</h1>

      {justSucceeded && (
        <div className="card bg-green-50 border-green-200 mb-6 flex items-center gap-2 text-green-800 text-sm">
          <Check className="h-5 w-5" /> Subscrição ativada. Obrigado!
        </div>
      )}

      {status && (
        <div className="card mb-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="text-sm text-slate-500">Plano atual</div>
              <div className="text-xl font-semibold">{tierLabel[status.tier] ?? status.tier}</div>
              {status.tier === 'trial' && status.trialEndsAt && (
                <div className={`text-xs mt-1 ${status.trialExpired ? 'text-red-600' : 'text-slate-500'}`}>
                  {status.trialExpired
                    ? 'Trial terminado'
                    : `Trial até ${new Date(status.trialEndsAt).toLocaleDateString('pt-PT')}`}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-sm text-slate-500">Buscas hoje</div>
              <div className="text-xl font-semibold">
                {status.searchesToday}
                <span className="text-slate-400 text-base"> / {status.dailyLimit === null || !isFinite(status.dailyLimit) ? '∞' : status.dailyLimit}</span>
              </div>
            </div>
          </div>
          {status.tier !== 'trial' && (
            <button onClick={openPortal} className="btn-secondary text-xs mt-4">
              Gerir subscrição
            </button>
          )}
        </div>
      )}

      {error && <div className="text-sm text-red-600 mb-4">{error}</div>}

      <div className="grid sm:grid-cols-2 gap-4">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`card flex flex-col ${plan.highlight ? 'border-primary-400 ring-1 ring-primary-200' : ''}`}
          >
            {plan.highlight && (
              <span className="self-start text-xs px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full mb-2 inline-flex items-center gap-1">
                <Zap className="h-3 w-3" /> Popular
              </span>
            )}
            <div className="text-lg font-semibold">{plan.name}</div>
            <div className="mt-1 mb-4">
              <span className="text-3xl font-bold">{plan.price}</span>
              <span className="text-slate-500 text-sm">{plan.period}</span>
            </div>
            <ul className="space-y-2 text-sm text-slate-700 flex-1">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary-600 mt-0.5 shrink-0" /> {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => checkout(plan.id)}
              disabled={loadingPlan !== null || status?.tier === plan.id}
              className="btn-primary w-full mt-4"
            >
              {loadingPlan === plan.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : status?.tier === plan.id ? (
                'Plano atual'
              ) : (
                `Subscrever ${plan.name}`
              )}
            </button>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-400 mt-6 text-center">
        Pagamento seguro via Stripe. Cancela quando quiseres.
      </p>

      {/* Institutional full-text access */}
      <div className="card mt-8">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-slate-500" strokeWidth={1.75} />
          <h2 className="text-lg font-semibold tracking-tight">Acesso institucional</h2>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Para abrir artigos pagos através da tua faculdade/biblioteca, de forma legal. Opcional —
          deixa em branco se não tiveres.
        </p>

        <div className="mt-5 space-y-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-700">LibKey — Library ID</label>
            <input
              className="input-field"
              value={libkey}
              onChange={(e) => { setLibkey(e.target.value); setSavedSettings(false); }}
              placeholder="ex: 1234"
            />
            <span className="text-xs text-slate-400">
              O ID da tua instituição no LibKey (Third Iron). Gera links diretos para o PDF via a tua subscrição.
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-700">EZproxy — prefixo de login</label>
            <input
              className="input-field"
              value={ezproxy}
              onChange={(e) => { setEzproxy(e.target.value); setSavedSettings(false); }}
              placeholder="https://login.ezproxy.tua-instituicao.pt/login?url="
            />
            <span className="text-xs text-slate-400">
              Termina em <code className="rounded bg-slate-100 px-1">?url=</code>. Encaminhamos o DOI por aqui para acesso autenticado.
            </span>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button onClick={saveSettings} disabled={savingSettings} className="btn-primary">
            {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
          </button>
          {savedSettings && (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
              <Check className="h-4 w-4" /> Guardado
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
