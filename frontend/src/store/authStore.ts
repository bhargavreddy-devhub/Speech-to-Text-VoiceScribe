import { create } from 'zustand';
import type { UserOut } from '../types';

interface AuthState {
  token: string | null;
  email: string | null;
  user: UserOut | null;
  login: (token: string, email: string) => void;
  setToken: (token: string) => void;
  setUser: (user: UserOut | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('voicescribe_token'),
  email: localStorage.getItem('voicescribe_email'),
  user: null,

  login: (token, email) => {
    localStorage.setItem('voicescribe_token', token);
    localStorage.setItem('voicescribe_email', email);
    set({ token, email });
  },

  setToken: (token) => {
    localStorage.setItem('voicescribe_token', token);
    set({ token });
  },

  setUser: (user) => set({ user }),

  logout: () => {
    localStorage.removeItem('voicescribe_token');
    localStorage.removeItem('voicescribe_email');
    set({ token: null, email: null, user: null });
  },
}));
