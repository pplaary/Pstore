/**
 * 数据清除与数据库重置服务
 *
 * - 清空商品（软删除 + FTS 重建）
 * - 清空待扫清单
 * - 完全重置数据库（DROP 全部表 → 重建 V1 Schema）
 */

import * as SQLite from 'expo-sqlite';
import { fastRefresh } from '../../db/init';

// ==================== 类型 ====================

export interface ClearResult {
  ok: boolean;
  message: string;
  affectedRows?: number;
}

// ==================== 清空商品（软删除） ====================

/**
 * 将所有商品软删除并重建 FTS5 索引。
 * 数据仍在数据库中，可通过 WebDAV 备份恢复。
 *
 * @param db  已打开的 SQLite 数据库
 */
export async function clearAllProducts(db: SQLite.SQLiteDatabase): Promise<ClearResult> {
  try {
    // P1-12: 软删除时设置 updatedAt
    const now = new Date().toISOString();
    const result = await db.runAsync(
      'UPDATE product SET isDeleted = 1, updatedAt = ? WHERE isDeleted = 0',
      now,
    );
    const affectedRows = (result as { changes: number }).changes;

    // 重建 FTS 索引（空库，不索引任何商品）
    await fastRefresh(db);

    return {
      ok: true,
      message: `已软删除 ${affectedRows} 个商品`,
      affectedRows,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

// ==================== 清空待扫清单 ====================

/**
 * 清空 pending_items 表（扫码暂存条目）。
 *
 * @param db  已打开的 SQLite 数据库
 */
export async function clearPendingItems(db: SQLite.SQLiteDatabase): Promise<ClearResult> {
  try {
    const result = await db.runAsync('DELETE FROM pending_items');
    const affectedRows = (result as { changes: number }).changes;

    return {
      ok: true,
      message: `已清空 ${affectedRows} 条待扫记录`,
      affectedRows,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

// ==================== 完全重置数据库 ====================

/**
 * 完全重置数据库：删除全部表后按 V1 Schema 重建。
 * 数据不可恢复，建议先导出备份。
 *
 * 步骤：
 * 1. DROP 所有表（含 FTS 虚拟表）
 * 2. 重建 V1 Schema（内联 DDL）
 * 3. 重新设置 user_version = 1
 * 4. 无需 fastRefresh（空库）
 *
 * @param db  已打开的 SQLite 数据库
 */
export async function resetDatabase(db: SQLite.SQLiteDatabase): Promise<ClearResult> {
  try {
    // 1. 删除全部表（顺序无关，IF EXISTS 保护）
    await db.execAsync(`
      DROP TABLE IF EXISTS price_history;
      DROP TABLE IF EXISTS pending_items;
      DROP TABLE IF EXISTS loose_goods_labels;
      DROP TABLE IF EXISTS product;
      DROP TABLE IF EXISTS product_fts;
    `);

    // 2. 重建 V1 Schema（内联 DDL，createSchemaV1 未导出）
    await db.execAsync(`
      CREATE TABLE product (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        aliases     TEXT,
        pinyin      TEXT NOT NULL,
        searchText  TEXT NOT NULL,
        price       REAL NOT NULL,
        spec        TEXT,
        imageUri    TEXT,
        barcode     TEXT UNIQUE,
        category    TEXT,
        status      TEXT DEFAULT 'IN_SHOP',
        isDeleted   INTEGER DEFAULT 0,
        updatedAt   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        createdAt   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE VIRTUAL TABLE product_fts USING fts5(
        pinyin,
        searchText,
        content='product',
        content_rowid='rowid'
      );

      CREATE TABLE price_history (
        id          TEXT PRIMARY KEY,
        productId   TEXT NOT NULL,
        oldPrice    REAL NOT NULL,
        newPrice    REAL NOT NULL,
        changedAt   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (productId) REFERENCES product(id)
      );

      CREATE TABLE pending_items (
        id          TEXT PRIMARY KEY,
        barcode     TEXT UNIQUE NOT NULL,
        scannedAt   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE loose_goods_labels (
        id          TEXT PRIMARY KEY,
        label       TEXT NOT NULL,
        "order"     INTEGER DEFAULT 0
      );
    `);

    // 3. 重置 schema 版本号
    await db.execAsync('PRAGMA user_version = 1');

    return {
      ok: true,
      message: '数据库已重置为全新状态',
      affectedRows: 0,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
