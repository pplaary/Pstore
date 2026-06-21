/**
 * 管理模式 Zustand Store
 *
 * 纯内存态，重启回普通模式。
 */

import { create } from 'zustand';

export interface ModeState {
  isManagement: boolean;
  enterManagement: () => void;
  exitManagement: () => void;
}

export const useModeStore = create<ModeState>()((set) => ({
  isManagement: false,
  enterManagement: () => set({ isManagement: true }),
  exitManagement: () => set({ isManagement: false }),
}));
