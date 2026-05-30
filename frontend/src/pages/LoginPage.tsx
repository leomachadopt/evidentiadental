import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Search, FileText, Loader2 } from 'lucide-react';
import { api, setToken } from '../lib/api';

const PROMISES = [
  { icon: Search, title: 'Busca real no PubMed', body: 'A tua pergunta vira PICO e executa nas bases reais.' },
  { icon: ShieldCheck, title: 'Citações validadas', body: 'Cada PMID é verificado por arquitetura, não pelo modelo.' },
  { icon: FileText, title: 'Síntese citável', body: 'Mini-síntese clínica pronta a exportar em 90 segundos.' },
];

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'login' | 'register'>(
    new URLSearchParams(window.location.search).get('mode') === 'register' ||
      !!localStorage.getItem('referralCode')
      ? 'register'
      : 'login',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [speciality, setSpeciality] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result =
        mode === 'login'
          ? await api.login({ email, password })
          : await api.register({
              email,
              password,
              name,
              speciality,
              referralCode: localStorage.getItem('referralCode') || undefined,
            });
      if (mode === 'register') localStorage.removeItem('referralCode'); // consumido
      setToken(result.token);
      queryClient.invalidateQueries({ queryKey: ['me'] });
      if (result.user?.isAdmin) {
        navigate('/admin');
        return;
      }
      if (mode === 'register') {
        // If a plan was chosen on the landing page, go straight to Stripe — skip
        // the billing plan picker. Fall back to /billing if checkout isn't ready.
        const plan = new URLSearchParams(window.location.search).get('plan');
        if (plan === 'monthly' || plan === 'annual') {
          try {
            const { url } = await api.billingCheckout(plan);
            window.location.href = url;
            return;
          } catch {
            navigate('/billing');
            return;
          }
        }
        navigate('/billing');
        return;
      }
      navigate('/');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl overflow-hidden rounded-3xl border border-slate-200/70 shadow-card lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900 p-10 text-white lg:flex">
        <div className="bg-grid absolute inset-0 opacity-20" />
        <div className="relative">
          <img src="/logo.png" alt="EvidentiaDental" className="h-9 w-auto brightness-0 invert" />
          <h1 className="mt-12 text-3xl font-semibold leading-tight tracking-tight">
            Evidência dentária verificada,
            <span className="text-gold-300"> sem alucinações.</span>
          </h1>
          <p className="mt-3 max-w-sm leading-relaxed text-white/80">
            Da pergunta clínica à mini-síntese citável em 90 segundos.
          </p>
        </div>

        <ul className="relative mt-10 space-y-5">
          {PROMISES.map((p) => (
            <li key={p.title} className="flex gap-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/15 ring-1 ring-white/25">
                <p.icon className="h-[18px] w-[18px] text-white" strokeWidth={1.75} />
              </span>
              <div>
                <div className="text-sm font-medium">{p.title}</div>
                <div className="text-sm text-white/70">{p.body}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Form */}
      <div className="bg-white/80 p-8 backdrop-blur-xl sm:p-10">
        <h2 className="text-2xl font-semibold tracking-tight">
          {mode === 'login' ? 'Entrar' : 'Criar conta'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {mode === 'login' ? 'Bem-vindo de volta.' : 'Começa com 7 dias grátis.'}
        </p>

        {mode === 'register' && localStorage.getItem('referralCode') && (
          <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-100">
            🎉 Foste convidado por um colega. Cria a conta para começares o teu trial.
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-7 space-y-4">
          {mode === 'register' && (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700">Nome</label>
                <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dra. Joana Ribeiro" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700">Especialidade</label>
                <input
                  className="input-field"
                  value={speciality}
                  onChange={(e) => setSpeciality(e.target.value)}
                  placeholder="Periodontia, Implantologia, ..."
                />
              </div>
            </>
          )}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-700">Email</label>
            <input type="email" required className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@clinica.pt" />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              required
              minLength={8}
              className="input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">{error}</div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        {mode === 'login' && (
          <Link
            to="/forgot-password"
            className="mt-3 block text-center text-sm text-slate-500 transition hover:text-primary-700"
          >
            Esqueceste-te da password?
          </Link>
        )}

        <button
          type="button"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
          className="mt-5 w-full text-center text-sm text-primary-600 transition hover:text-primary-700"
        >
          {mode === 'login' ? 'Não tens conta? Cria uma →' : '← Já tens conta? Entra'}
        </button>
      </div>
    </div>
  );
}
