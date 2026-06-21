/**
 * 同步配置 Zustand Store
 *
 * 纯内存态，存储 N1 服务器 URL 和同步状态。
 * Phase 4 先用内存态，后续可接入 AsyncStorage 持久化。
 */

import { create } from 'zustand';

export interface SyncConfigState {
  serverUrl: string | null;
  lastSyncAt: string | null;
  lastPushAt: string | null;
  isSyncing: boolean;
  setServerUrl: (url: string | null) => void;
  setSyncStatus: (status: { lastSyncAt?: string; lastPushAt?: string }) => void;
  setIsSyncing: (v: boolean) => void;
  reset: () => void;
}

export const useSyncConfigStore = create<SyncConfigState>()((set) => ({
  serverUrl: null,
  lastSyncAt: null,
  lastPushAt: null,
  isSyncing: false,
  setServerUrl: (url) => set({ serverUrl: url }),
  setSyncStatus: (status) =>
    set((s) => ({
      lastSyncAt: status.lastSyncAt ?? s.lastSyncAt,
      lastPushAt: status.lastPushAt ?? s.lastPushAt,
    })),
  setIsSyncing: (v) => set({ isSyncing: v }),
  reset: () =>
    set({
      serverUrl: null,
      lastSyncAt: null,
      lastPushAt: null,
      isSyncing: false,
    }),
}));
