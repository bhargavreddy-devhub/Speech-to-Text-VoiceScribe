import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiJson } from '../lib/apiClient';
import { useAuthStore } from '../store/authStore';
import type { UserOut } from '../types';

export default function OAuthCompletePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const setToken = useAuthStore((s) => s.setToken);
  const login = useAuthStore((s) => s.login);
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    const token = new URLSearchParams(location.search).get('token');
    if (!token) {
      navigate('/dashboard', { replace: true });
      return;
    }
    setToken(token);
    apiJson<UserOut>('/auth/me')
      .then((user) => {
        login(token, user.email);
        setUser(user);
      })
      .catch(() => {
        /* ignore — the user will see /dashboard redirect to /login if the token was bad */
      })
      .finally(() => navigate('/dashboard', { replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="page">
      <p className="muted" style={{ textAlign: 'center', padding: '60px 0' }}>
        Signing you in…
      </p>
    </section>
  );
}
