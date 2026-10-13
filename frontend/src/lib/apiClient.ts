import { useAuthStore } from '../store/authStore';

export const API_BASE = '/api';

export class ApiError extends Error {}

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...(options.headers as Record<string, string> | undefined), ...authHeaders() },
  });
  if (res.status === 401) {
    useAuthStore.getState().logout();
    throw new ApiError('Session expired, please log in again.');
  }
  if (res.status === 429) {
    throw new ApiError('Too many requests — please slow down and try again shortly.');
  }
  return res;
}

export async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}) as { detail?: string });
    throw new ApiError(err.detail || `Request failed (${res.status})`);
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

export function jsonBody(data: unknown): RequestInit {
  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}

export async function fetchAudioObjectUrl(transcriptId: string): Promise<string | null> {
  const res = await apiFetch(`/transcripts/${transcriptId}/audio`);
  if (!res.ok) return null;
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
