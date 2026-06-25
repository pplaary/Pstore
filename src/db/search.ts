/**
 * FTS5 搜索与导出模块
 *
 * - 全文搜索基于 product_fts 虚拟表
 * - 所有 SQL 参数化，FTS5 MATCH 查询词通过 escapeFts5 处理
 * - 所有查询默认排除 isDeleted 商品
 */

import type { SQLiteBindValue } from 'expo-sqlite';
import * as SQLite from 'expo-sqlite';
import { escapeFts5 } from './fts5';
import type { Product, ProductStatus } from './types';

// ==================== 类型 ====================

/** 排序方式 */
export type SortBy = 'relevance' | 'priceLow' | 'priceHigh' | 'updatedAt';

/** searchProducts 可选参数 */
export interface SearchOptions {
  /** 按状态过滤 */
  status?: ProductStatus;
  /** 按分类过滤 */
  category?: string;
  /** 排序方式，默认 'relevance'（FTS5 bm25） */
  sortBy?: SortBy;
  /** 返回数量上限，默认不限制 */
  limit?: number;
  /** 是否包含已删除商品，默认 false */
  includeDeleted?: boolean;
}

// ==================== 辅助函数 ====================

/**
 * 将数据库行映射为 Product 对象。
 */
function mapRow(row: Record<string, unknown>): Product {
  return {
    id: row.id as string,
    name: row.name as string,
    aliases: (row.aliases as string) || undefined,
    pinyin: row.pinyin as string,
    searchText: row.searchText as string,
    price: row.price as number,
    spec: (row.spec as string) || undefined,
    imageUri: (row.imageUri as string) || undefined,
    barcode: (row.barcode as string) || undefined,
    category: (row.category as string) || undefined,
    status: (row.status as string) as Product['status'],
    isDeleted: (row.isDeleted as number) as 0 | 1,
    updatedAt: row.updatedAt as string,
    createdAt: row.createdAt as string,
  };
}

/** 构建 WHERE 过滤条件 */
function buildFilters(options?: SearchOptions): {
  clauses: string[];
  params: unknown[];
} {
  const clauses: string[] = [];
  const params: unknown[] = [];

  // 默认排除已删除
  if (!options?.includeDeleted) {
    clauses.push('p.isDeleted = 0');
  }

  if (options?.status) {
    clauses.push('p.status = ?');
    params.push(options.status);
  }
  if (options?.category) {
    clauses.push('p.category = ?');
    params.push(options.category);
  }

  return { clauses, params };
}

/** 构建 ORDER BY 子句 */
function buildOrderBy(sortBy?: SortBy): string {
  switch (sortBy) {
    case 'priceLow':
      return 'p.price ASC';
    case 'priceHigh':
      return 'p.price DESC';
    case 'updatedAt':
      return 'p.updatedAt DESC';
    case 'relevance':
    default:
      // 默认：在售优先 + 名称字典序
      return "CASE WHEN p.status = 'IN_SHOP' THEN 0 ELSE 1 END, p.name ASC";
  }
}

// ==================== 1. searchProducts ====================

/**
 * 全文搜索商品。
 *
 * 流程：
 * 1. 对用户输入调用 escapeFts5（内部先 tokenizeChinese 分词再转义）
 * 2. FTS5 MATCH 查询，默认 ORDER BY rank（bm25），status='IN_SHOP' 优先
 * 3. 排除 isDeleted 商品
 *
 * @param db      已打开的数据库实例
 * @param query   用户输入的搜索词
 * @param options 可选：status / category / sortBy / limit
 */
export async function searchProducts(
  db: SQLite.SQLiteDatabase,
  query: string,
  options?: SearchOptions,
): Promise<Product[]> {
  const ftsQuery = escapeFts5(query);

  if (!ftsQuery) {
    // 空查询：无 FTS5 MATCH，直接按过滤条件返回
    const { clauses, params } = buildFilters(options);
    const orderBy = buildOrderBy(options?.sortBy);

    let sql = `SELECT p.*
               FROM product p
               WHERE ${clauses.join(' AND ')}
               ORDER BY ${orderBy}`;

    if (options?.limit !== undefined) {
      sql += ` LIMIT ${options.limit}`;
    }

    const rows = await db.getAllAsync<Record<string, unknown>>(sql, ...params as SQLiteBindValue[]);
    return rows.map(mapRow);
  }

  // 有 FTS5 查询词：JOIN product_fts，使用 4 档位排序
  const { clauses, params } = buildFilters(options);
  const rawQuery = query.trim();
  const pinyinUpper = rawQuery.toUpperCase();

  let sql = `SELECT p.*
             FROM product p
             JOIN product_fts fts ON p.rowid = fts.rowid
             WHERE fts MATCH ?
               AND ${clauses.join(' AND ')}
             ORDER BY
               CASE
                 WHEN p.name = ? THEN 1
                 WHEN p.aliases LIKE '%' || ? || '%' THEN 2
                 WHEN p.pinyin LIKE '%' || ? || '%' THEN 3
                 ELSE 4
               END,
               CASE WHEN p.status = 'IN_SHOP' THEN 0 ELSE 1 END,
               p.name ASC`;

  if (options?.limit !== undefined) {
    sql += ` LIMIT ${options.limit}`;
  }

  const rows = await db.getAllAsync<Record<string, unknown>>(
    sql,
    ftsQuery,
    rawQuery,
    rawQuery,
    pinyinUpper,
    ...params as SQLiteBindValue[],
  );
  return rows.map(mapRow);
}

// ==================== 2. searchByBarcode ====================

/**
 * 按条码搜索商品（LIKE 前缀匹配）。
 *
 * @param db      已打开的数据库实例
 * @param barcode 条码前缀
 */
export async function searchByBarcode(
  db: SQLite.SQLiteDatabase,
  barcode: string,
): Promise<Product[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT p.* FROM product p
     WHERE p.barcode LIKE ? AND p.isDeleted = 0
     ORDER BY p.name ASC`,
    `${barcode}%`,
  );
  return rows.map(mapRow);
}

// ==================== 3. searchByCategory ====================

/**
 * 按分类搜索商品。
 *
 * @param db       已打开的数据库实例
 * @param category 分类名称
 * @param options  可选：status / sortBy / limit
 */
export async function searchByCategory(
  db: SQLite.SQLiteDatabase,
  category: string,
  options?: Omit<SearchOptions, 'category'>,
): Promise<Product[]> {
  const { clauses, params } = buildFilters({
    ...options,
    category,
  });
  const orderBy = buildOrderBy(options?.sortBy);

  let sql = `SELECT p.*
             FROM product p
             WHERE ${clauses.join(' AND ')}
             ORDER BY ${orderBy}`;

  if (options?.limit !== undefined) {
    sql += ` LIMIT ${options.limit}`;
  }

  const rows = await db.getAllAsync<Record<string, unknown>>(sql, ...params as SQLiteBindValue[]);
  return rows.map(mapRow);
}

// ==================== 4. searchByStatus ====================

/**
 * 按状态搜索商品。
 *
 * @param db     已打开的数据库实例
 * @param status 商品状态
 * @param options 可选：category / sortBy / limit
 */
export async function searchByStatus(
  db: SQLite.SQLiteDatabase,
  status: ProductStatus,
  options?: Omit<SearchOptions, 'status'>,
): Promise<Product[]> {
  const { clauses, params } = buildFilters({
    ...options,
    status,
  });
  const orderBy = buildOrderBy(options?.sortBy);

  let sql = `SELECT p.*
             FROM product p
             WHERE ${clauses.join(' AND ')}
             ORDER BY ${orderBy}`;

  if (options?.limit !== undefined) {
    sql += ` LIMIT ${options.limit}`;
  }

  const rows = await db.getAllAsync<Record<string, unknown>>(sql, ...params as SQLiteBindValue[]);
  return rows.map(mapRow);
}

// ==================== 5. exportProducts ====================

/**
 * 导出全部未删除商品，返回可序列化数组。
 */
export async function exportProducts(
  db: SQLite.SQLiteDatabase,
): Promise<Product[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT p.* FROM product p WHERE p.isDeleted = 0 ORDER BY p.name ASC`,
  );
  return rows.map(mapRow);
}
