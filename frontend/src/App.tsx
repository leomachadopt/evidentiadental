import { useState } from 'react';
import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { Menu, X, LogOut } from 'lucide-react';
import { NewSearchPage } from './pages/NewSearchPage';
import { SearchResultsPage } from './pages/SearchResultsPage';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { LandingPage } from './pages/LandingPage';
import { HistoryPage } from './pages/HistoryPage';
import { LibraryPage } from './pages/LibraryPage';
import { FriendsPage } from './pages/FriendsPage';
import { FriendProfilePage } from './pages/FriendProfilePage';
import { ProfilePage } from './pages/ProfilePage';
import { BillingPage } from './pages/BillingPage';
import { AdminPage } from './pages/AdminPage';
import { ReferralsPage } from './pages/ReferralsPage';
import { MeshBackground } from './components/MeshBackground';
import { useQuery } from '@tanstack/react-query';
import { api } from './lib/api';

function isAuthenticated(): boolean {
  return !!localStorage.getItem('evidentia_token');
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Funnel users without an active subscription to /billing. `hasAccess` undefined
// means still loading — render through; once resolved to false, redirect.
function RequireAccess({ hasAccess, children }: { hasAccess: boolean | undefined; children: React.ReactNode }) {
  if (hasAccess === false) return <Navigate to="/billing" replace />;
  return <>{children}</>;
}

const NAV = [
  { to: '/', label: 'Nova busca' },
  { to: '/history', label: 'Histórico' },
  { to: '/library', label: 'Biblioteca' },
  { to: '/referrals', label: 'Convidar' },
  { to: '/friends', label: 'Colegas' },
  { to: '/profile', label: 'Perfil' },
  { to: '/billing', label: 'Conta' },
];

function navClass(active: boolean) {
  return active
    ? 'rounded-lg bg-primary-50 px-3 py-1.5 text-sm font-medium text-primary-700'
    : 'rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900';
}

function Brand() {
  return (
    <Link to="/" className="flex items-center">
      <img src="/logo.png" alt="EvidentiaDental" className="h-9 w-auto" />
    </Link>
  );
}

export default function App() {
  const authed = isAuthenticated();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api.me(), enabled: authed, retry: false });

  function signOut() {
    localStorage.removeItem('evidentia_token');
    window.location.href = '/login';
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <MeshBackground />
      <header className="sticky top-0 z-40 border-b border-white/50 bg-white/65 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Brand />

          {authed && (
            <>
              <nav className="hidden items-center gap-1 md:flex">
                {NAV.map((item) => (
                  <Link key={item.to} to={item.to} className={navClass(location.pathname === item.to)}>
                    {item.label}
                  </Link>
                ))}
                {me?.isAdmin && (
                  <Link to="/admin" className={navClass(location.pathname === '/admin')}>Admin</Link>
                )}
                <button onClick={signOut} className="btn-ghost ml-1" title="Sair">
                  <LogOut className="h-4 w-4" />
                </button>
              </nav>

              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="btn-ghost md:hidden"
                aria-label="Menu"
              >
                {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </>
          )}

          {!authed && location.pathname !== '/login' && (
            <div className="flex items-center gap-2">
              <Link to="/login" className="btn-ghost hidden sm:inline-flex">Entrar</Link>
              <a href="/#precos" className="btn-primary">Começar trial</a>
            </div>
          )}
        </div>

        {authed && menuOpen && (
          <nav className="flex flex-col gap-1 border-t border-white/50 bg-white/80 px-4 py-3 backdrop-blur-xl md:hidden">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className={navClass(location.pathname === item.to)}
              >
                {item.label}
              </Link>
            ))}
            {me?.isAdmin && (
              <Link to="/admin" onClick={() => setMenuOpen(false)} className={navClass(location.pathname === '/admin')}>
                Admin
              </Link>
            )}
            <button onClick={signOut} className="btn-ghost justify-start">
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/"
            element={authed ? <RequireAccess hasAccess={me?.hasAccess}><NewSearchPage /></RequireAccess> : <LandingPage />}
          />
          <Route path="/history" element={<ProtectedRoute><RequireAccess hasAccess={me?.hasAccess}><HistoryPage /></RequireAccess></ProtectedRoute>} />
          <Route path="/library" element={<ProtectedRoute><RequireAccess hasAccess={me?.hasAccess}><LibraryPage /></RequireAccess></ProtectedRoute>} />
          <Route path="/referrals" element={<ProtectedRoute><RequireAccess hasAccess={me?.hasAccess}><ReferralsPage /></RequireAccess></ProtectedRoute>} />
          <Route path="/friends" element={<ProtectedRoute><RequireAccess hasAccess={me?.hasAccess}><FriendsPage /></RequireAccess></ProtectedRoute>} />
          <Route path="/friends/:id" element={<ProtectedRoute><RequireAccess hasAccess={me?.hasAccess}><FriendProfilePage /></RequireAccess></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><RequireAccess hasAccess={me?.hasAccess}><ProfilePage /></RequireAccess></ProtectedRoute>} />
          <Route path="/billing" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
          <Route path="/searches/:id" element={<ProtectedRoute><RequireAccess hasAccess={me?.hasAccess}><SearchResultsPage /></RequireAccess></ProtectedRoute>} />
        </Routes>
      </main>

      <footer className="border-t border-white/50 bg-white/55 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Cada citação veio de uma chamada real ao PubMed. Sem alucinações por construção.</span>
          <span className="text-slate-400">EvidentiaDental</span>
        </div>
      </footer>
    </div>
  );
}
