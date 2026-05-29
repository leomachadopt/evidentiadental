import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, MailCheck } from 'lucide-react';
import { api } from '../lib/api';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="card">
        <h2 className="text-2xl font-semibold tracking-tight">Recuperar password</h2>

        {sent ? (
          <div className="mt-6 space-y-4">
            <div className="flex items-start gap-3 rounded-lg bg-primary-50 px-4 py-3 text-sm text-primary-800 ring-1 ring-primary-100">
              <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
              <span>
                Se existe uma conta com esse email, enviámos um link para definir uma nova password.
                Verifica também o spam. O link expira em 1 hora.
              </span>
            </div>
            <Link to="/login" className="block text-center text-sm text-primary-600 hover:text-primary-700">
              ← Voltar a entrar
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-500">
              Escreve o teu email e enviamos-te um link para repor a password.
            </p>
            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  required
                  className="input-field"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@clinica.pt"
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">{error}</div>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar link'}
              </button>
            </form>
            <Link to="/login" className="mt-5 block text-center text-sm text-primary-600 hover:text-primary-700">
              ← Voltar a entrar
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
