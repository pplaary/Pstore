/**
 * Zustand store — 同步配置状态
 *
 * 持久化到 AsyncStorage（persist middleware）。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

export const useSyncConfigStore = create<SyncConfigState>()(
  persist(
    (set) => ({
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
    }),
    {
      name: 'sync-config',
    },
  ),
);
