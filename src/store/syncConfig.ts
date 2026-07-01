/**
 * 同步配置 Zustand Store
 *
 * 持久化到 SecureStore（serverUrl 在重启后保留）。
 * 与 N1 服务器配对使用，支持同步/推送操作。
 */

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const SYNC_CONFIG_KEY = 'pstore_sync_config';

export interface SyncConfigState {
  serverUrl: string | null;
  lastSyncAt: string | null;
  lastPushAt: string | null;
  isSyncing: boolean;
  /** 是否已完成持久化加载 */
  loaded: boolean;
  setServerUrl: (url: string | null) => void;
  setSyncStatus: (status: { lastSyncAt?: string; lastPushAt?: string }) => void;
  setIsSyncing: (v: boolean) => void;
  reset: () => Promise<void>;
  /** 从 SecureStore 加载持久化的配置 */
  load: () => Promise<void>;
}

export const useSyncConfigStore = create<SyncConfigState>()((set, get) => ({
  serverUrl: null,
  lastSyncAt: null,
  lastPushAt: null,
  isSyncing: false,
  loaded: false,

  setServerUrl: async (url) => {
    set({ serverUrl: url });
    try {
      if (url) {
        const existing = await SecureStore.getItemAsync(SYNC_CONFIG_KEY);
        const data = existing ? JSON.parse(existing) : {};
        data.serverUrl = url;
        await SecureStore.setItemAsync(SYNC_CONFIG_KEY, JSON.stringify(data));
      } else {
        await SecureStore.deleteItemAsync(SYNC_CONFIG_KEY);
      }
    } catch {
      // ignore storage errors
    }
  },

  setSyncStatus: (status) =>
    set((s) => ({
      lastSyncAt: status.lastSyncAt ?? s.lastSyncAt,
      lastPushAt: status.lastPushAt ?? s.lastPushAt,
    })),

  setIsSyncing: (v) => set({ isSyncing: v }),

  reset: async () => {
    set({
      serverUrl: null,
      lastSyncAt: null,
      lastPushAt: null,
      isSyncing: false,
    });
    await SecureStore.deleteItemAsync(SYNC_CONFIG_KEY).catch(() => {});
  },

  load: async () => {
    try {
      const raw = await SecureStore.getItemAsync(SYNC_CONFIG_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.serverUrl) {
          set({ serverUrl: data.serverUrl, loaded: true });
          return;
        }
      }
    } catch {
      // ignore
    }
    set({ loaded: true });
  },
}));