import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, Loader2, Check, Trash2, UserPlus } from 'lucide-react';
import { api } from '../lib/api';

export function AdminPage() {
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    speciality: '',
    access: 'active' as 'active' | 'trialing' | 'none',
    isAdmin: false,
  });
  const [createErr, setCreateErr] = useState<string | null>(null);

  const createUser = useMutation({
    mutationFn: () =>
      api.adminCreateUser({
        email: form.email.trim(),
        password: form.password,
        name: form.name.trim() || undefined,
        speciality: form.speciality.trim() || undefined,
        access: form.access,
        isAdmin: form.isAdmin,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      setShowCreate(false);
      setForm({ email: '', password: '', name: '', speciality: '', access: 'active', isAdmin: false });
      setCreateErr(null);
    },
    onError: (e: any) => {
      const msg = e?.message;
      setCreateErr(typeof msg === 'string' ? msg : 'Não foi possível criar o utilizador.');
    },
  });

  const statsQ = useQuery({ queryKey: ['admin-stats'], queryFn: () => api.adminStats(), retry: false });
  const usersQ = useQuery({ queryKey: ['admin-users'], queryFn: () => api.adminUsers(), retry: false });

  const updateUser = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: any }) => api.adminUpdateUser(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => api.adminDeleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
    onError: (e: any) => alert(e?.message ?? 'Falha ao eliminar utilizador.'),
  });

  function confirmDelete(u: any) {
    if (
      window.confirm(
        `Eliminar definitivamente ${u.email}?\n\nIsto cancela a subscrição Stripe (se existir) e apaga as buscas e biblioteca do utilizador. Não pode ser desfeito.`,
      )
    ) {
      deleteUser.mutate(u.id);
    }
  }

  // Backend returns 403 for non-admins.
  const denied =
    (statsQ.error as any)?.message?.includes('administrador') ||
    (usersQ.error as any)?.message?.includes('administrador') ||
    (statsQ.error as any)?.message?.includes('403') ||
    (usersQ.error as any)?.message?.includes('403');

  if (denied) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-500">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-lg font-semibold">Acesso restrito</h1>
        <p className="mt-1 text-sm text-slate-500">Esta área é só para administradores.</p>
      </div>
    );
  }

  const stats = statsQ.data;
  const users = usersQ.data?.users ?? [];

  return (
    <div className="animate-fade-up">
      <h1 className="text-2xl font-semibold tracking-tight">Administração</h1>
      <p className="mt-1 text-sm text-slate-500">Visão geral e gestão de utilizadores.</p>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Utilizadores" value={stats?.totalUsers} loading={statsQ.isLoading} />
        <Stat label="Subscritos" value={stats?.subscribed ?? 0} loading={statsQ.isLoading} />
        <Stat label="Buscas (total)" value={stats?.totalSearches} loading={statsQ.isLoading} />
        <Stat label="Custo IA estimado" value={stats ? `$${stats.estCostUsd.toFixed(2)}` : undefined} loading={statsQ.isLoading} />
      </div>

      {/* Create user */}
      <div className="card mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Criar utilizador</h2>
          <button
            onClick={() => { setShowCreate((v) => !v); setCreateErr(null); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-700"
          >
            <UserPlus className="h-3.5 w-3.5" /> {showCreate ? 'Fechar' : 'Novo utilizador'}
          </button>
        </div>

        {showCreate && (
          <form
            onSubmit={(e) => { e.preventDefault(); createUser.mutate(); }}
            className="mt-4 grid gap-3 sm:grid-cols-2"
          >
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Email *
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input-field"
                placeholder="colega@clinica.pt"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Password *
              <input
                type="text"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="input-field"
                placeholder="Mínimo 8 caracteres"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Nome
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input-field"
                placeholder="Dra. Joana Ribeiro"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Especialidade
              <input
                value={form.speciality}
                onChange={(e) => setForm({ ...form, speciality: e.target.value })}
                className="input-field"
                placeholder="Periodontia, Implantologia…"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Acesso
              <select
                value={form.access}
                onChange={(e) => setForm({ ...form, access: e.target.value as any })}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="active">Ativo (cortesia)</option>
                <option value="trialing">Trial</option>
                <option value="none">Sem acesso</option>
              </select>
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isAdmin}
                onChange={(e) => setForm({ ...form, isAdmin: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300"
              />
              Tornar administrador
            </label>

            {createErr && <p className="text-sm text-red-600 sm:col-span-2">{createErr}</p>}

            <div className="sm:col-span-2">
              <button type="submit" disabled={createUser.isPending} className="btn-primary">
                {createUser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Criar utilizador
              </button>
              <span className="ml-3 text-xs text-slate-400">
                Cortesia: acesso imediato, sem Stripe. Partilha as credenciais com o utilizador.
              </span>
            </div>
          </form>
        )}
      </div>

      {/* Users */}
      <div className="card mt-8 overflow-x-auto">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Utilizadores ({users.length})</h2>
        {usersQ.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}
          </div>
        ) : (
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr className="border-b border-slate-100">
                <th className="py-2 pr-3 font-medium">Email</th>
                <th className="py-2 pr-3 font-medium">Acesso</th>
                <th className="py-2 pr-3 font-medium nums">Buscas</th>
                <th className="py-2 pr-3 font-medium">Registo</th>
                <th className="py-2 pr-3 font-medium">Admin</th>
                <th className="py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u: any) => (
                <tr key={u.id} className="align-middle">
                  <td className="py-2.5 pr-3">
                    <div className="font-medium text-slate-900">{u.email}</div>
                    {u.name && <div className="text-xs text-slate-400">{u.name}{u.speciality ? ` · ${u.speciality}` : ''}</div>}
                  </td>
                  <td className="py-2.5 pr-3">
                    <select
                      value={u.subscription_status === 'active' ? 'active' : u.subscription_status === 'trialing' ? 'trialing' : 'none'}
                      onChange={(e) => updateUser.mutate({ id: u.id, patch: { access: e.target.value as any } })}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                    >
                      <option value="none">Sem acesso</option>
                      <option value="trialing">Trial</option>
                      <option value="active">Ativo</option>
                    </select>
                  </td>
                  <td className="py-2.5 pr-3 nums text-slate-600">{u.total_searches}</td>
                  <td className="py-2.5 pr-3 text-xs text-slate-500">
                    {new Date(u.created_at).toLocaleDateString('pt-PT')}
                  </td>
                  <td className="py-2.5 pr-3">
                    <button
                      onClick={() => updateUser.mutate({ id: u.id, patch: { isAdmin: !u.is_admin } })}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.is_admin ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {u.is_admin ? 'Admin' : '—'}
                    </button>
                  </td>
                  <td className="py-2.5">
                    {u.is_admin ? (
                      <span className="text-xs text-slate-300">—</span>
                    ) : (
                      <button
                        onClick={() => confirmDelete(u)}
                        disabled={deleteUser.isPending}
                        title="Eliminar utilizador"
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        {deleteUser.isPending && deleteUser.variables === u.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Excluir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {updateUser.isSuccess && (
          <div className="mt-3 inline-flex items-center gap-1 text-xs text-emerald-600">
            <Check className="h-3.5 w-3.5" /> Atualizado
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, loading }: { label: string; value?: number | string; loading?: boolean }) {
  return (
    <div className="card">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      {loading ? (
        <div className="skeleton mt-2 h-7 w-16" />
      ) : (
        <div className="mt-1 text-2xl font-semibold tracking-tight nums">{value ?? '—'}</div>
      )}
    </div>
  );
}
