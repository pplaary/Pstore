/**
 * Schema 迁移 v2 → v3
 *
 * 为 products 表增加 updatedAt 列（N1 同步引擎依赖）。
 */

import type { SQLiteDatabase } from 'expo-sqlite';

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    ALTER TABLE products ADD COLUMN updatedAt TEXT;
    UPDATE products SET updatedAt = createdAt WHERE updatedAt IS NULL;
  `);
}
