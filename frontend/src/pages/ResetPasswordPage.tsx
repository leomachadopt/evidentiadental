import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('As passwords não coincidem.');
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="card">
        <h2 className="text-2xl font-semibold tracking-tight">Definir nova password</h2>

        {done ? (
          <div className="mt-6 flex items-start gap-3 rounded-lg bg-primary-50 px-4 py-3 text-sm text-primary-800 ring-1 ring-primary-100">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
            <span>Password atualizada. A redirecionar para o login…</span>
          </div>
        ) : !token ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
              Link inválido ou em falta. Pede um novo link de recuperação.
            </div>
            <Link to="/forgot-password" className="block text-center text-sm text-primary-600 hover:text-primary-700">
              Pedir novo link
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-500">Escolhe uma nova password para a tua conta.</p>
            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700">Nova password</label>
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
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700">Confirmar password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  className="input-field"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repete a password"
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">{error}</div>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar nova password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
