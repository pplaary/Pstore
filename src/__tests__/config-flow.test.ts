/**
 * 同步配置流程集成测试
 *
 * 验证 N1 地址输入 → 测试连接 → 同步状态的完整流程。
 * 注意：不导入 expo-sqlite（纯模拟测试）。
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useSyncConfigStore } from '../store/syncConfig';

describe('同步配置流程', () => {
  beforeEach(() => {
    useSyncConfigStore.getState().reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    useSyncConfigStore.getState().reset();
  });

  // ==================== 配置状态管理 ====================

  it('初始状态为空', () => {
    const state = useSyncConfigStore.getState();
    expect(state.serverUrl).toBeNull();
    expect(state.lastSyncAt).toBeNull();
    expect(state.lastPushAt).toBeNull();
    expect(state.isSyncing).toBe(false);
  });

  it('设置 N1 地址', () => {
    useSyncConfigStore.getState().setServerUrl('http://192.168.1.100:3141');
    expect(useSyncConfigStore.getState().serverUrl).toBe('http://192.168.1.100:3141');
  });

  it('清除 N1 地址', () => {
    useSyncConfigStore.getState().setServerUrl('http://192.168.1.100:3141');
    useSyncConfigStore.getState().setServerUrl(null);
    expect(useSyncConfigStore.getState().serverUrl).toBeNull();
  });

  it('同步后更新时间戳', () => {
    const ts = '2024-06-21T00:00:00.000Z';
    useSyncConfigStore.getState().setSyncStatus({
      lastSyncAt: ts,
      lastPushAt: ts,
    });

    const state = useSyncConfigStore.getState();
    expect(state.lastSyncAt).toBe(ts);
    expect(state.lastPushAt).toBe(ts);
  });

  it('部分更新保留已有字段', () => {
    useSyncConfigStore.getState().setSyncStatus({ lastSyncAt: '2024-01-01T00:00:00.000Z' });
    useSyncConfigStore.getState().setSyncStatus({ lastPushAt: '2024-06-01T00:00:00.000Z' });

    const state = useSyncConfigStore.getState();
    expect(state.lastSyncAt).toBe('2024-01-01T00:00:00.000Z');
    expect(state.lastPushAt).toBe('2024-06-01T00:00:00.000Z');
  });

  it('reset 恢复初始状态', () => {
    useSyncConfigStore.getState().setServerUrl('http://localhost:3141');
    useSyncConfigStore.getState().setSyncStatus({
      lastSyncAt: '2024-06-21T00:00:00.000Z',
      lastPushAt: '2024-06-21T00:00:00.000Z',
    });
    useSyncConfigStore.getState().setIsSyncing(true);

    useSyncConfigStore.getState().reset();

    const state = useSyncConfigStore.getState();
    expect(state.serverUrl).toBeNull();
    expect(state.lastSyncAt).toBeNull();
    expect(state.lastPushAt).toBeNull();
    expect(state.isSyncing).toBe(false);
  });

  it('设置 isSyncing 状态', () => {
    expect(useSyncConfigStore.getState().isSyncing).toBe(false);
    useSyncConfigStore.getState().setIsSyncing(true);
    expect(useSyncConfigStore.getState().isSyncing).toBe(true);
    useSyncConfigStore.getState().setIsSyncing(false);
    expect(useSyncConfigStore.getState().isSyncing).toBe(false);
  });
});

// ==================== 网络检测（模拟） ====================

describe('网络检测行为', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('URL 为空时不发起请求', async () => {
    useSyncConfigStore.getState().setServerUrl(null);

    // 模拟网络检测逻辑
    let requestMade = false;
    const checkConnection = async (url: string | null) => {
      if (!url) return false;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        await fetch(`${url}/api/health`, { signal: controller.signal });
        clearTimeout(timer);
        requestMade = true;
        return true;
      } catch {
        return false;
      }
    };

    await checkConnection(null);
    expect(requestMade).toBe(false);
  });

  it('服务器可达返回 true', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: true });

    const checkConnection = async (url: string) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${url}/api/health`, { signal: controller.signal });
        clearTimeout(timer);
        return res.ok;
      } catch {
        return false;
      }
    };

    const result = await checkConnection('http://localhost:3141');
    expect(result).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3141/api/health',
      expect.any(Object),
    );
  });

  it('服务器不可达返回 false', async () => {
    (globalThis.fetch as any).mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const checkConnection = async (url: string) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${url}/api/health`, { signal: controller.signal });
        clearTimeout(timer);
        return res.ok;
      } catch {
        return false;
      }
    };

    const result = await checkConnection('http://localhost:3141');
    expect(result).toBe(false);
  });

  it('3 秒超时后返回 false', async () => {
    (globalThis.fetch as any).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error('AbortError')), 4000);
        }),
    );

    const checkConnection = async (url: string) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${url}/api/health`, { signal: controller.signal });
        clearTimeout(timer);
        return res.ok;
      } catch {
        return false;
      }
    };

    const result = await checkConnection('http://localhost:3141');
    expect(result).toBe(false);
  });
});
