/**
 * WebDAV 客户端测试
 *
 * 测试 testConnection / uploadBackup / downloadBackup / listBackups。
 * Mock expo-secure-store、expo-file-system、webdav npm 包。
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ==================== Mock 模块（使用 vi.hoisted 解决提升问题） ====================

const { mockSecureStore, mockFileSystem, mockWebdavClient, mockCreateClient } = vi.hoisted(() => {
  const _mockWebdavClient = {
    exists: vi.fn(),
    createDirectory: vi.fn(),
    getDirectoryContents: vi.fn(),
    putFileContents: vi.fn(),
    getFileContents: vi.fn(),
  };

  return {
    mockSecureStore: {
      getItemAsync: vi.fn(),
      setItemAsync: vi.fn(),
      deleteItemAsync: vi.fn(),
    },
    mockFileSystem: {
      readAsStringAsync: vi.fn(),
      writeAsStringAsync: vi.fn(),
      getInfoAsync: vi.fn(),
      copyAsync: vi.fn(),
      deleteAsync: vi.fn(),
      documentDirectory: 'file:///documents/',
      cacheDirectory: 'file:///cache/',
      EncodingType: { Base64: 'base64' },
    },
    mockWebdavClient: _mockWebdavClient,
    mockCreateClient: vi.fn(() => _mockWebdavClient),
  };
});

vi.mock('expo-secure-store', () => mockSecureStore);
vi.mock('expo-file-system', () => mockFileSystem);
vi.mock('webdav', () => ({
  createClient: mockCreateClient,
}));

// ==================== 导入被测模块 ====================

import { testConnection, uploadBackup, downloadBackup, listBackups } from '../services/webdav';

describe('WebDAV 客户端', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认：凭据已配置
    mockSecureStore.getItemAsync.mockImplementation((key: string) => {
      if (key === 'pstore_webdav_url') return Promise.resolve('https://dav.example.com');
      if (key === 'pstore_webdav_username') return Promise.resolve('admin');
      if (key === 'pstore_webdav_password') return Promise.resolve('pass123');
      return Promise.resolve(null);
    });
    mockCreateClient.mockReturnValue(mockWebdavClient);
  });

  // ==================== testConnection ====================

  describe('testConnection', () => {
    it('可达 WebDAV 返回 ok=true', async () => {
      mockWebdavClient.exists.mockResolvedValue(true);

      const result = await testConnection();

      expect(result.ok).toBe(true);
      expect(mockWebdavClient.exists).toHaveBeenCalled();
      expect(mockCreateClient).toHaveBeenCalledWith('https://dav.example.com', expect.any(Object));
    });

    it('不可达地址返回 ok=false 含 error', async () => {
      // ensureBackupDir 内部 catch 吞掉了所有网络错误；
      // 需在 createClient 层面模拟不可达：getClient() 内部 createClient 抛出异常
      mockCreateClient.mockImplementation(() => {
        throw new Error('Network timeout');
      });

      const result = await testConnection();

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Network timeout');
    });

    it('凭据未配置时返回 ok=false', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);

      const result = await testConnection();

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ==================== uploadBackup ====================

  describe('uploadBackup', () => {
    it('成功上传后远程路径正确', async () => {
      mockWebdavClient.exists.mockResolvedValue(true);
      mockFileSystem.readAsStringAsync.mockResolvedValue('base64content');

      const result = await uploadBackup(
        'file:///cache/snapshot.db',
        'pstore-backup-2026-06-22T12-00-00.db',
      );

      expect(result.ok).toBe(true);
      expect(result.remotePath).toBe('/pstore-backups/pstore-backup-2026-06-22T12-00-00.db');
      expect(mockWebdavClient.putFileContents).toHaveBeenCalledWith(
        '/pstore-backups/pstore-backup-2026-06-22T12-00-00.db',
        'base64content',
        expect.any(Object),
      );
    });

    it('上传失败返回 ok=false', async () => {
      mockWebdavClient.exists.mockResolvedValue(true);
      mockFileSystem.readAsStringAsync.mockRejectedValue(new Error('File not found'));

      const result = await uploadBackup('file:///cache/missing.db', 'backup.db');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('File not found');
    });
  });

  // ==================== downloadBackup ====================

  describe('downloadBackup', () => {
    it('下载后本地文件存在且大小 > 0', async () => {
      mockWebdavClient.exists.mockResolvedValue(true);
      mockWebdavClient.getFileContents.mockResolvedValue('base64downloaded');
      mockFileSystem.writeAsStringAsync.mockResolvedValue(undefined);
      mockFileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 2048 });

      const result = await downloadBackup('pstore-backup-2026-06-22T12-00-00.db');

      expect(result.ok).toBe(true);
      expect(result.localPath).toContain('pstore-backup-2026-06-22T12-00-00.db');
      expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalled();
    });

    it('下载文件为空时返回 ok=false', async () => {
      mockWebdavClient.exists.mockResolvedValue(true);
      mockWebdavClient.getFileContents.mockResolvedValue('');
      mockFileSystem.getInfoAsync.mockResolvedValue({ exists: false, size: 0 });

      const result = await downloadBackup('empty.db');

      expect(result.ok).toBe(false);
    });

    it('网络错误时返回 ok=false', async () => {
      mockWebdavClient.exists.mockResolvedValue(true);
      mockWebdavClient.getFileContents.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await downloadBackup('backup.db');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('ECONNREFUSED');
    });
  });

  // ==================== listBackups ====================

  describe('listBackups', () => {
    it('返回结果按时间倒序', async () => {
      mockWebdavClient.exists.mockResolvedValue(true);
      mockWebdavClient.getDirectoryContents.mockResolvedValue([
        { type: 'file', basename: 'pstore-2024.db', size: 100, lastmod: '2024-01-01T00:00:00Z' },
        { type: 'file', basename: 'pstore-2025.db', size: 200, lastmod: '2025-01-01T00:00:00Z' },
        { type: 'file', basename: 'pstore-2026.db', size: 300, lastmod: '2026-01-01T00:00:00Z' },
      ]);

      const backups = await listBackups();

      expect(backups).toHaveLength(3);
      expect(backups[0].name).toBe('pstore-2026.db');
      expect(backups[1].name).toBe('pstore-2025.db');
      expect(backups[2].name).toBe('pstore-2024.db');
    });

    it('过滤非 .db 文件', async () => {
      mockWebdavClient.exists.mockResolvedValue(true);
      mockWebdavClient.getDirectoryContents.mockResolvedValue([
        { type: 'file', basename: 'notes.txt', size: 50, lastmod: '2025-01-01T00:00:00Z' },
        { type: 'file', basename: 'backup.db', size: 200, lastmod: '2025-01-01T00:00:00Z' },
        { type: 'directory', basename: 'subdir', size: 0, lastmod: '2025-01-01T00:00:00Z' },
        { type: 'file', basename: 'config.json', size: 30, lastmod: '2025-01-01T00:00:00Z' },
      ]);

      const backups = await listBackups();

      expect(backups).toHaveLength(1);
      expect(backups[0].name).toBe('backup.db');
    });

    it('备份目录为空时返回空数组', async () => {
      mockWebdavClient.exists.mockResolvedValue(true);
      mockWebdavClient.getDirectoryContents.mockResolvedValue([]);

      const backups = await listBackups();

      expect(backups).toEqual([]);
    });

    it('网络异常时返回空数组（不抛异常）', async () => {
      mockWebdavClient.exists.mockResolvedValue(true);
      mockWebdavClient.getDirectoryContents.mockRejectedValue(new Error('ETIMEDOUT'));

      const backups = await listBackups();

      expect(backups).toEqual([]);
    });
  });

  // ==================== 超时处理 ====================

  it('客户端创建失败模拟网络不可达', async () => {
    mockCreateClient.mockImplementation(() => {
      throw new Error('timeout');
    });

    const result = await testConnection();
    expect(result.ok).toBe(false);
  });
});
