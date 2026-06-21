/**
 * Schema 迁移 v1 → v2
 *
 * 为 pending_items 表添加扫描索引。
 */

import type { SQLiteDatabase } from 'expo-sqlite';

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_pending_barcode ON pending_items(barcode);
    CREATE INDEX IF NOT EXISTS idx_pending_scanned ON pending_items(scannedAt);
  `);
}
