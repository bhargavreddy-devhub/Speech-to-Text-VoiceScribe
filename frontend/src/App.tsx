import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { TopBar } from './components/layout/TopBar';
import { Footer } from './components/layout/Footer';
import { DetailModal } from './components/detail/DetailModal';
import { RequireAuth } from './routes/RequireAuth';
import { RequireAdmin } from './routes/RequireAdmin';
import { RedirectIfAuthed } from './routes/RedirectIfAuthed';
import { useAuthStore } from './store/authStore';
import { useA11yStore } from './store/a11yStore';
import { useAuthedUser } from './hooks/useAuthedUser';

const HomePage = lazy(() => import('./pages/HomePage'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const WorkspacePage = lazy(() => import('./pages/WorkspacePage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
const HelpPage = lazy(() => import('./pages/HelpPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const OAuthCompletePage = lazy(() => import('./pages/OAuthCompletePage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

const centeredMuted = { textAlign: 'center' as const, padding: '60px 0' };

function ScrollAndFocusOnRouteChange() {
  const location = useLocation();
  useEffect(() => {
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return null;
}

function AppShell() {
  const token = useAuthStore((s) => s.token);
  const theme = useA11yStore((s) => s.theme);
  const contrast = useA11yStore((s) => s.contrast);
  const fontScale = useA11yStore((s) => s.fontScale);
  const userQuery = useAuthedUser();

  useEffect(() => {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    document.documentElement.setAttribute('data-contrast', contrast ? 'high' : 'normal');
    document.documentElement.style.setProperty('--font-scale', String(fontScale));
  }, [theme, contrast, fontScale]);

  // Avoid a flash-redirect away from admin-only content while the initial
  // /auth/me fetch (which tells us is_admin) is still in flight after reload.
  const bootstrapping = !!token && userQuery.isLoading;

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <TopBar />
      <ScrollAndFocusOnRouteChange />
      <main id="main" className="container-wide" tabIndex={-1}>
        {bootstrapping ? (
          <p className="muted" style={centeredMuted}>
            Loading…
          </p>
        ) : (
          <Suspense
            fallback={
              <p className="muted" style={centeredMuted}>
                Loading…
              </p>
            }
          >
            <Routes>
              <Route path="/" element={<Navigate to={token ? '/dashboard' : '/home'} replace />} />
              <Route path="/home" element={<HomePage />} />
              <Route
                path="/login"
                element={
                  <RedirectIfAuthed>
                    <AuthPage />
                  </RedirectIfAuthed>
                }
              />
              <Route
                path="/register"
                element={
                  <RedirectIfAuthed>
                    <AuthPage />
                  </RedirectIfAuthed>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <RequireAuth>
                    <DashboardPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/workspace"
                element={
                  <RequireAuth>
                    <WorkspacePage />
                  </RequireAuth>
                }
              />
              <Route
                path="/history"
                element={
                  <RequireAuth>
                    <HistoryPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/profile"
                element={
                  <RequireAuth>
                    <ProfilePage />
                  </RequireAuth>
                }
              />
              <Route
                path="/admin"
                element={
                  <RequireAdmin>
                    <AdminPage />
                  </RequireAdmin>
                }
              />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="/oauth-complete" element={<OAuthCompletePage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        )}
      </main>
      <Footer />
      <DetailModal />
    </>
  );
}

export function App() {
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  );
}
