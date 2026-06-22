/**
 * WebDAV 客户端工厂
 *
 * 基于 webdav npm 包 v5，提供连接测试、备份文件上传/下载、远程文件列表。
 * 定位为手动冷备份，不参与实时 N1 同步。
 *
 * 注意：上传/下载二进制数据库文件使用 Base64 编码传输。
 * 这是 React Native 环境下的实用方案（expo-file-system 仅支持 Base64 编码读写二进制），
 * 代价是传输体积膨胀约 33%。未来可考虑 native module 提供 Buffer 直传。
 */

import { createClient, type WebDAVClient } from 'webdav';
import * as FileSystem from 'expo-file-system';
import { getWebDAVCredentials } from './credential';

const BACKUP_DIR = '/pstore-backups';
const TIMEOUT_MS = 30000;

// ==================== 内部 ====================

/**
 * 从 SecureStore 读取凭据并创建 WebDAV 客户端。
 * 凭据未配置时返回 null。
 */
async function getClient(): Promise<WebDAVClient | null> {
  const creds = await getWebDAVCredentials();
  if (!creds.url || !creds.username || !creds.password) {
    return null;
  }

  return createClient(creds.url, {
    username: creds.username,
    password: creds.password,
  });
}

async function getClientOrThrow(): Promise<WebDAVClient> {
  const client = await getClient();
  if (!client) {
    throw new Error('WebDAV 凭据未配置');
  }
  return client;
}

async function ensureBackupDir(client: WebDAVClient): Promise<void> {
  try {
    const exists = await client.exists(BACKUP_DIR);
    if (!exists) {
      await client.createDirectory(BACKUP_DIR);
    }
  } catch {
    // 目录可能已存在（并发创建场景），忽略
  }
}

/** 包装超时的 Promise */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${label} 超时（${ms}ms）`)), ms),
  );
  return Promise.race([promise, timeout]);
}

// ==================== 公开 API ====================

/**
 * 测试 WebDAV 连接可达性。
 *
 * 流程：
 * 1. 尝试列出根目录内容（验证连接和读权限）
 * 2. 若根目录可读，再尝试验证备份目录是否存在（可选创建以验证写权限）
 */
export async function testConnection(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const client = await getClientOrThrow();

    // 1. 列出根目录内容，验证连接可达性
    await withTimeout(
      client.getDirectoryContents('/'),
      TIMEOUT_MS,
      '连接测试',
    );

    // 2. 验证备份目录（含写权限检查）
    await withTimeout(
      ensureBackupDir(client),
      TIMEOUT_MS,
      '备份目录检查',
    );

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * 上传本地备份文件到 WebDAV。
 *
 * @param localPath      本地 SQLite 快照文件绝对路径
 * @param remoteFileName 远程文件名（如 pstore-backup-2026-06-22T14-30-00.db）
 */
export async function uploadBackup(
  localPath: string,
  remoteFileName: string,
): Promise<{ ok: boolean; remotePath?: string; error?: string }> {
  try {
    const client = await getClientOrThrow();
    await ensureBackupDir(client);

    const remotePath = `${BACKUP_DIR}/${remoteFileName}`;

    // 读取本地文件内容（React Native 仅支持 Base64 编码传输二进制）
    const content = await FileSystem.readAsStringAsync(localPath, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // 上传（webdav v5 的 putFileContents 接受 string | Buffer | Stream）
    await withTimeout(
      client.putFileContents(remotePath, content, {
        contentLength: false,
      }),
      TIMEOUT_MS,
      '上传备份',
    );

    return { ok: true, remotePath };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * 从 WebDAV 下载备份文件到本地临时目录。
 *
 * @param remoteFileName 远程文件名
 */
export async function downloadBackup(
  remoteFileName: string,
): Promise<{ ok: boolean; localPath?: string; error?: string }> {
  try {
    const client = await getClientOrThrow();

    const remotePath = `${BACKUP_DIR}/${remoteFileName}`;
    const localPath = `${FileSystem.cacheDirectory}${remoteFileName}`;

    // 下载文件内容（webdav v5 的 getFileContents 返回 string）
    const content = await withTimeout(
      client.getFileContents(remotePath, { format: 'text' }),
      TIMEOUT_MS,
      '下载备份',
    );

    // 写入本地临时目录
    await FileSystem.writeAsStringAsync(localPath, content as string, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // 验证文件已写入且非空
    const info = await FileSystem.getInfoAsync(localPath);
    if (!info.exists || (info as { size: number }).size === 0) {
      return { ok: false, error: '下载文件为空' };
    }

    return { ok: true, localPath };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * 列出远程备份目录下所有 .db 文件，按最后修改时间倒序排列。
 */
export async function listBackups(): Promise<
  { name: string; size: number; lastModified: string }[]
> {
  try {
    const client = await getClientOrThrow();
    await ensureBackupDir(client);

    const contents = await client.getDirectoryContents(BACKUP_DIR);

    if (!Array.isArray(contents)) {
      return [];
    }

    const backups = contents
      .filter(
        (item): item is { basename: string; size: number; lastmod: string; type: string } =>
          typeof item === 'object' &&
          item.type === 'file' &&
          item.basename != null &&
          item.basename.endsWith('.db'),
      )
      .map((item) => ({
        name: item.basename,
        size: item.size ?? 0,
        lastModified: item.lastmod ?? '',
      }))
      .sort((a, b) => b.lastModified.localeCompare(a.lastModified));

    return backups;
  } catch (e) {
    console.warn('listBackups 失败:', e);
    return [];
  }
}
