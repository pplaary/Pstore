/**
 * Schema 迁移 v4 — 增加 ignored_duplicates 表
 *
 * 用于持久化用户标记为"非重复"的商品对，避免重复检测时反复出现。
 */

import type { SQLiteDatabase } from 'expo-sqlite';

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ignored_duplicates (
      id_a TEXT NOT NULL,
      id_b TEXT NOT NULL,
      ignored_at INTEGER NOT NULL,
      PRIMARY KEY (id_a, id_b)
    );
  `);
}
