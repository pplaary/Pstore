/**
 * 备份恢复流程
 *
 * 支持从 WebDAV 远程恢复和从本地快照文件恢复两种路径。
 * 恢复前必须通过 validateBackup 校验备份文件完整性。
 *
 * 注意：恢复前用户确认由 UI 层负责，引擎层不做二次确认。
 */

import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { downloadBackup, listBackups } from '../webdav';
import { validateBackup } from './validate';
import { getDatabasePath } from '../../db/init';

export interface RestoreResult {
  ok: boolean;
  sourceFileName?: string;
  productCount?: number;
  error?: string;
}

/**
 * 从 WebDAV 恢复备份。
 *
 * 流程：
 * 1. 若不指定 remoteFileName，列出所有备份并取最近一份
 * 2. 下载到本地临时目录
 * 3. 校验备份完整性
 * 4. 校验通过 → 关闭当前数据库 → 覆盖本地数据库文件
 * 5. 清理临时下载文件
 *
 * @param remoteFileName 可选，指定要恢复的远程文件名；不传则取最近备份
 * @param db            可选，当前打开的数据库实例（关闭后由调用方重新打开）
 */
export async function restoreFromWebDAV(
  remoteFileName?: string,
  db?: SQLite.SQLiteDatabase | null,
): Promise<RestoreResult> {
  let downloadedPath: string | undefined;

  try {
    // 1. 确定要恢复的文件
    let targetFile = remoteFileName;

    if (!targetFile) {
      const backups = await listBackups();
      if (backups.length === 0) {
        return { ok: false, error: 'WebDAV 上无可用备份' };
      }
      targetFile = backups[0].name; // 按时间降序，第一项即最近备份
    }

    // 2. 下载到本地临时目录
    const download = await downloadBackup(targetFile);
    if (!download.ok || !download.localPath) {
      return {
        ok: false,
        error: download.error ?? '备份下载失败',
      };
    }
    downloadedPath = download.localPath;

    // 3. 校验完整性
    const validation = await validateBackup(downloadedPath);
    if (!validation.ok) {
      // 校验失败，删除临时文件
      try {
        await FileSystem.deleteAsync(downloadedPath, { idempotent: true });
      } catch { /* ignore */ }
      return {
        ok: false,
        error: validation.error ?? '备份校验失败',
      };
    }

    // 4. 关闭当前数据库连接
    if (db) {
      try {
        await db.closeAsync();
      } catch {
        // 即使关闭失败也继续覆盖
        console.warn('关闭当前数据库连接失败，继续覆盖');
      }
    }

    // 5. 覆盖本地数据库文件
    const dbPath = getDatabasePath();
    const fullDbPath = `${FileSystem.documentDirectory}SQLite/${dbPath}`;
    await FileSystem.copyAsync({
      from: downloadedPath,
      to: fullDbPath,
    });

    // 6. 清理临时下载文件
    try {
      await FileSystem.deleteAsync(downloadedPath, { idempotent: true });
    } catch { /* ignore */ }

    return {
      ok: true,
      sourceFileName: targetFile,
      productCount: validation.productCount,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * 从本地快照文件恢复（崩溃恢复场景）。
 *
 * 流程：
 * 1. 校验快照文件完整性
 * 2. 关闭当前数据库连接
 * 3. 用快照覆盖本地数据库文件
 *
 * @param filePath 本地快照文件绝对路径
 * @param db       可选，当前打开的数据库实例
 */
export async function restoreFromLocal(
  filePath: string,
  db?: SQLite.SQLiteDatabase | null,
): Promise<RestoreResult> {
  try {
    // 1. 校验完整性
    const validation = await validateBackup(filePath);
    if (!validation.ok) {
      return {
        ok: false,
        error: validation.error ?? '本地快照校验失败',
      };
    }

    // 2. 关闭当前数据库连接
    if (db) {
      try {
        await db.closeAsync();
      } catch {
        console.warn('关闭当前数据库连接失败，继续覆盖');
      }
    }

    // 3. 覆盖本地数据库文件
    const dbPath = getDatabasePath();
    const fullDbPath = `${FileSystem.documentDirectory}SQLite/${dbPath}`;
    await FileSystem.copyAsync({
      from: filePath,
      to: fullDbPath,
    });

    return {
      ok: true,
      sourceFileName: filePath,
      productCount: validation.productCount,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
