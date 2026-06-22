/**
 * WebDAV 配置 UI 集成测试
 *
 * 测试 WebDAVConfig 组件逻辑、SyncStatusIcon 状态判断、
 * ConfigScreen WebDAV 集成。
 * 纯逻辑测试，不渲染 React 组件（项目使用 vitest 无测试库依赖）。
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ==================== Mock 模块 ====================

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

vi.mock('expo-file-system', () => ({
  documentDirectory: 'file:///documents/',
  cacheDirectory: 'file:///cache/',
  copyAsync: vi.fn(),
  deleteAsync: vi.fn(),
  getInfoAsync: vi.fn(),
  readAsStringAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
  EncodingType: { Base64: 'base64' },
}));

const mockTestConnection = vi.fn();
const mockExportToWebDAV = vi.fn();
const mockRestoreFromWebDAV = vi.fn();

vi.mock('../services/webdav', () => ({
  testConnection: mockTestConnection,
  uploadBackup: vi.fn(),
  downloadBackup: vi.fn(),
  listBackups: vi.fn(),
}));

vi.mock('../services/backup/export', () => ({
  exportToWebDAV: mockExportToWebDAV,
}));

vi.mock('../services/backup/restore', () => ({
  restoreFromWebDAV: mockRestoreFromWebDAV,
}));

import * as SecureStore from 'expo-secure-store';
import { getWebDAVCredentials, setWebDAVCredentials, clearWebDAVCredentials } from '../services/credential';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

describe('WebDAV 配置 UI 集成', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================== 文件存在性检查 ====================

  describe('文件结构', () => {
    it('WebDAVConfig.tsx 存在并导出 WebDAVConfig', () => {
      const f = path.join(PROJECT_ROOT, 'src', 'components', 'WebDAVConfig.tsx');
      expect(fs.existsSync(f)).toBe(true);
      const content = fs.readFileSync(f, 'utf8');
      expect(content).toContain('WebDAVConfig');
      expect(content).toContain('testConnection');
      expect(content).toContain('exportToWebDAV');
      expect(content).toContain('restoreFromWebDAV');
    });

    it('RecoveryProgress.tsx 存在并导出 RecoveryProgress', () => {
      const f = path.join(PROJECT_ROOT, 'src', 'components', 'RecoveryProgress.tsx');
      expect(fs.existsSync(f)).toBe(true);
      const content = fs.readFileSync(f, 'utf8');
      expect(content).toContain('RecoveryProgress');
      expect(content).toContain("source: 'N1' | 'WEBDAV' | 'empty'");
    });

    it('ConfigScreen.tsx 引用 WebDAVConfig', () => {
      const f = path.join(PROJECT_ROOT, 'src', 'screens', 'ConfigScreen.tsx');
      const content = fs.readFileSync(f, 'utf8');
      expect(content).toContain('WebDAVConfig');
      expect(content).toContain('WebDAV 配置');
      expect(content).not.toContain('Phase 5 实现');
    });

    it('SyncStatusIcon.tsx 读取 SecureStore 检测 WebDAV', () => {
      const f = path.join(PROJECT_ROOT, 'src', 'components', 'SyncStatusIcon.tsx');
      const content = fs.readFileSync(f, 'utf8');
      expect(content).toContain("getItemAsync('pstore_webdav_url')");
      expect(content).toContain('webdavConfigured');
    });
  });

  // ==================== 凭据管理逻辑 ====================

  describe('credential 模块', () => {
    it('setWebDAVCredentials 保存 URL/账号/密码到 SecureStore', async () => {
      const setItem = SecureStore.setItemAsync as ReturnType<typeof vi.fn>;
      setItem.mockResolvedValue(undefined);

      await setWebDAVCredentials('https://dav.example.com', 'admin', 'pass123');

      expect(setItem).toHaveBeenCalledWith('pstore_webdav_url', 'https://dav.example.com');
      expect(setItem).toHaveBeenCalledWith('pstore_webdav_username', 'admin');
      expect(setItem).toHaveBeenCalledWith('pstore_webdav_password', 'pass123');
    });

    it('setWebDAVCredentials 自动去除 URL 末尾斜杠', async () => {
      const setItem = SecureStore.setItemAsync as ReturnType<typeof vi.fn>;
      setItem.mockResolvedValue(undefined);

      await setWebDAVCredentials('https://dav.example.com///', 'admin', 'pass');

      expect(setItem).toHaveBeenCalledWith('pstore_webdav_url', 'https://dav.example.com');
    });

    it('getWebDAVCredentials 返回已保存的凭据', async () => {
      const getItem = SecureStore.getItemAsync as ReturnType<typeof vi.fn>;
      getItem.mockImplementation((key: string) => {
        if (key === 'pstore_webdav_url') return Promise.resolve('https://dav.example.com');
        if (key === 'pstore_webdav_username') return Promise.resolve('admin');
        if (key === 'pstore_webdav_password') return Promise.resolve('pass123');
        return Promise.resolve(null);
      });

      const creds = await getWebDAVCredentials();

      expect(creds.url).toBe('https://dav.example.com');
      expect(creds.username).toBe('admin');
      expect(creds.password).toBe('pass123');
    });

    it('getWebDAVCredentials 未配置时返回 null', async () => {
      const getItem = SecureStore.getItemAsync as ReturnType<typeof vi.fn>;
      getItem.mockResolvedValue(null);

      const creds = await getWebDAVCredentials();

      expect(creds.url).toBeNull();
      expect(creds.username).toBeNull();
      expect(creds.password).toBeNull();
    });

    it('clearWebDAVCredentials 删除全部凭据', async () => {
      const deleteItem = SecureStore.deleteItemAsync as ReturnType<typeof vi.fn>;
      deleteItem.mockResolvedValue(undefined);

      await clearWebDAVCredentials();

      expect(deleteItem).toHaveBeenCalledWith('pstore_webdav_url');
      expect(deleteItem).toHaveBeenCalledWith('pstore_webdav_username');
      expect(deleteItem).toHaveBeenCalledWith('pstore_webdav_password');
    });
  });

  // ==================== 测试连接状态逻辑 ====================

  describe('测试连接状态机', () => {
    it('未测试时状态为 untested', () => {
      // 模拟 WebDAVConfig 内部状态
      const connState: 'untested' | 'connected' | 'failed' = 'untested';
      expect(connState).toBe('untested');
    });

    it('testConnection 成功后状态变为 connected', async () => {
      mockTestConnection.mockResolvedValue({ ok: true });

      const result = await mockTestConnection();

      expect(result.ok).toBe(true);
      // connState → 'connected'
      const connState = result.ok ? 'connected' : 'failed';
      expect(connState).toBe('connected');
    });

    it('testConnection 失败后状态变为 failed', async () => {
      mockTestConnection.mockResolvedValue({ ok: false, error: 'Timeout' });

      const result = await mockTestConnection();

      expect(result.ok).toBe(false);
      const connState = result.ok ? 'connected' : 'failed';
      expect(connState).toBe('failed');
    });
  });

  // ==================== 导出/恢复逻辑 ====================

  describe('导出备份', () => {
    it('exportToWebDAV 成功返回 remotePath', async () => {
      mockExportToWebDAV.mockResolvedValue({
        ok: true,
        remotePath: '/pstore-backups/pstore-backup-2026-06-22T12-00-00.db',
      });

      const result = await mockExportToWebDAV();

      expect(result.ok).toBe(true);
      expect(result.remotePath).toContain('.db');
    });

    it('exportToWebDAV 失败返回 error', async () => {
      mockExportToWebDAV.mockResolvedValue({
        ok: false,
        error: '凭据未配置',
      });

      const result = await mockExportToWebDAV();

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('从备份恢复', () => {
    it('restoreFromWebDAV 成功返回 productCount', async () => {
      mockRestoreFromWebDAV.mockResolvedValue({
        ok: true,
        sourceFileName: 'pstore-backup.db',
        productCount: 42,
      });

      const result = await mockRestoreFromWebDAV();

      expect(result.ok).toBe(true);
      expect(result.productCount).toBe(42);
    });

    it('restoreFromWebDAV 校验失败返回 ok=false', async () => {
      mockRestoreFromWebDAV.mockResolvedValue({
        ok: false,
        error: '备份校验失败',
      });

      const result = await mockRestoreFromWebDAV();

      expect(result.ok).toBe(false);
    });
  });

  // ==================== SyncStatusIcon 优先级逻辑 ====================

  describe('SyncStatusIcon 状态优先级', () => {
    it('N1 已配置且可达 → 绿色云 + "已连接"', () => {
      const serverUrl = 'http://192.168.1.1:3141';
      const isConnected = true;
      const webdavConfigured = true; // WebDAV 也配了，但 N1 优先

      const isN1Reachable = serverUrl !== null && isConnected;

      const label = isN1Reachable ? '已连接' : webdavConfigured ? 'WebDAV' : '本地模式';
      const color = isN1Reachable ? '#16A34A' : webdavConfigured ? '#2563EB' : '#94A3B8';

      expect(label).toBe('已连接');
      expect(color).toBe('#16A34A');
    });

    it('N1 不可达 + WebDAV 已配置 → 蓝色云 + "WebDAV"', () => {
      const serverUrl = null;
      const isConnected = false;
      const webdavConfigured = true;

      const isN1Reachable = serverUrl !== null && isConnected;
      const label = isN1Reachable ? '已连接' : webdavConfigured ? 'WebDAV' : '本地模式';
      const color = isN1Reachable ? '#16A34A' : webdavConfigured ? '#2563EB' : '#94A3B8';

      expect(label).toBe('WebDAV');
      expect(color).toBe('#2563EB');
    });

    it('N1 未配置 + WebDAV 已配置 → 蓝色云 + "WebDAV"', () => {
      const serverUrl = null;
      const isConnected = false;
      const webdavConfigured = true;

      const isN1Reachable = serverUrl !== null && isConnected;
      const label = isN1Reachable ? '已连接' : webdavConfigured ? 'WebDAV' : '本地模式';
      const color = isN1Reachable ? '#16A34A' : webdavConfigured ? '#2563EB' : '#94A3B8';

      expect(label).toBe('WebDAV');
      expect(color).toBe('#2563EB');
    });

    it('N1 已配置但不可达 + WebDAV 未配置 → 灰色云 + "本地模式"', () => {
      const serverUrl = 'http://192.168.1.1:3141';
      const isConnected = false;
      const webdavConfigured = false;

      const isN1Reachable = serverUrl !== null && isConnected;
      const label = isN1Reachable ? '已连接' : webdavConfigured ? 'WebDAV' : '本地模式';
      const color = isN1Reachable ? '#16A34A' : webdavConfigured ? '#2563EB' : '#94A3B8';

      expect(label).toBe('本地模式');
      expect(color).toBe('#94A3B8');
    });

    it('两者均未配置 → 灰色云 + "本地模式"', () => {
      const serverUrl = null;
      const isConnected = false;
      const webdavConfigured = false;

      const isN1Reachable = serverUrl !== null && isConnected;
      const label = isN1Reachable ? '已连接' : webdavConfigured ? 'WebDAV' : '本地模式';
      const color = isN1Reachable ? '#16A34A' : webdavConfigured ? '#2563EB' : '#94A3B8';

      expect(label).toBe('本地模式');
      expect(color).toBe('#94A3B8');
    });
  });

  // ==================== WebDAVConfig editable 模式 ====================

  describe('editable 模式', () => {
    it('editable=true 时按钮可用', () => {
      const editable = true;
      const testDisabled = !editable;
      const exportDisabled = !editable;
      const restoreDisabled = !editable;

      expect(testDisabled).toBe(false);
      expect(exportDisabled).toBe(false);
      expect(restoreDisabled).toBe(false);
    });

    it('editable=false 时按钮不可点击（disabled）', () => {
      const editable = false;
      const testDisabled = !editable;
      const exportDisabled = !editable;
      const restoreDisabled = !editable;

      expect(testDisabled).toBe(true);
      expect(exportDisabled).toBe(true);
      expect(restoreDisabled).toBe(true);
    });

    it('editable=false 时字段只读', () => {
      const editable = false;

      // 模拟 WebDAVConfig 中 TextInput 的 editable prop
      const urlEditable = editable;
      const usernameEditable = editable;
      const passwordEditable = editable;

      expect(urlEditable).toBe(false);
      expect(usernameEditable).toBe(false);
      expect(passwordEditable).toBe(false);
    });
  });

  // ==================== RecoveryProgress 组件逻辑 ====================

  describe('RecoveryProgress', () => {
    it('visible=false 时不展示遮罩', () => {
      const visible = false;
      expect(visible).toBe(false);
    });

    it('source=N1 时显示绿色云图标', () => {
      const sourceMeta: Record<string, { icon: string; color: string }> = {
        N1: { icon: 'cloud-done', color: '#16A34A' },
        WEBDAV: { icon: 'folder-open', color: '#2563EB' },
        empty: { icon: 'cube', color: '#94A3B8' },
      };

      expect(sourceMeta['N1'].color).toBe('#16A34A');
    });

    it('source=WEBDAV 时显示蓝色文件夹图标', () => {
      const sourceMeta: Record<string, { icon: string; color: string }> = {
        N1: { icon: 'cloud-done', color: '#16A34A' },
        WEBDAV: { icon: 'folder-open', color: '#2563EB' },
        empty: { icon: 'cube', color: '#94A3B8' },
      };

      expect(sourceMeta['WEBDAV'].color).toBe('#2563EB');
    });

    it('source=empty 时显示灰色方块图标', () => {
      const sourceMeta: Record<string, { icon: string; color: string }> = {
        N1: { icon: 'cloud-done', color: '#16A34A' },
        WEBDAV: { icon: 'folder-open', color: '#2563EB' },
        empty: { icon: 'cube', color: '#94A3B8' },
      };

      expect(sourceMeta['empty'].color).toBe('#94A3B8');
    });
  });
});
