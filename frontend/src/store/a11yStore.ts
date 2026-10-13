import { create } from 'zustand';

export type Theme = 'system' | 'light' | 'dark';

interface A11yState {
  theme: Theme;
  contrast: boolean;
  fontScale: number;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  toggleContrast: () => void;
  changeFontScale: (delta: number) => void;
}

function readTheme(): Theme {
  const v = localStorage.getItem('vs_theme');
  return v === 'light' || v === 'dark' ? v : 'system';
}

function readContrast(): boolean {
  return localStorage.getItem('vs_contrast') === 'high';
}

function readFontScale(): number {
  return parseFloat(localStorage.getItem('vs_font_scale') || '1');
}

export const useA11yStore = create<A11yState>((set, get) => ({
  theme: readTheme(),
  contrast: readContrast(),
  fontScale: readFontScale(),

  setTheme: (theme) => {
    localStorage.setItem('vs_theme', theme);
    set({ theme });
  },

  toggleTheme: () => {
    const current = get().theme;
    const next: Theme = current === 'dark' ? 'light' : current === 'light' ? 'system' : 'dark';
    localStorage.setItem('vs_theme', next);
    set({ theme: next });
  },

  toggleContrast: () => {
    const next = !get().contrast;
    localStorage.setItem('vs_contrast', next ? 'high' : 'normal');
    set({ contrast: next });
  },

  changeFontScale: (delta) => {
    const scale = Math.min(1.4, Math.max(0.85, +(get().fontScale + delta).toFixed(2)));
    localStorage.setItem('vs_font_scale', String(scale));
    set({ fontScale: scale });
  },
}));
