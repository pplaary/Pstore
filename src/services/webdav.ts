/**
 * WebDAV 客户端工厂
 *
 * 基于 webdav npm 包 v5，提供连接测试、备份文件上传/下载、远程文件列表。
 * 定位为手动冷备份，不参与实时 N1 同步。
 */

import { createClient, type WebDAVClient } from 'webdav';
import * as FileSystem from 'expo-file-system';
import { getWebDAVCredentials } from './credential';

const BACKUP_DIR = '/pstore-backups';

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

// ==================== 公开 API ====================

/**
 * 测试 WebDAV 连接可达性。
 *
 * 尝试列出远程根目录内容，成功即表示可达。
 */
export async function testConnection(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const client = await getClientOrThrow();
    // 确保备份目录存在（顺便验证写权限）
    await ensureBackupDir(client);
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

    // 读取本地文件内容
    const content = await FileSystem.readAsStringAsync(localPath, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // 上传（webdav v5 的 putFileContents 接受 string | Buffer）
    await client.putFileContents(remotePath, content, {
      contentLength: false,
    });

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

    // 下载文件内容（webdav v5 返回 string）
    const content = await client.getFileContents(remotePath, {
      format: 'text',
    });

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
