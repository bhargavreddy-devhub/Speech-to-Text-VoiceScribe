import { useQuery } from '@tanstack/react-query';
import { API_BASE } from '../lib/apiClient';
import type { HealthOut } from '../types';

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async (): Promise<HealthOut> => {
      const res = await fetch(`${API_BASE}/health`);
      if (!res.ok) throw new Error('health check failed');
      return res.json();
    },
    retry: false,
    staleTime: Infinity,
  });
}
