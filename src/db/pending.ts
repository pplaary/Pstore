/**
 * PendingItem CRUD 模块
 *
 * 操作 pending_items 表，管理扫码识别的未录入条码。
 * 普通模式扫码未知条码时自动创建；管理模式下可查看并转为正式商品。
 */

import * as SQLite from 'expo-sqlite';
import type { PendingItem } from './types';

// ==================== createOrUpdate ====================

/**
 * 创建或更新 PendingItem。
 *
 * 条码已存在时仅更新 scannedAt（INSERT OR REPLACE 语义）。
 * @param db     已打开的数据库实例
 * @param barcode 扫描到的条码
 */
export async function createOrUpdate(
  db: SQLite.SQLiteDatabase,
  barcode: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO pending_items (id, barcode, scannedAt)
     VALUES (?, ?, ?)
     ON CONFLICT(barcode) DO UPDATE SET scannedAt = excluded.scannedAt`,
    crypto.randomUUID(),
    barcode,
    now,
  );
}

// ==================== getAll ====================

/**
 * 获取全部 PendingItem，按 scannedAt 降序。
 */
export async function getAll(db: SQLite.SQLiteDatabase): Promise<PendingItem[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM pending_items ORDER BY scannedAt DESC`,
  );
  return rows.map((row) => ({
    id: row.id as string,
    barcode: row.barcode as string,
    scannedAt: row.scannedAt as string,
  }));
}

// ==================== deleteById ====================

/**
 * 按 ID 删除 PendingItem。
 */
export async function deleteById(
  db: SQLite.SQLiteDatabase,
  id: string,
): Promise<void> {
  await db.runAsync(
    `DELETE FROM pending_items WHERE id = ?`,
    id,
  );
}

// ==================== findByBarcode ====================

/**
 * 按条码查找 PendingItem。
 */
export async function findByBarcode(
  db: SQLite.SQLiteDatabase,
  barcode: string,
): Promise<PendingItem | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM pending_items WHERE barcode = ?`,
    barcode,
  );
  if (!row) return null;
  return {
    id: row.id as string,
    barcode: row.barcode as string,
    scannedAt: row.scannedAt as string,
  };
}

// ==================== convertToProduct ====================

/**
 * 将 PendingItem 转为正式商品的前置操作：
 * 删除 PendingItem 记录，返回条码供 ProductEdit 使用。
 *
 * 转换规则（spec §5.3）：删除原记录，不做自动名称推断。
 */
export async function convertToProduct(
  db: SQLite.SQLiteDatabase,
  id: string,
): Promise<string> {
  // 先获取条码
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT barcode FROM pending_items WHERE id = ?`,
    id,
  );
  if (!row) {
    throw new Error(`convertToProduct: PendingItem 不存在 id=${id}`);
  }
  const barcode = row.barcode as string;

  // 删除记录
  await db.runAsync(
    `DELETE FROM pending_items WHERE id = ?`,
    id,
  );

  return barcode;
}
