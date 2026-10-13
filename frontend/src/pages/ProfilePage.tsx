import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { useA11yStore } from '../store/a11yStore';
import { apiFetch, apiJson, jsonBody } from '../lib/apiClient';
import { useRecentTranscripts } from '../hooks/useTranscripts';
import { LANGUAGES } from '../constants/languages';
import type { Theme } from '../store/a11yStore';
import type { UserOut, UserProfileUpdate } from '../types';

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const { data: recent } = useRecentTranscripts(200);
  const usedMinutes = (recent || []).reduce((sum, t) => sum + (t.duration_seconds || 0), 0) / 60;

  const deleteAccount = useMutation({
    mutationFn: () => apiFetch('/auth/me', { method: 'DELETE' }),
    onSuccess: () => useAuthStore.getState().logout(),
    onError: (err) => alert((err as Error).message),
  });

  return (
    <section className="page">
      <h2>Profile &amp; Settings</h2>
      <div className="card-row">
        <div className="card">
          <h2>Account</h2>
          {user && <ProfileForm key={user.id} user={user} />}
        </div>
        <div className="card">
          <h2>Usage</h2>
          <p className="muted">
            You've processed roughly {usedMinutes.toFixed(1)} minutes of audio (Free plan limit:
            120 minutes / month).
          </p>
          <h2>Privacy</h2>
          <p className="muted">
            Your transcripts and audio are private to your account and are only used to generate
            your transcript (and, if you use AI features, sent to Anthropic's API for that request
            only).
          </p>
          <button
            className="btn btn-danger"
            onClick={() => {
              if (
                !confirm(
                  'This permanently deletes your account and every transcript you own. Continue?',
                )
              )
                return;
              deleteAccount.mutate();
            }}
          >
            Delete account &amp; all data
          </button>
        </div>
      </div>
    </section>
  );
}

function ProfileForm({ user }: { user: UserOut }) {
  const setUser = useAuthStore((s) => s.setUser);
  const setA11yTheme = useA11yStore((s) => s.setTheme);

  const [name, setName] = useState(user.name || '');
  const [language, setLanguage] = useState(user.preferred_language || 'en');
  const [theme, setTheme] = useState<Theme>(user.theme || 'system');

  const saveProfile = useMutation({
    mutationFn: (patch: UserProfileUpdate) =>
      apiJson<UserOut>('/auth/me', { method: 'PATCH', ...jsonBody(patch) }),
    onSuccess: (updated) => {
      setUser(updated);
      setA11yTheme(updated.theme);
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    saveProfile.mutate({ name: name.trim() || undefined, preferred_language: language, theme });
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label>
        Name <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Email <input type="email" value={user.email} disabled />
      </label>
      <label>
        Preferred language
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Theme
        <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
          <option value="system">Match system</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <button type="submit" className="btn btn-primary">
        Save changes
      </button>
      <p
        className="form-msg"
        role="alert"
        style={{ color: saveProfile.isError ? 'var(--danger)' : 'var(--success)' }}
      >
        {saveProfile.isError
          ? (saveProfile.error as Error).message
          : saveProfile.isSuccess
            ? 'Saved.'
            : ''}
      </p>
    </form>
  );
}
