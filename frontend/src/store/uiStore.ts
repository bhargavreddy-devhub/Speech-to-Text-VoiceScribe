import { create } from 'zustand';

interface UiState {
  openDetailId: string | null;
  openDetail: (id: string) => void;
  closeDetail: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  openDetailId: null,
  openDetail: (id) => set({ openDetailId: id }),
  closeDetail: () => set({ openDetailId: null }),
}));
