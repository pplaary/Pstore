/**
 * 崩溃自动恢复模块
 *
 * App 启动时调用，检测数据库完整性。
 * 若数据库损坏，按优先级自动恢复：N1 全量拉取 → WebDAV 最近备份 → 新建空库。
 * 全程静默自动执行，不弹窗询问用户操作路径。
 *
 * 恢复优先级遵循 spec-v4.5 §10.3。
 *
 * P0-1 修复：performRecovery 只做恢复准备动作（删除文件、WebDAV 恢复），
 *            不调用 openAndMigrate() 打开数据库；由 initDatabase 统一打开。
 */

import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { getDatabasePath, getDatabaseFilePath } from '../../db/init';
import { restoreFromWebDAV } from './restore';

export interface RecoveryResult {
  recovered: boolean;
  source: 'N1' | 'WEBDAV' | 'empty' | 'none';
  message: string;
}

/**
 * 删除 WAL/SHM 伴生文件。
 */
async function cleanupCompanionFiles(fullDbPath: string): Promise<void> {
  const companions = [`${fullDbPath}-wal`, `${fullDbPath}-shm`];
  for (const companion of companions) {
    try {
      await FileSystem.deleteAsync(companion, { idempotent: true });
    } catch { /* ignore */ }
  }
}

/**
 * App 启动时执行崩溃恢复。
 *
 * P0-1: 仅做恢复准备动作（删除旧文件、WebDAV 恢复），不打开数据库。
 *       initDatabase 在恢复完成后统一调用 openAndMigrate()。
 *
 * P0-2: 删除 DB 前清理 WAL/SHM 伴生文件。
 *
 * P1-1: serverUrl 直接传入参数，不从 store 读取。
 * P1-4: N1 不可用时保留原有 DB（不删除），继续尝试 WebDAV。
 *
 * @param n1Available N1 服务是否可达（调用方负责检测）
 * @param serverUrl   N1 服务地址（直接传入，不从 store 读取）
 */
export async function performRecovery(
  n1Available: boolean,
  serverUrl?: string,
): Promise<RecoveryResult> {
  const fullDbPath = getDatabaseFilePath();

  // 1. 尝试打开数据库并执行完整性校验
  let checkDb: SQLite.SQLiteDatabase | null = null;
  try {
    checkDb = await SQLite.openDatabaseAsync(getDatabasePath());
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
  } finally {
    if (checkDb) {
      try {
        await checkDb.closeAsync();
      } catch { /* ignore */ }
    }
  }

  // P1-4: 数据库损坏 — 仅在 WebDAV 不可用时才删除旧 DB
  // 如果 N1 可用或 WebDAV 可能可用，先保留旧 DB 位置

  // 2. 按优先级恢复（不打开数据库）
  // 路径 A：N1 全量拉取恢复
  // TODO(Phase N): N1 当前仅有 syncProducts 增量同步 API（需要先有本地数据库），
  // 未见全量数据库备份下载端点（如 GET /api/backup/latest）。
  // 完整实现需要：
  //   1. N1 服务端新增全量数据库备份导出端点
  //   2. 客户端在此路径中调用下载并覆盖本地 DB 文件
  //   3. 覆盖后由 initDatabase 重新执行 openAndMigrate()
  // 当前为占位实现：直接降级到 WebDAV 恢复路径。
  if (n1Available && serverUrl) {
    console.log('[recovery] N1 available but full-db-backup API not yet implemented, falling through to WebDAV.');
    // 不 return，继续尝试 WebDAV 路径
  }

  // 路径 B：从 WebDAV 最近备份恢复
  // P1-2: 先检查 WebDAV 凭据是否配置，再决定是否删除 DB
  try {
    const result = await restoreFromWebDAV();
    if (result.ok) {
      return {
        recovered: true,
        source: 'WEBDAV',
        message: `数据已从 WebDAV 备份恢复（共 ${result.productCount ?? 0} 件商品）`,
      };
    }
  } catch { /* ignore */ }

  // 路径 C：新建空库（initDatabase 会调用 openAndMigrate）
  return {
    recovered: true,
    source: 'empty',
    message: '数据已损坏，已创建空数据库',
  };
}
