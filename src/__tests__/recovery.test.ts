import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockCheckDb } = vi.hoisted(() => ({
  mockCheckDb: {
    getFirstAsync: vi.fn(),
    closeAsync: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('expo-file-system', () => ({
  deleteAsync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn().mockResolvedValue(mockCheckDb),
}));

vi.mock('../db/init', () => ({
  getDatabasePath: () => 'pstore.db',
  getDatabaseFilePath: () => 'file:///documents/SQLite/pstore.db',
}));

vi.mock('../services/backup/restore', () => ({
  restoreFromWebDAV: vi.fn(),
}));

import * as SQLite from 'expo-sqlite';
import { restoreFromWebDAV } from '../services/backup/restore';
import { performRecovery } from '../services/backup/recovery';

describe('performRecovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckDb.closeAsync.mockResolvedValue(undefined);
  });

  it('数据库完好 → recovered=false, source=none', async () => {
    mockCheckDb.getFirstAsync.mockResolvedValueOnce({ integrity_check: 'ok' });

    const result = await performRecovery(false);

    expect(result.recovered).toBe(false);
    expect(result.source).toBe('none');
  });

  it('数据库打开失败 → 走恢复流程', async () => {
    vi.mocked(SQLite.openDatabaseAsync).mockRejectedValueOnce(new Error('open failed'));
    vi.mocked(restoreFromWebDAV).mockResolvedValueOnce({ ok: true, productCount: 3 });

    const result = await performRecovery(false);

    expect(result.recovered).toBe(true);
    expect(result.source).toBe('WEBDAV');
  });

  it('integrity_check 非 ok → 走恢复流程', async () => {
    mockCheckDb.getFirstAsync.mockResolvedValueOnce({ integrity_check: 'corrupt' });
    vi.mocked(restoreFromWebDAV).mockResolvedValueOnce({ ok: true, productCount: 5 });

    const result = await performRecovery(false);

    expect(result.recovered).toBe(true);
    expect(result.source).toBe('WEBDAV');
  });

  it('N1 不可用 + WebDAV 恢复成功 → source=WEBDAV', async () => {
    mockCheckDb.getFirstAsync.mockResolvedValueOnce({ integrity_check: 'corrupt' });
    vi.mocked(restoreFromWebDAV).mockResolvedValueOnce({ ok: true, productCount: 10 });

    const result = await performRecovery(false);

    expect(result.recovered).toBe(true);
    expect(result.source).toBe('WEBDAV');
    expect(result.message).toContain('10');
  });

  it('WebDAV 恢复失败 → source=empty', async () => {
    mockCheckDb.getFirstAsync.mockResolvedValueOnce({ integrity_check: 'corrupt' });
    vi.mocked(restoreFromWebDAV).mockRejectedValueOnce(new Error('download failed'));

    const result = await performRecovery(false);

    expect(result.recovered).toBe(true);
    expect(result.source).toBe('empty');
    expect(result.message).toContain('空数据库');
  });
});
