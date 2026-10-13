import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (token) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
