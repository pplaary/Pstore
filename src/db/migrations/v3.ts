/**
 * Schema 迁移 v2 → v3
 *
 * 确保 product 表有 updatedAt 列（N1 同步引擎依赖）。
 * V1 已包含该列，此处为升级路径兼容（旧版可能缺失）。
 */

import type { SQLiteDatabase } from 'expo-sqlite';

export async function migrate(db: SQLiteDatabase): Promise<void> {
  // 检查列是否存在（V1 Schema 已含此列，避免重复添加报错）
  const cols = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info('product')",
  );
  const hasUpdatedAt = cols.some((c) => c.name === 'updatedAt');

  if (!hasUpdatedAt) {
    await db.execAsync(
      'ALTER TABLE product ADD COLUMN updatedAt TEXT',
    );
  }

  await db.execAsync(
    "UPDATE product SET updatedAt = createdAt WHERE updatedAt IS NULL",
  );
}
