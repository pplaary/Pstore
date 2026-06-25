/**
 * 备份文件完整性校验
 *
 * 对备份 SQLite 文件执行多层次校验：
 * 1. PRAGMA integrity_check — 数据库文件结构完整性
 * 2. 核心表存在性检查 — product / price_history / pending_items 三张表
 * 3. product 表行数检查 — 空库备份拒绝
 *
 * 遵循 spec-v4.5 §10.3 恢复流程中的校验步骤。
 */

import * as SQLite from 'expo-sqlite';

const REQUIRED_TABLES = ['product', 'price_history', 'pending_items'] as const;

/**
 * 校验备份文件完整性。
 *
 * @param filePath 待校验的 SQLite 数据库文件绝对路径
 * @returns ok=false 表示备份无效，不应使用
 */
export interface BackupValidationError {
  code: 'FILE_CORRUPTED' | 'MISSING_TABLE' | 'EMPTY_DB' | 'UNKNOWN';
  message: string;
  details?: string;
}

export async function validateBackup(
  filePath: string,
): Promise<{
  ok: boolean;
  error?: BackupValidationError;
  tableCount?: number;
  productCount?: number;
}> {
  let db: SQLite.SQLiteDatabase | null = null;

  try {
    // 1. 打开数据库文件
    db = await SQLite.openDatabaseAsync(filePath);

    // 2. PRAGMA integrity_check — 必须返回 "ok"
    // P1-6: 错误信息不暴露原始路径，避免信息泄露
    const integrityRow = await db.getFirstAsync<{ integrity_check: string }>(
      'PRAGMA integrity_check',
    );
    if (!integrityRow || integrityRow.integrity_check !== 'ok') {
      return {
        ok: false,
        error: {
          code: 'FILE_CORRUPTED' as const,
          message: '数据库文件已损坏，无法使用此备份',
          details: integrityRow?.integrity_check ?? '未知错误',
        },
      };
    }

    // 3. 检查核心表是否存在
    const tableRows = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('product','price_history','pending_items')",
    );
    const existingTables = new Set(tableRows.map((r) => r.name));

    for (const required of REQUIRED_TABLES) {
      if (!existingTables.has(required)) {
        return {
          ok: false,
          error: {
            code: 'MISSING_TABLE' as const,
            message: `缺少核心表: ${required}`,
          },
        };
      }
    }

    const tableCount = existingTables.size;

    // 4. 检查 product 表行数（> 0 才算有效备份）
    // P1-5: COUNT 必须过滤 isDeleted = 0
    const countRow = await db.getFirstAsync<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM product WHERE isDeleted = 0',
    );
    const productCount = countRow?.cnt ?? 0;

    if (productCount === 0) {
      return {
        ok: false,
        error: {
          code: 'EMPTY_DB' as const,
          message: '备份为空库（product 表无数据）',
        },
        tableCount,
        productCount: 0,
      };
    }

    // 5. 校验通过
    return { ok: true, tableCount, productCount };
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'UNKNOWN' as const,
        message: e instanceof Error ? e.message : String(e),
      },
    };
  } finally {
    // 关闭连接
    if (db) {
      try {
        await db.closeAsync();
      } catch {
        // 静默忽略关闭错误
      }
    }
  }
}
