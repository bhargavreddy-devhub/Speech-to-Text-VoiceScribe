import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export function RequireAdmin({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  if (!token) return <Navigate to="/login" replace />;
  if (!user?.is_admin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
