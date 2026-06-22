/**
 * 本地 SQLite 快照导出
 *
 * 将当前 SQLite 数据库完整复制为快照文件，供 WebDAV 上传使用。
 * 导出前执行 WAL checkpoint 确保 WAL 内容写入主文件。
 * 使用 VACUUM INTO 创建独立副本，不依赖数据库文件物理路径。
 */

import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { getDatabasePath } from '../../db/init';

/**
 * 导出当前 SQLite 数据库为快照文件。
 *
 * 流程：
 * 1. 打开数据库执行 PRAGMA wal_checkpoint(TRUNCATE)
 * 2. 使用 VACUUM INTO 创建独立副本（不依赖物理文件路径）
 * 3. 关闭数据库连接
 *
 * @param outputPath 可选，输出路径；默认使用 cacheDirectory + 时间戳命名
 */
export async function exportSnapshot(
  outputPath?: string,
): Promise<{ ok: boolean; snapshotPath?: string; error?: string }> {
  let db: SQLite.SQLiteDatabase | null = null;

  try {
    const dbPath = getDatabasePath();
    const targetPath =
      outputPath ??
      `${FileSystem.cacheDirectory}pstore-snapshot-${Date.now()}.db`;

    // 1. 打开数据库，执行 WAL checkpoint
    db = await SQLite.openDatabaseAsync(dbPath);
    await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');

    // 2. 使用 VACUUM INTO 创建独立副本
    //    VACUUM INTO 直接从 SQLite 内部写入目标文件，
    //    无需知道源数据库的物理文件路径
    await db.execAsync(`VACUUM INTO '${targetPath.replace(/'/g, "''")}'`);

    // 3. 关闭数据库连接
    await db.closeAsync();
    db = null;

    // 验证快照文件存在且非空
    const info = await FileSystem.getInfoAsync(targetPath);
    if (!info.exists || (info as { size: number }).size === 0) {
      return { ok: false, error: '快照文件导出失败（文件为空）' };
    }

    return { ok: true, snapshotPath: targetPath };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    // 确保连接已关闭
    if (db) {
      try {
        await db.closeAsync();
      } catch {
        // 静默忽略关闭错误
      }
    }
  }
}

export { getDatabasePath };
