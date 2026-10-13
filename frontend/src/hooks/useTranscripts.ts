import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiJson, jsonBody } from '../lib/apiClient';
import type { HistoryFilters, TranscriptMetaUpdate, TranscriptOut } from '../types';

export function buildHistoryQuery(filters: HistoryFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.language) params.set('language', filters.language);
  if (filters.source) params.set('source', filters.source);
  if (filters.folder) params.set('folder', filters.folder);
  if (filters.favorite) params.set('favorite', filters.favorite);
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', `${filters.dateTo}T23:59:59`);
  params.set('sort_by', filters.sortBy || 'created_at');
  params.set('sort_dir', filters.sortDir || 'desc');
  return params.toString();
}

export function useTranscripts(filters: HistoryFilters, enabled = true) {
  return useQuery({
    queryKey: ['transcripts', filters],
    queryFn: () => apiJson<TranscriptOut[]>(`/transcripts?${buildHistoryQuery(filters)}`),
    enabled,
  });
}

export function useRecentTranscripts(limit = 200, enabled = true) {
  return useQuery({
    queryKey: ['transcripts', 'recent', limit],
    queryFn: () =>
      apiJson<TranscriptOut[]>(`/transcripts?limit=${limit}&sort_by=created_at&sort_dir=desc`),
    enabled,
  });
}

export function useFolders(enabled = true) {
  return useQuery({
    queryKey: ['folders'],
    queryFn: () => apiJson<string[]>('/transcripts/folders'),
    enabled,
  });
}

export function useTranscriptMutations() {
  const qc = useQueryClient();
  const invalidateLists = () => {
    qc.invalidateQueries({ queryKey: ['transcripts'] });
    qc.invalidateQueries({ queryKey: ['folders'] });
  };

  const updateMeta = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TranscriptMetaUpdate }) =>
      apiJson<TranscriptOut>(`/transcripts/${id}`, { method: 'PATCH', ...jsonBody(patch) }),
    onSuccess: (_data, vars) => {
      invalidateLists();
      qc.invalidateQueries({ queryKey: ['transcript', vars.id] });
    },
  });

  const saveText = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      apiJson<TranscriptOut>(`/transcripts/${id}`, { method: 'PUT', ...jsonBody({ text }) }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['transcripts'] });
      qc.invalidateQueries({ queryKey: ['transcript', vars.id] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/transcripts/${id}`, { method: 'DELETE' }),
    onSuccess: invalidateLists,
  });

  const retry = useMutation({
    mutationFn: (id: string) => apiJson(`/transcribe/${id}/retry`, { method: 'POST' }),
    onSuccess: invalidateLists,
  });

  const cancel = useMutation({
    mutationFn: (id: string) => apiJson(`/transcribe/${id}/cancel`, { method: 'POST' }),
    onSuccess: invalidateLists,
  });

  return { updateMeta, saveText, remove, retry, cancel };
}
