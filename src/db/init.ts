/**
 * 数据库初始化与迁移模块
 *
 * - 使用 expo-sqlite 的 openDatabaseAsync / execAsync / runAsync
 * - 平台自适应数据库路径
 * - Schema 版本管理（PRAGMA user_version）
 * - FTS5 全文搜索辅助函数（escapeFts5 / fastRefresh）
 */

import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import type { Product } from './types';
import { performRecovery } from '../services/backup/recovery';
import { migrate as v2 } from './migrations/v2';
import { migrate as v3 } from './migrations/v3';
import { migrate as v4 } from './migrations/v4';

// ==================== 常量 ====================

const DB_NAME = 'pstore.db';
export const CURRENT_SCHEMA_VERSION = 4;

// ==================== 路径 ====================

/**
 * 数据库文件物理路径（模块级缓存）。
 * expo-sqlite 在 Android 上将数据库存放在 documentDirectory 下的 SQLite 子目录。
 */
let _dbFilePath: string | null = null;

/**
 * 返回数据库文件的完整物理路径（FileSystem 可用）。
 * 用于 snapshot / restore / recovery 等需要直接操作数据库文件的场景。
 */
export function getDatabaseFilePath(): string {
  if (!_dbFilePath) {
    _dbFilePath = `${FileSystem.documentDirectory}SQLite/${DB_NAME}`;
  }
  return _dbFilePath;
}

/**
 * 返回平台自适应的数据库名称。
 * expo-sqlite 的 openDatabaseAsync 接受数据库名称即可，
 * 内部自动处理 Android/iOS 的默认存储位置。
 */
export function getDatabasePath(): string {
  return DB_NAME;
}

// ==================== 初始化入口 ====================

/**
 * 底层：打开数据库并执行 Schema 迁移（不含崩溃恢复）。
 * 供 recovery 模块内部使用，避免循环依赖。
 */
export async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL');
  await migrate(db, CURRENT_SCHEMA_VERSION);
  return db;
}

/**
 * 打开（或创建）数据库并执行 Schema 迁移。
 * 返回可用于后续操作的 SQLiteDatabase 实例。
 *
 * 启动流程：
 * 1. 崩溃恢复 — 检测数据库完整性，必要时自动修复
 * 2. 打开数据库并启用 WAL 模式
 * 3. 执行 Schema 迁移
 *
 * @param n1Available    N1 服务是否可达（用于崩溃恢复决策）
 * @param onRecoveryMsg  可选，恢复完成后的 Toast 回调
 */
export async function initDatabase(
  n1Available: boolean = false,
  onRecoveryMsg?: (message: string) => void,
): Promise<SQLite.SQLiteDatabase> {
  // Phase 5: 崩溃恢复（在打开数据库前执行，避免文件锁冲突）
  const recoveryResult = await performRecovery(n1Available);
  if (recoveryResult.recovered && onRecoveryMsg) {
    onRecoveryMsg(recoveryResult.message);
  }

  return openAndMigrate();
}

// ==================== 版本管理 ====================

async function getCurrentVersion(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  );
  return row?.user_version ?? 0;
}

async function setVersion(
  db: SQLite.SQLiteDatabase,
  version: number,
): Promise<void> {
  await db.execAsync(`PRAGMA user_version = ${version}`);
}

// ==================== Schema 迁移 ====================

/**
 * 将数据库从当前版本迁移到目标版本。
 * 首次安装时 current=0，执行 v1 建表脚本。
 * 后续升级时按版本号顺序执行 src/db/migrations/v{version}.ts。
 */
export async function migrate(
  db: SQLite.SQLiteDatabase,
  targetVersion: number = CURRENT_SCHEMA_VERSION,
): Promise<void> {
  const current = await getCurrentVersion(db);
  if (current >= targetVersion) return;

  for (let v = current + 1; v <= targetVersion; v++) {
    await runVersionMigration(db, v);
    await setVersion(db, v);
  }
}

async function runVersionMigration(
  db: SQLite.SQLiteDatabase,
  version: number,
): Promise<void> {
  switch (version) {
    case 1:
      await createSchemaV1(db);
      break;
    case 2:
      await v2(db);
      break;
    case 3:
      await v3(db);
      break;
    case 4:
      await v4(db);
      break;
    default:
      throw new Error(`未知的 Schema 版本: ${version}`);
  }
}

// ==================== V1 Schema ====================

async function createSchemaV1(db: SQLite.SQLiteDatabase): Promise<void> {
  // 所有 DDL 使用 execAsync，无用户输入拼接
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS product (
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

    CREATE VIRTUAL TABLE IF NOT EXISTS product_fts USING fts5(
      pinyin,
      searchText,
      content='product',
      content_rowid='rowid'
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id          TEXT PRIMARY KEY,
      productId   TEXT NOT NULL,
      oldPrice    REAL NOT NULL,
      newPrice    REAL NOT NULL,
      changedAt   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (productId) REFERENCES product(id)
    );

    CREATE TABLE IF NOT EXISTS pending_items (
      id          TEXT PRIMARY KEY,
      barcode     TEXT UNIQUE NOT NULL,
      scannedAt   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS loose_goods_labels (
      id          TEXT PRIMARY KEY,
      label       TEXT NOT NULL,
      "order"     INTEGER DEFAULT 0
    );
  `);
}

// ==================== FTS5 索引重建 ====================

/**
 * fastRefresh：DELETE + INSERT 重建 FTS5 全文索引。
 *
 * 用于批量导入或数据修复后重新同步 product_fts 虚拟表。
 * 仅索引 isDeleted=0 的商品。
 *
 * @param db   已打开的 SQLiteDatabase 实例
 * @param products  可选，传入内存中的 Product 数组以直接写入；
 *                  不传则从 product 表 SELECT 读取。
 */
export async function fastRefresh(
  db: SQLite.SQLiteDatabase,
  products?: readonly Product[],
): Promise<void> {
  // 清空 FTS 索引
  await db.runAsync('DELETE FROM product_fts');

  if (products && products.length > 0) {
    for (const p of products) {
      if (p.isDeleted) continue;
      await db.runAsync(
        'INSERT INTO product_fts (rowid, pinyin, searchText) VALUES ((SELECT rowid FROM product WHERE id = ?), ?, ?)',
        p.id,
        p.pinyin,
        p.searchText,
      );
    }
  } else {
    // 从 product 表全量重建
    await db.runAsync(
      `INSERT INTO product_fts (rowid, pinyin, searchText)
       SELECT rowid, pinyin, searchText FROM product WHERE isDeleted = 0`,
    );
  }
}
