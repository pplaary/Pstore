/**
 * 数据库初始化与迁移模块
 *
 * - 使用 expo-sqlite 的 openDatabaseAsync / execAsync / runAsync
 * - 平台自适应数据库路径
 * - Schema 版本管理（PRAGMA user_version）
 * - FTS5 全文搜索辅助函数（escapeFts5 / fastRefresh）
 */

import * as SQLite from 'expo-sqlite';
import { tokenizeChinese } from './tokenizer';
import type { Product } from './types';
import { performRecovery } from '../services/backup/recovery';

// ==================== 常量 ====================

const DB_NAME = 'pstore.db';
export const CURRENT_SCHEMA_VERSION = 3;

// ==================== 路径 ====================

/**
 * 返回平台自适应的数据库路径。
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
    default:
      // 尝试从 migrations/ 目录动态加载
      await loadMigrationScript(db, version);
      break;
  }
}

async function loadMigrationScript(
  db: SQLite.SQLiteDatabase,
  version: number,
): Promise<void> {
  try {
    // 动态导入迁移脚本：src/db/migrations/v{version}.ts
    const mod = await import(`./migrations/v${version}`);
    const fn = (mod as { migrate?: unknown }).migrate;
    if (typeof fn === 'function') {
      await fn(db);
    } else {
      throw new Error(`Migration v${version} 未导出 migrate 函数`);
    }
  } catch (err) {
    throw new Error(
      `Schema 迁移 v${version} 失败: ${err instanceof Error ? err.message : String(err)}`,
    );
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

// ==================== FTS5 搜索辅助 ====================

/**
 * 对 FTS5 查询词做转义处理。
 *
 * 策略：所有 token 均用双引号包裹（比按需包裹更安全，无需逐 token 检测保留字符）。
 * 流程：
 * 1. 先用 tokenizeChinese 将输入拆分为 token
 * 2. 每个 token 用一对双引号包裹
 * 3. 多 token 时末尾追加 `*`（FTS5 前缀通配符），放在引号外右侧；单 token 不加
 * 4. 多 token 结果用外括号包裹以实现 FTS5 AND 语义
 * 5. 若输入已含 `*`，保留原样不重复追加
 *
 * 确定性示例：
 *   escapeFts5('(550ml)')   → '"(550ml)"'
 *   escapeFts5('可乐')      → '("可" "乐"*)'
 *   escapeFts5('可乐*')     → '("可" "乐"*)'
 *   escapeFts5('')          → ''
 */
export function escapeFts5(query: string): string {
  const tokens = tokenizeChinese(query);
  if (tokens.length === 0) return '';

  const quoted = tokens
    .map((token, i) => {
      // 检查是否已有末尾通配符
      let core = token;
      let hasWildcard = false;
      if (token.endsWith('*')) {
        core = token.slice(0, -1);
        hasWildcard = true;
      }

      // 空 token 跳过（空格等）
      if (core.length === 0) return '';

      // 所有非空 token 均用双引号包裹
      if (hasWildcard) {
        return `"${core}"*`;
      }
      return `"${core}"`;
    })
    .filter(Boolean);

  if (quoted.length === 0) return '';

  // 多 token：末尾追加 * 并用外括号包裹实现 AND 语义
  if (quoted.length > 1) {
    quoted[quoted.length - 1] = quoted[quoted.length - 1].replace(/"$/, '"*');
    return `(${quoted.join(' ')})`;
  }

  // 单 token：直接返回，不加 *
  return quoted[0];
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
