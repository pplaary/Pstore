import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('expo-file-system', () => ({
  copyAsync: vi.fn().mockResolvedValue(undefined),
  deleteAsync: vi.fn().mockResolvedValue(undefined),
  getInfoAsync: vi.fn().mockResolvedValue({ exists: true, size: 4096 }),
  documentDirectory: 'file:///documents/',
  cacheDirectory: 'file:///cache/',
}));

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn().mockResolvedValue({
    execAsync: vi.fn().mockResolvedValue(undefined),
    closeAsync: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../services/webdav', () => ({
  downloadBackup: vi.fn().mockResolvedValue({ ok: true, localPath: 'file:///c/b.db' }),
  listBackups: vi.fn().mockResolvedValue([{ name: 'backup.db' }]),
}));

vi.mock('../services/backup/validate', () => ({
  validateBackup: vi.fn().mockResolvedValue({ ok: true, productCount: 5, tableCount: 3 }),
}));

vi.mock('../services/credential', () => ({
  getWebDAVCredentials: vi.fn().mockResolvedValue({
    url: 'https://webdav.example.com',
    username: 'user',
    password: 'pass',
  }),
}));

vi.mock('../db/init', () => ({
  getDatabasePath: () => 'pstore.db',
  getDatabaseFilePath: () => 'file:///documents/SQLite/pstore.db',
}));

vi.mock('../utils/toast', () => ({
  showToast: vi.fn(),
}));

import { restoreFromWebDAV, restoreFromLocal } from '../services/backup/restore';
import { getWebDAVCredentials } from '../services/credential';
import { validateBackup } from '../services/backup/validate';

describe('restoreFromWebDAV', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy-path: 完整恢复流程返回 ok=true', async () => {
    const result = await restoreFromWebDAV();
    expect(result.ok).toBe(true);
  });

  it('error-path: 凭据缺失时返回 ok=false', async () => {
    vi.mocked(getWebDAVCredentials).mockResolvedValueOnce(null as any);

    const result = await restoreFromWebDAV();
    expect(result.ok).toBe(false);
  });
});

describe('restoreFromLocal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy-path: 本地文件恢复返回 ok=true', async () => {
    const result = await restoreFromLocal('file:///backup.db');
    expect(result.ok).toBe(true);
  });

  it('error-path: 路径为空时返回 ok=false', async () => {
    vi.mocked(validateBackup).mockResolvedValueOnce({ ok: false, error: { code: 'EMPTY_DB' as const, message: 'empty' } });
    const result = await restoreFromLocal('');
    expect(result.ok).toBe(false);
  });
});
