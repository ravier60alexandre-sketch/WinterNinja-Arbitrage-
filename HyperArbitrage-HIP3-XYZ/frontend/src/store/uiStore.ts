import { create } from "zustand";

interface UIState {
  sidebarOpen: boolean;
  selectedBotId: number | null;
  toggleSidebar: () => void;
  setSelectedBot: (id: number | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  selectedBotId: null,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSelectedBot: (id) => set({ selectedBotId: id }),
}));
