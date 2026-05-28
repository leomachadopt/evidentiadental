import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, Loader2, Check } from 'lucide-react';
import { api } from '../lib/api';

export function AdminPage() {
  const queryClient = useQueryClient();

  const statsQ = useQuery({ queryKey: ['admin-stats'], queryFn: () => api.adminStats(), retry: false });
  const usersQ = useQuery({ queryKey: ['admin-users'], queryFn: () => api.adminUsers(), retry: false });

  const updateUser = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: any }) => api.adminUpdateUser(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
  });

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
                <th className="py-2 font-medium">Admin</th>
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
                  <td className="py-2.5">
                    <button
                      onClick={() => updateUser.mutate({ id: u.id, patch: { isAdmin: !u.is_admin } })}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.is_admin ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {u.is_admin ? 'Admin' : '—'}
                    </button>
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
