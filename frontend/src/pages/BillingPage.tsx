import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Loader2, Building2 } from 'lucide-react';
import { api } from '../lib/api';

// Single plan — same features regardless of billing cadence.
const FEATURES = [
  '30 buscas por mês',
  'Mini-sínteses com citações validadas',
  'Biblioteca pessoal',
  'Exports Markdown + PDF',
  'Acesso institucional (legal)',
];

export function BillingPage() {
  const [cadence, setCadence] = useState<'monthly' | 'annual'>('annual');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = new URLSearchParams(window.location.search);
  const justSucceeded = params.get('success') === 'true';

  const { data: status } = useQuery({
    queryKey: ['billing-status'],
    queryFn: () => api.billingStatus(),
    // After returning from Stripe, poll until the webhook grants access so the
    // user sees confirmation instead of the plan picker again.
    refetchInterval: (q) => (justSucceeded && !q.state.data?.hasAccess ? 2000 : false),
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

  async function checkout(plan: 'monthly' | 'annual') {
    setError(null);
    setCheckoutLoading(true);
    try {
      const { url } = await api.billingCheckout(plan);
      window.location.href = url;
    } catch (e: any) {
      setError(e.message);
      setCheckoutLoading(false);
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

  const statusLabel: Record<string, string> = {
    trialing: 'Trial',
    active: 'Ativo',
    past_due: 'Pagamento pendente',
    canceled: 'Cancelada',
  };
  const planLabel = status?.isAdmin
    ? 'Admin (acesso total)'
    : status?.subscriptionStatus
      ? (statusLabel[status.subscriptionStatus] ?? status.subscriptionStatus)
      : 'Sem subscrição';
  const hasSub = status?.subscriptionStatus === 'trialing' || status?.subscriptionStatus === 'active';
  // While confirming a fresh payment, don't show the plan picker again.
  const confirming = justSucceeded && !!status && !status.hasAccess;
  const showSubscribe = !!status && !status.hasAccess && !confirming;

  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">A tua conta</h1>

      {justSucceeded && !confirming && (
        <div className="card mb-6 flex items-center gap-2 border-green-200 bg-green-50 text-sm text-green-800">
          <Check className="h-5 w-5" /> Subscrição ativada. Obrigado!
        </div>
      )}

      {confirming && (
        <div className="card mb-6 flex items-center gap-2 border-primary-200 bg-primary-50 text-sm text-primary-800">
          <Loader2 className="h-5 w-5 animate-spin" /> A confirmar o teu pagamento com o Stripe…
        </div>
      )}

      {status && (
        <div className="card mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm text-slate-500">Plano atual</div>
              <div className="text-xl font-semibold">{planLabel}</div>
              {status.currentPeriodEnd && (status.subscriptionStatus === 'trialing' || status.subscriptionStatus === 'active') && (
                <div className="mt-1 text-xs text-slate-500">
                  {status.isTrialing ? 'Trial termina em ' : 'Renova em '}
                  {new Date(status.currentPeriodEnd).toLocaleDateString('pt-PT')}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-sm text-slate-500">Buscas este mês</div>
              <div className="text-xl font-semibold nums">
                {status.searchesThisMonth}
                <span className="text-base text-slate-400"> / {status.monthlyLimit ?? '∞'}</span>
              </div>
            </div>
          </div>
          {hasSub && (
            <button onClick={openPortal} className="btn-secondary mt-4 text-xs">
              Gerir subscrição
            </button>
          )}
        </div>
      )}

      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      {/* Subscribe — one plan, monthly or annual */}
      {showSubscribe && (
        <div className="card">
          <div className="mx-auto flex w-fit items-center gap-1 rounded-xl bg-slate-100/70 p-1">
            <button
              onClick={() => setCadence('monthly')}
              className={
                cadence === 'monthly'
                  ? 'rounded-lg bg-white px-4 py-1.5 text-sm font-medium shadow-sm'
                  : 'px-4 py-1.5 text-sm text-slate-500'
              }
            >
              Mensal
            </button>
            <button
              onClick={() => setCadence('annual')}
              className={
                cadence === 'annual'
                  ? 'rounded-lg bg-white px-4 py-1.5 text-sm font-medium shadow-sm'
                  : 'px-4 py-1.5 text-sm text-slate-500'
              }
            >
              Anual <span className="text-primary-600">−17%</span>
            </button>
          </div>

          <div className="mt-6 text-center">
            <div className="text-lg font-semibold">EvidentiaDental</div>
            <div className="mt-1">
              <span className="text-4xl font-bold tracking-tight">{cadence === 'annual' ? '99€' : '9,90€'}</span>
              <span className="text-slate-500"> {cadence === 'annual' ? '/ano' : '/mês'}</span>
            </div>
            <div className="mt-1 text-xs text-primary-700">
              {cadence === 'annual' ? '≈ 2 meses grátis vs mensal' : 'ou 99€/ano (poupa ~17%)'}
            </div>
          </div>

          <ul className="mx-auto mt-5 max-w-sm space-y-2 text-sm text-slate-700">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" /> {f}
              </li>
            ))}
          </ul>

          <button onClick={() => checkout(cadence)} disabled={checkoutLoading} className="btn-primary mt-6 w-full">
            {checkoutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Começar — 7 dias grátis'}
          </button>
          <p className="mt-3 text-center text-xs text-slate-400">
            7 dias grátis, depois cobrado automaticamente. Cancela quando quiseres. Pagamento seguro via Stripe.
          </p>
        </div>
      )}

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
