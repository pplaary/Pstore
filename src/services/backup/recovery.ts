/**
 * 崩溃自动恢复模块
 *
 * App 启动时调用，检测数据库完整性。
 * 若数据库损坏，按优先级自动恢复：N1 全量拉取 → WebDAV 最近备份 → 新建空库。
 * 全程静默自动执行，不弹窗询问用户操作路径。
 *
 * 恢复优先级遵循 spec-v4.5 §10.3。
 */

import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { getDatabasePath, openAndMigrate } from '../../db/init';
import { performSync } from '../sync';
import { useSyncConfigStore } from '../../store/syncConfig';
import { restoreFromWebDAV } from './restore';

export interface RecoveryResult {
  recovered: boolean;
  source: 'N1' | 'WEBDAV' | 'empty' | 'none';
  message: string;
}

/**
 * App 启动时执行崩溃恢复。
 *
 * @param n1Available N1 服务是否可达（调用方负责检测）
 */
export async function performRecovery(
  n1Available: boolean,
): Promise<RecoveryResult> {
  let checkDb: SQLite.SQLiteDatabase | null = null;

  try {
    const dbPath = getDatabasePath();
    const fullDbPath = `${FileSystem.documentDirectory}SQLite/${dbPath}`;

    // 1. 尝试打开数据库并执行完整性校验
    try {
      checkDb = await SQLite.openDatabaseAsync(dbPath);
      const integrityRow = await checkDb.getFirstAsync<{
        integrity_check: string;
      }>('PRAGMA integrity_check');
      const isIntegrityOk =
        integrityRow && integrityRow.integrity_check === 'ok';

      if (isIntegrityOk) {
        // 数据库完好，无需恢复
        return { recovered: false, source: 'none', message: '' };
      }
    } catch {
      // 打开失败也视为完整性校验失败
    }

    // 2. 数据库损坏 — 关闭连接
    if (checkDb) {
      try {
        await checkDb.closeAsync();
      } catch { /* ignore */ }
      checkDb = null;
    }

    // 3. 按优先级恢复
    // 路径 A：N1 全量拉取恢复
    if (n1Available) {
      return await recoverFromN1(fullDbPath);
    }

    // 路径 B：从 WebDAV 最近备份恢复
    return await recoverFromWebDAV(fullDbPath);
  } finally {
    if (checkDb) {
      try {
        await checkDb.closeAsync();
      } catch { /* ignore */ }
    }
  }
}

/**
 * 路径 A：删除损坏 DB → 重建空库 → N1 全量拉取。
 */
async function recoverFromN1(fullDbPath: string): Promise<RecoveryResult> {
  try {
    // 删除损坏的数据库文件
    try {
      await FileSystem.deleteAsync(fullDbPath, { idempotent: true });
    } catch {
      // 删除失败也继续（可能文件已不存在）
    }

    // 重建空库
    const db = await openAndMigrate();

    try {
      // N1 全量拉取
      const store = useSyncConfigStore.getState();
      const serverUrl = store.serverUrl;

      if (!serverUrl) {
        return {
          recovered: true,
          source: 'empty',
          message: 'N1 服务未配置，已创建空数据库',
        };
      }

      const result = await performSync(db, store, serverUrl);

      return {
        recovered: true,
        source: 'N1',
        message: `数据已从云端恢复（同步 ${result.synced} 件商品）`,
      };
    } catch {
      // N1 拉取失败，退回空库
      return {
        recovered: true,
        source: 'empty',
        message: '云端恢复失败，已创建空数据库',
      };
    }
  } catch {
    return {
      recovered: true,
      source: 'empty',
      message: '数据已损坏，已创建空数据库',
    };
  }
}

/**
 * 路径 B：删除损坏 DB → 从 WebDAV 最近备份恢复。
 * WebDAV 不可用或恢复失败 → 新建空库。
 */
async function recoverFromWebDAV(fullDbPath: string): Promise<RecoveryResult> {
  try {
    // 先删除损坏的数据库文件
    try {
      await FileSystem.deleteAsync(fullDbPath, { idempotent: true });
    } catch { /* ignore */ }

    // 尝试从 WebDAV 恢复
    const result = await restoreFromWebDAV();

    if (result.ok) {
      return {
        recovered: true,
        source: 'WEBDAV',
        message: `数据已从 WebDAV 备份恢复（共 ${result.productCount ?? 0} 件商品）`,
      };
    }

    // WebDAV 恢复失败，新建空库
    await openAndMigrate();
    return {
      recovered: true,
      source: 'empty',
      message: '数据已损坏，已创建空数据库',
    };
  } catch {
    // 最终兜底：新建空库
    try {
      await openAndMigrate();
    } catch { /* ignore */ }

    return {
      recovered: true,
      source: 'empty',
      message: '数据已损坏，已创建空数据库',
    };
  }
}
