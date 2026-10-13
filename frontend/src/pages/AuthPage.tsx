import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { API_BASE } from '../lib/apiClient';
import { useAuthStore } from '../store/authStore';

interface LoginResponse {
  access_token: string;
}

async function loginRequest(email: string, password: string): Promise<LoginResponse> {
  const body = new URLSearchParams();
  body.set('username', email);
  body.set('password', password);
  const res = await fetch(`${API_BASE}/auth/login`, { method: 'POST', body });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}) as { detail?: string });
    throw new Error(err.detail || 'Login failed');
  }
  return res.json();
}

async function registerRequest(email: string, password: string, name: string) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: name || null }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}) as { detail?: string });
    throw new Error(err.detail || 'Registration failed');
  }
}

export default function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const tab: 'login' | 'register' = location.pathname === '/register' ? 'register' : 'login';

  const afterLogin = (token: string, email: string) => {
    login(token, email);
    navigate('/dashboard');
  };

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => loginRequest(email, password),
  });

  const registerMutation = useMutation({
    mutationFn: async ({ email, password, name }: { email: string; password: string; name: string }) => {
      await registerRequest(email, password, name);
      return loginRequest(email, password);
    },
  });

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');

  function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    loginMutation.mutate(
      { email: loginEmail.trim(), password: loginPassword },
      { onSuccess: (data) => afterLogin(data.access_token, loginEmail.trim()) },
    );
  }

  function handleRegisterSubmit(e: FormEvent) {
    e.preventDefault();
    const email = registerEmail.trim();
    registerMutation.mutate(
      { email, password: registerPassword, name: registerName.trim() },
      { onSuccess: (data) => afterLogin(data.access_token, email) },
    );
  }

  return (
    <section className="page">
      <div className="auth-card">
        <div className="tabs">
          <button
            type="button"
            className={`tab-btn${tab === 'login' ? ' active' : ''}`}
            onClick={() => navigate('/login')}
          >
            Login
          </button>
          <button
            type="button"
            className={`tab-btn${tab === 'register' ? ' active' : ''}`}
            onClick={() => navigate('/register')}
          >
            Register
          </button>
        </div>

        {tab === 'login' ? (
          <form className="auth-form" onSubmit={handleLoginSubmit}>
            <label>
              Email{' '}
              <input
                type="email"
                required
                autoComplete="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
            </label>
            <label>
              Password{' '}
              <input
                type="password"
                required
                autoComplete="current-password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
            </label>
            <button type="submit" className="btn btn-primary">
              Login
            </button>
            <p className="form-msg" role="alert">
              {loginMutation.isError ? (loginMutation.error as Error).message : ''}
            </p>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleRegisterSubmit}>
            <label>
              Name{' '}
              <input
                type="text"
                autoComplete="name"
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
              />
            </label>
            <label>
              Email{' '}
              <input
                type="email"
                required
                autoComplete="email"
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
              />
            </label>
            <label>
              Password{' '}
              <input
                type="password"
                minLength={6}
                required
                autoComplete="new-password"
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
              />
            </label>
            <button type="submit" className="btn btn-primary">
              Create account
            </button>
            <p
              className="form-msg"
              role="alert"
              style={{ color: registerMutation.isError ? 'var(--danger)' : 'var(--success)' }}
            >
              {registerMutation.isError
                ? (registerMutation.error as Error).message
                : registerMutation.isPending
                  ? ''
                  : registerMutation.isSuccess
                    ? 'Account created — signing you in…'
                    : ''}
            </p>
          </form>
        )}

        <div className="divider">or</div>
        <div className="oauth-row">
          <button
            className="btn btn-google"
            type="button"
            onClick={() => {
              window.location.href = `${API_BASE}/auth/google/login`;
            }}
          >
            <span aria-hidden="true">🔵</span> Continue with Google
          </button>
          <p className="muted" style={{ textAlign: 'center', fontSize: '0.78rem' }}>
            Google sign-in requires server configuration — see Help for details.
          </p>
        </div>
      </div>
    </section>
  );
}
