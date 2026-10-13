import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiJson } from '../lib/apiClient';
import type { AdminStatsOut, AdminUserOut, TranscriptOut } from '../types';

export function useAdminStats(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => apiJson<AdminStatsOut>('/admin/stats'),
    enabled,
  });
}

export function useAdminUsers(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => apiJson<AdminUserOut[]>('/admin/users'),
    enabled,
  });
}

export function useAdminJobs(enabled: boolean, limit = 50) {
  return useQuery({
    queryKey: ['admin', 'jobs', limit],
    queryFn: () => apiJson<TranscriptOut[]>(`/admin/jobs?limit=${limit}`),
    enabled,
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}
