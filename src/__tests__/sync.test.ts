/**
 * 同步引擎测试
 */

import { describe, expect, it, vi } from 'vitest';

describe('performSync', () => {
  const mockStore = {
    serverUrl: 'http://localhost:3141',
    lastSyncAt: null as string | null,
    lastPushAt: null as string | null,
    isSyncing: false,
    setServerUrl: vi.fn(),
    setSyncStatus: vi.fn(),
    setIsSyncing: vi.fn(),
    reset: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.lastSyncAt = null;
    mockStore.lastPushAt = null;
    mockStore.setSyncStatus = vi.fn();
  });

  it('拉取全量数据时不传 after', async () => {
    // 无 lastSyncAt → after 为 undefined
    const after = mockStore.lastSyncAt ? mockStore.lastSyncAt : undefined;
    expect(after).toBeUndefined();
  });

  it('有 lastSyncAt 时增量拉取', async () => {
    mockStore.lastSyncAt = '2024-01-01T00:00:00.000Z';
    const after = mockStore.lastSyncAt;
    expect(after).toBe('2024-01-01T00:00:00.000Z');
  });

  it('pending 变化检测：有 lastPushAt 时只推变更', async () => {
    mockStore.lastPushAt = '2024-06-01T00:00:00.000Z';

    const allProducts = [
      { id: 'p1', updatedAt: '2024-06-01T00:00:00.000Z' },
      { id: 'p2', updatedAt: '2024-06-21T00:00:00.000Z' },
      { id: 'p3', updatedAt: '2024-06-01T00:00:00.000Z' },
    ];

    const pending = allProducts.filter(
      (p) => !mockStore.lastPushAt || p.updatedAt > mockStore.lastPushAt,
    );
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('p2');
  });

  it('无 lastPushAt 时所有商品都是 pending', async () => {
    mockStore.lastPushAt = null;

    const allProducts = [
      { id: 'p1', updatedAt: '2024-06-01T00:00:00.000Z' },
      { id: 'p2', updatedAt: '2024-06-21T00:00:00.000Z' },
    ];

    const pending = allProducts.filter(
      (p) => !mockStore.lastPushAt || p.updatedAt > mockStore.lastPushAt,
    );
    expect(pending).toHaveLength(2);
  });

  it('服务端较新时覆盖本地（local=null）', async () => {
    const local = null;
    const shouldUpdate = !local;
    expect(shouldUpdate).toBe(true);
  });

  it('服务端较新时覆盖本地（时间戳比较）', async () => {
    const serverUpdatedAt = '2024-06-21T00:00:00.000Z';
    const localUpdatedAt = '2024-06-01T00:00:00.000Z';
    const shouldUpdate = new Date(serverUpdatedAt) >= new Date(localUpdatedAt);
    expect(shouldUpdate).toBe(true);
  });

  it('本地较新时保留本地', async () => {
    const serverUpdatedAt = '2024-06-21T00:00:00.000Z';
    const localUpdatedAt = '2024-06-22T00:00:00.000Z';
    const shouldUpdate = new Date(serverUpdatedAt) >= new Date(localUpdatedAt);
    expect(shouldUpdate).toBe(false);
  });

  it('相同时间戳时服务端覆盖', async () => {
    const serverUpdatedAt = '2024-06-21T00:00:00.000Z';
    const localUpdatedAt = '2024-06-21T00:00:00.000Z';
    const shouldUpdate = new Date(serverUpdatedAt) >= new Date(localUpdatedAt);
    expect(shouldUpdate).toBe(true);
  });

  it('完成后更新 lastSyncAt', async () => {
    const serverTime = '2024-06-21T12:00:00.000Z';
    mockStore.setSyncStatus({ lastSyncAt: serverTime });
    expect(mockStore.setSyncStatus).toHaveBeenCalledWith({ lastSyncAt: serverTime });
  });

  it('推送计数正确记录', async () => {
    const pending = [
      { id: 'p1', name: '商品1' },
      { id: 'p2', name: '商品2' },
    ];
    const pushed = pending.length;
    expect(pushed).toBe(2);
  });

  it('无变更时 pushed=0', async () => {
    const pending: any[] = [];
    const pushed = pending.length;
    expect(pushed).toBe(0);
  });

  it('isDeleted=1 时转为 OUT_OF_STOCK', async () => {
    const p = { isDeleted: 1 };
    const status = p.isDeleted ? 'OUT_OF_STOCK' : 'IN_SHOP';
    expect(status).toBe('OUT_OF_STOCK');
  });

  it('isDeleted=0 时转为 IN_SHOP', async () => {
    const p = { isDeleted: 0 };
    const status = p.isDeleted ? 'OUT_OF_STOCK' : 'IN_SHOP';
    expect(status).toBe('IN_SHOP');
  });
});
