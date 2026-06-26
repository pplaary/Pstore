import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    execAsync: vi.fn().mockResolvedValue(undefined),
    runAsync: vi.fn(),
    closeAsync: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///cache/',
  getInfoAsync: vi.fn().mockResolvedValue({ exists: true, size: 4096 }),
}));

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn().mockResolvedValue(mockDb),
}));

vi.mock('../db/init', () => ({
  getDatabasePath: () => 'pstore.db',
}));

import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { exportSnapshot } from '../services/backup/snapshot';

describe('exportSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.execAsync.mockResolvedValue(undefined);
    mockDb.closeAsync.mockResolvedValue(undefined);
    vi.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, size: 4096 });
  });

  it('happy-path: VACUUM INTO 成功 → 返回 ok=true + snapshotPath', async () => {
    mockDb.runAsync.mockResolvedValue(undefined);

    const result = await exportSnapshot();

    expect(result.ok).toBe(true);
    expect(result.snapshotPath).toContain('pstore-snapshot-');
    expect(result.snapshotPath).toContain('.db');
  });

  it('快照文件为空时返回 ok=false', async () => {
    mockDb.runAsync.mockResolvedValue(undefined);
    vi.mocked(FileSystem.getInfoAsync).mockResolvedValueOnce({ exists: true, size: 0 } as any);

    const result = await exportSnapshot();

    expect(result.ok).toBe(false);
    expect(result.error).toContain('文件为空');
  });

  it('VACUUM INTO 参数化失败时降级到字符串拼接', async () => {
    mockDb.runAsync.mockRejectedValueOnce(new Error('not supported'));
    mockDb.execAsync.mockResolvedValue(undefined);

    const result = await exportSnapshot();

    expect(result.ok).toBe(true);
    expect(mockDb.execAsync).toHaveBeenCalledWith(
      expect.stringContaining("VACUUM INTO '"),
    );
  });

  it('异常捕获返回 ok=false', async () => {
    vi.mocked(SQLite.openDatabaseAsync).mockRejectedValueOnce(new Error('open failed'));

    const result = await exportSnapshot();

    expect(result.ok).toBe(false);
    expect(result.error).toBe('open failed');
  });
});
