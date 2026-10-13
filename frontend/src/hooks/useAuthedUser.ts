import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../lib/apiClient';
import { useAuthStore } from '../store/authStore';
import type { UserOut } from '../types';

export function useAuthedUser() {
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);

  const query = useQuery({
    queryKey: ['me', token],
    queryFn: () => apiJson<UserOut>('/auth/me'),
    enabled: !!token,
  });

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }
    if (query.data) setUser(query.data);
    if (query.isError) logout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, query.data, query.isError]);

  return query;
}
