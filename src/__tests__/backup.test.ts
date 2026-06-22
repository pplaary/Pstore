/**
 * 备份恢复引擎测试
 *
 * 测试 exportSnapshot / validateBackup / restoreFromWebDAV / performRecovery。
 * Mock expo-file-system、expo-sqlite、webdav、sync 模块。
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ==================== Mock 模块（使用 vi.hoisted 解决提升问题） ====================

const { mockFileSystem, mockSQLite, mockSecureStore, mockSyncStore, mockPerformSync, mockRestoreFromWebDAV } = vi.hoisted(() => {
  const _mockDb = {
    execAsync: vi.fn().mockResolvedValue(undefined),
    getFirstAsync: vi.fn(),
    getAllAsync: vi.fn().mockResolvedValue([]),
    closeAsync: vi.fn().mockResolvedValue(undefined),
    runAsync: vi.fn().mockResolvedValue(undefined),
  };

  return {
    mockFileSystem: {
      copyAsync: vi.fn().mockResolvedValue(undefined),
      deleteAsync: vi.fn().mockResolvedValue(undefined),
      getInfoAsync: vi.fn().mockResolvedValue({ exists: true, size: 4096 }),
      readAsStringAsync: vi.fn(),
      writeAsStringAsync: vi.fn(),
      documentDirectory: 'file:///documents/',
      cacheDirectory: 'file:///cache/',
    },
    mockSQLite: {
      openDatabaseAsync: vi.fn().mockResolvedValue(_mockDb),
      deleteDatabaseAsync: vi.fn().mockResolvedValue(undefined),
    },
    mockSecureStore: {
      getItemAsync: vi.fn(),
      setItemAsync: vi.fn().mockResolvedValue(undefined),
      deleteItemAsync: vi.fn().mockResolvedValue(undefined),
    },
    mockSyncStore: {
      serverUrl: null as string | null,
    },
    mockPerformSync: vi.fn(),
    mockRestoreFromWebDAV: vi.fn(),
  };
});

vi.mock('expo-file-system', () => mockFileSystem);
vi.mock('expo-sqlite', () => mockSQLite);
vi.mock('expo-secure-store', () => mockSecureStore);

vi.mock('../services/sync', () => ({
  performSync: mockPerformSync,
}));

vi.mock('../services/backup/restore', () => ({
  restoreFromWebDAV: mockRestoreFromWebDAV,
  restoreFromLocal: vi.fn(),
}));

// syncConfig store mock
vi.mock('../store/syncConfig', () => ({
  useSyncConfigStore: {
    getState: () => mockSyncStore,
  },
}));

// db/init module  — 模拟实际的 initDatabase 出口
vi.mock('../db/init', () => ({
  getDatabasePath: () => 'pstore.db',
  getDatabaseFilePath: () => 'file:///documents/SQLite/pstore.db',
  openAndMigrate: vi.fn().mockResolvedValue({ execAsync: vi.fn(), closeAsync: vi.fn() }),
}));

// credential mock
vi.mock('../services/credential', () => ({
  getWebDAVCredentials: vi.fn().mockResolvedValue({
    url: null,
    username: null,
    password: null,
  }),
  setWebDAVCredentials: vi.fn(),
  clearWebDAVCredentials: vi.fn(),
}));

// ==================== 导入被测模块 ====================

import { exportSnapshot, getDatabasePath } from '../services/backup/snapshot';
import { validateBackup } from '../services/backup/validate';
import { performRecovery } from '../services/backup/recovery';
import { openAndMigrate } from '../db/init';

describe('备份恢复引擎', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 恢复默认 mock 行为
    mockFileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 4096 });
    mockFileSystem.copyAsync.mockResolvedValue(undefined);
    mockFileSystem.deleteAsync.mockResolvedValue(undefined);
    mockSyncStore.serverUrl = null;
    mockPerformSync.mockReset();
    mockRestoreFromWebDAV.mockReset();
  });

  // ==================== exportSnapshot ====================

  describe('exportSnapshot', () => {
    it('生成的文件存在且大小 > 0', async () => {
      const execAsync = vi.fn().mockResolvedValue(undefined);
      mockSQLite.openDatabaseAsync.mockResolvedValue({
        execAsync,
        closeAsync: vi.fn().mockResolvedValue(undefined),
      });
      mockFileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 8192 });

      const result = await exportSnapshot('file:///cache/test-snapshot.db');

      expect(result.ok).toBe(true);
      expect(result.snapshotPath).toBe('file:///cache/test-snapshot.db');
      expect(execAsync).toHaveBeenCalledWith(expect.stringContaining('VACUUM INTO'));
    });

    it('快照文件为空时返回 ok=false', async () => {
      mockFileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 0 });

      const result = await exportSnapshot();

      expect(result.ok).toBe(false);
      expect(result.error).toContain('文件为空');
    });

    it('WAL checkpoint 在复制前执行', async () => {
      const execSpy = vi.fn().mockResolvedValue(undefined);
      mockSQLite.openDatabaseAsync.mockResolvedValue({
        execAsync: execSpy,
        closeAsync: vi.fn().mockResolvedValue(undefined),
      });

      await exportSnapshot('file:///cache/snapshot.db');

      expect(execSpy).toHaveBeenCalledWith('PRAGMA wal_checkpoint(TRUNCATE)');
    });

    it('文件系统错误时返回 ok=false', async () => {
      mockSQLite.openDatabaseAsync.mockResolvedValue({
        execAsync: vi.fn().mockRejectedValue(new Error('ENOSPC: no space left')),
        closeAsync: vi.fn().mockResolvedValue(undefined),
      });

      const result = await exportSnapshot();

      expect(result.ok).toBe(false);
      expect(result.error).toContain('ENOSPC');
    });
  });

  // ==================== validateBackup ====================

  describe('validateBackup', () => {
    it('有效备份返回 ok=true 含 productCount > 0', async () => {
      mockSQLite.openDatabaseAsync.mockResolvedValue({
        getFirstAsync: vi
          .fn()
          // 第一次调用：integrity_check
          .mockResolvedValueOnce({ integrity_check: 'ok' })
          // 第二次调用：count
          .mockResolvedValueOnce({ cnt: 42 }),
        getAllAsync: vi.fn().mockResolvedValue([
          { name: 'product' },
          { name: 'price_history' },
          { name: 'pending_items' },
        ]),
        closeAsync: vi.fn().mockResolvedValue(undefined),
      });

      const result = await validateBackup('file:///cache/valid.db');

      expect(result.ok).toBe(true);
      expect(result.productCount).toBe(42);
      expect(result.tableCount).toBe(3);
    });

    it('损坏文件 integrity_check 非 ok 返回 ok=false', async () => {
      mockSQLite.openDatabaseAsync.mockResolvedValue({
        getFirstAsync: vi.fn().mockResolvedValue({
          integrity_check: 'row 123 missing from index idx_product_name',
        }),
        closeAsync: vi.fn().mockResolvedValue(undefined),
      });

      const result = await validateBackup('file:///cache/corrupt.db');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('完整性校验失败');
    });

    it('缺少核心表返回 ok=false', async () => {
      mockSQLite.openDatabaseAsync.mockResolvedValue({
        getFirstAsync: vi.fn().mockResolvedValue({ integrity_check: 'ok' }),
        getAllAsync: vi.fn().mockResolvedValue([
          { name: 'product' },
          // 缺少 price_history 和 pending_items
        ]),
        closeAsync: vi.fn().mockResolvedValue(undefined),
      });

      const result = await validateBackup('file:///cache/missing-table.db');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('缺少核心表');
    });

    it('product 表为空（productCount=0）返回 ok=false', async () => {
      mockSQLite.openDatabaseAsync.mockResolvedValue({
        getFirstAsync: vi
          .fn()
          .mockResolvedValueOnce({ integrity_check: 'ok' })
          .mockResolvedValueOnce({ cnt: 0 }),
        getAllAsync: vi.fn().mockResolvedValue([
          { name: 'product' },
          { name: 'price_history' },
          { name: 'pending_items' },
        ]),
        closeAsync: vi.fn().mockResolvedValue(undefined),
      });

      const result = await validateBackup('file:///cache/empty.db');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('空库');
      expect(result.productCount).toBe(0);
    });

    it('文件无法打开时返回 ok=false', async () => {
      mockSQLite.openDatabaseAsync.mockRejectedValue(new Error('SQLITE_CANTOPEN'));

      const result = await validateBackup('file:///cache/bad.db');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('SQLITE_CANTOPEN');
    });
  });

  // ==================== performRecovery ====================

  describe('performRecovery 三路径切换', () => {
    it('数据库完好 → recovered=false, source=none', async () => {
      mockSQLite.openDatabaseAsync.mockResolvedValue({
        getFirstAsync: vi.fn().mockResolvedValue({ integrity_check: 'ok' }),
        closeAsync: vi.fn().mockResolvedValue(undefined),
      });

      const result = await performRecovery(false);

      expect(result.recovered).toBe(false);
      expect(result.source).toBe('none');
    });

    it('数据库损坏 + N1 可用 → 全量拉取恢复', async () => {
      mockSQLite.openDatabaseAsync
        // 第一次：完整性校验
        .mockResolvedValueOnce({
          getFirstAsync: vi.fn().mockResolvedValue({
            integrity_check: 'database disk image is malformed',
          }),
          closeAsync: vi.fn().mockResolvedValue(undefined),
        })
        // 第二次：recoverFromN1 内部 openAndMigrate 建空库
        .mockResolvedValueOnce({
          execAsync: vi.fn().mockResolvedValue(undefined),
          closeAsync: vi.fn().mockResolvedValue(undefined),
          getFirstAsync: vi.fn(),
          getAllAsync: vi.fn(),
          runAsync: vi.fn(),
        });

      mockSyncStore.serverUrl = 'http://192.168.1.100:3141';
      mockPerformSync.mockResolvedValue({ synced: 15, created: 15, updated: 0 });

      const result = await performRecovery(true);

      expect(result.recovered).toBe(true);
      expect(result.source).toBe('N1');
      expect(mockPerformSync).toHaveBeenCalled();
    });

    it('数据库损坏 + N1 不可达 → WebDAV 恢复', async () => {
      mockSQLite.openDatabaseAsync
        .mockResolvedValueOnce({
          getFirstAsync: vi.fn().mockResolvedValue({
            integrity_check: 'database disk image is malformed',
          }),
          closeAsync: vi.fn().mockResolvedValue(undefined),
        });

      mockRestoreFromWebDAV.mockResolvedValue({
        ok: true,
        productCount: 28,
        sourceFileName: 'pstore-backup-2026-06-22T12-00-00.db',
      });

      const result = await performRecovery(false);

      expect(result.recovered).toBe(true);
      expect(result.source).toBe('WEBDAV');
      expect(mockRestoreFromWebDAV).toHaveBeenCalled();
    });

    it('数据库损坏 + 两者均不可用 → 新建空库', async () => {
      mockSQLite.openDatabaseAsync
        // 完整性校验失败
        .mockResolvedValueOnce({
          getFirstAsync: vi.fn().mockResolvedValue({
            integrity_check: 'database disk image is malformed',
          }),
          closeAsync: vi.fn().mockResolvedValue(undefined),
        })
        // recoverFromWebDAV 内部 openAndMigrate 建空库
        .mockResolvedValueOnce({
          execAsync: vi.fn().mockResolvedValue(undefined),
          closeAsync: vi.fn().mockResolvedValue(undefined),
          getFirstAsync: vi.fn(),
          getAllAsync: vi.fn(),
          runAsync: vi.fn(),
        });

      mockRestoreFromWebDAV.mockResolvedValue({
        ok: false,
        error: '无可用备份',
      });

      const result = await performRecovery(false);

      expect(result.recovered).toBe(true);
      expect(result.source).toBe('empty');
      expect(mockRestoreFromWebDAV).toHaveBeenCalled();
    });

    it('N1 可用但拉取失败 → 退回空库', async () => {
      mockSQLite.openDatabaseAsync
        .mockResolvedValueOnce({
          getFirstAsync: vi.fn().mockResolvedValue({
            integrity_check: 'database disk image is malformed',
          }),
          closeAsync: vi.fn().mockResolvedValue(undefined),
        })
        .mockResolvedValueOnce({
          execAsync: vi.fn().mockResolvedValue(undefined),
          closeAsync: vi.fn().mockResolvedValue(undefined),
          getFirstAsync: vi.fn(),
          getAllAsync: vi.fn(),
          runAsync: vi.fn(),
        });

      mockSyncStore.serverUrl = 'http://192.168.1.100:3141';
      mockPerformSync.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await performRecovery(true);

      expect(result.recovered).toBe(true);
      expect(result.source).toBe('empty');
    });
  });

  // ==================== 恢复后行为 ====================

  describe('恢复后数据库行为', () => {
    it('恢复后数据库可正常打开', async () => {
      // 完整性校验：损坏
      mockSQLite.openDatabaseAsync.mockResolvedValueOnce({
        getFirstAsync: vi.fn().mockResolvedValue({
          integrity_check: 'database disk image is malformed',
        }),
        closeAsync: vi.fn().mockResolvedValue(undefined),
      });

      mockSyncStore.serverUrl = 'http://192.168.1.100:3141';
      mockPerformSync.mockResolvedValue({ synced: 10, created: 10, updated: 0 });

      const result = await performRecovery(true);

      expect(result.recovered).toBe(true);
      expect(result.source).toBe('N1');
      expect(openAndMigrate).toHaveBeenCalled();
    });
  });
});
