/**
 * 商品 CRUD 模块
 *
 * - 全部 async 函数直接使用 expo-sqlite
 * - 所有 SQL 参数化，禁止字符串拼接
 * - FTS5 写入必须与 product 写入在同一事务内
 * - 拼音使用 pinyin-pro 库，参数 pattern='first', toneType='none'
 */

import * as SQLite from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { pinyin } from 'pinyin-pro';
import { tokenizeChinese } from './tokenizer';
import type { Product, PriceHistory } from './types';

// ==================== 辅助函数 ====================

/**
 * 生成拼音首字母（去空格，转大写）。
 *
 * 示例：「百事可乐」→「BSKL」
 */
function generatePinyin(name: string): string {
  return pinyin(name, { pattern: 'first', toneType: 'none', type: 'string' })
    .replace(/\s+/g, '')
    .toUpperCase();
}

/**
 * 生成 FTS5 搜索文本。
 *
 * 将 name 与 aliases 合并后调用 tokenizeChinese，空格连接。
 * 示例：name="百事可乐", aliases="百事,可乐" → "百 事 可 乐 百 事 可 乐"
 */
function generateSearchText(name: string, aliases?: string): string {
  const source = aliases ? `${name} ${aliases}` : name;
  return tokenizeChinese(source).join(' ');
}

/**
 * 将数据库行映射为 Product 对象。
 */
function rowToProduct(row: Record<string, unknown>): Product {
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

// ==================== 公开类型 ====================

/** addProduct 的输入参数 */
export interface AddProductData {
  name: string;
  aliases?: string;
  price: number;
  spec?: string;
  imageUri?: string;
  barcode?: string;
  category?: string;
  status?: Product['status'];
}

/** updateProduct 的可变更字段 */
export interface UpdateProductChanges {
  name?: string;
  aliases?: string;
  price?: number;
  spec?: string;
  imageUri?: string;
  barcode?: string;
  category?: string;
  status?: Product['status'];
}

// ==================== 1. addProduct ====================

/**
 * 添加商品。
 *
 * 流程：
 * 1. 生成 UUID v4
 * 2. tokenizeChinese(name) → tokens
 * 3. pinyin-pro 生成拼音首字母
 * 4. searchText = [name, ...aliases, pinyin].join(' ')
 * 5. 同一事务内 INSERT INTO product + INSERT INTO product_fts
 * 6. 返回完整 Product 对象
 */
export async function addProduct(
  db: SQLite.SQLiteDatabase,
  productData: AddProductData,
): Promise<Product> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const pinyinValue = generatePinyin(productData.name);
  const searchText = generateSearchText(productData.name, productData.aliases);

  const status = productData.status ?? 'IN_SHOP';

  // 同一事务内完成 product 写入 + FTS 索引写入
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO product (id, name, aliases, pinyin, searchText, price, spec, imageUri, barcode, category, status, updatedAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      productData.name,
      productData.aliases ?? null,
      pinyinValue,
      searchText,
      productData.price,
      productData.spec ?? null,
      productData.imageUri ?? null,
      productData.barcode ?? null,
      productData.category ?? null,
      status,
      now,
      now,
    );

    await db.runAsync(
      `INSERT INTO product_fts (rowid, pinyin, searchText)
       VALUES (last_insert_rowid(), ?, ?)`,
      pinyinValue,
      searchText,
    );
  });

  // 返回完整 Product 对象
  const row = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM product WHERE id = ? AND isDeleted = 0',
    id,
  );
  if (!row) {
    throw new Error(`addProduct: 无法读取刚创建的商品 id=${id}`);
  }
  return rowToProduct(row);
}

// ==================== 2. updateProduct ====================

/**
 * 更新商品。
 *
 * - 若 name/aliases 变更，重新生成 pinyin + searchText
 * - 同一事务内：UPDATE product + 重建 FTS 该行（DELETE + INSERT）
 * - updatedAt 自动设为当前时间
 */
export async function updateProduct(
  db: SQLite.SQLiteDatabase,
  id: string,
  changes: UpdateProductChanges,
): Promise<Product> {
  // 先读取当前商品，判断 name/aliases 是否变更
  const current = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM product WHERE id = ? AND isDeleted = 0',
    id,
  );
  if (!current) {
    throw new Error(`updateProduct: 商品不存在 id=${id}`);
  }

  const now = new Date().toISOString();

  const nameChanged =
    changes.name !== undefined && changes.name !== (current.name as string);
  const aliasesChanged =
    changes.aliases !== undefined &&
    changes.aliases !== ((current.aliases as string) || '');

  const newName = changes.name ?? (current.name as string);
  const newAliases =
    changes.aliases !== undefined
      ? changes.aliases
      : ((current.aliases as string) || undefined);

  const pinyinValue =
    nameChanged || aliasesChanged
      ? generatePinyin(newName)
      : (current.pinyin as string);

  const searchText =
    nameChanged || aliasesChanged
      ? generateSearchText(newName, newAliases)
      : (current.searchText as string);

  // 动态构建 SET 子句（列名非用户输入，值全部参数化）
  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (changes.name !== undefined) {
    setClauses.push('name = ?');
    params.push(changes.name);
  }
  if (changes.aliases !== undefined) {
    setClauses.push('aliases = ?');
    params.push(changes.aliases || null);
  }
  if (nameChanged || aliasesChanged) {
    setClauses.push('pinyin = ?');
    params.push(pinyinValue);
    setClauses.push('searchText = ?');
    params.push(searchText);
  }
  if (changes.price !== undefined) {
    setClauses.push('price = ?');
    params.push(changes.price);
  }
  if (changes.spec !== undefined) {
    setClauses.push('spec = ?');
    params.push(changes.spec || null);
  }
  if (changes.imageUri !== undefined) {
    setClauses.push('imageUri = ?');
    params.push(changes.imageUri || null);
  }
  if (changes.barcode !== undefined) {
    setClauses.push('barcode = ?');
    params.push(changes.barcode || null);
  }
  if (changes.category !== undefined) {
    setClauses.push('category = ?');
    params.push(changes.category || null);
  }
  if (changes.status !== undefined) {
    setClauses.push('status = ?');
    params.push(changes.status);
  }

  setClauses.push('updatedAt = ?');
  params.push(now);

  // 同一事务：UPDATE product + 重建 FTS 索引
  await db.withTransactionAsync(async () => {
    // 1. 更新 product 表
    await db.runAsync(
      `UPDATE product SET ${setClauses.join(', ')} WHERE id = ?`,
      ...params,
      id,
    );

    // 2. 重建 FTS 该行（DELETE + INSERT）
    // product_fts 使用 content='product' content_rowid='rowid'，
    // DELETE 从 FTS 索引移除条目（不删除 product 行）
    await db.runAsync(
      `DELETE FROM product_fts WHERE rowid = (SELECT rowid FROM product WHERE id = ?)`,
      id,
    );

    await db.runAsync(
      `INSERT INTO product_fts (rowid, pinyin, searchText)
       VALUES ((SELECT rowid FROM product WHERE id = ?), ?, ?)`,
      id,
      pinyinValue,
      searchText,
    );
  });

  // 返回更新后的完整对象
  const updated = await db.getFirstAsync<Record<string, unknown>>(
    'SELECT * FROM product WHERE id = ? AND isDeleted = 0',
    id,
  );
  if (!updated) {
    throw new Error(`updateProduct: 无法读取更新后的商品 id=${id}`);
  }
  return rowToProduct(updated);
}

// ==================== 3. softDeleteProduct ====================

/**
 * 软删除商品。
 *
 * SET isDeleted = 1, updatedAt = CURRENT_TIMESTAMP
 * 同时从 product_fts 移除索引条目。
 */
export async function softDeleteProduct(
  db: SQLite.SQLiteDatabase,
  id: string,
): Promise<void> {
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    // 先从 FTS 索引移除
    await db.runAsync(
      `DELETE FROM product_fts WHERE rowid = (SELECT rowid FROM product WHERE id = ?)`,
      id,
    );

    // 软删除
    await db.runAsync(
      `UPDATE product SET isDeleted = 1, updatedAt = ? WHERE id = ?`,
      now,
      id,
    );
  });
}

// ==================== 4. getAllProducts ====================

/**
 * 获取所有未删除商品（按 updatedAt 降序）。
 */
export async function getAllProducts(
  db: SQLite.SQLiteDatabase,
): Promise<Product[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM product WHERE isDeleted = 0 ORDER BY updatedAt DESC`,
  );
  return rows.map(rowToProduct);
}

// ==================== 5. getProductById ====================

/**
 * 按 ID 获取单个商品（仅未删除）。
 */
export async function getProductById(
  db: SQLite.SQLiteDatabase,
  id: string,
): Promise<Product | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM product WHERE id = ? AND isDeleted = 0`,
    id,
  );
  return row ? rowToProduct(row) : null;
}

// ==================== 6. getProductByBarcode ====================

/**
 * 按条码获取商品（仅未删除）。
 */
export async function getProductByBarcode(
  db: SQLite.SQLiteDatabase,
  barcode: string,
): Promise<Product | null> {
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM product WHERE barcode = ? AND isDeleted = 0`,
    barcode,
  );
  return row ? rowToProduct(row) : null;
}

// ==================== 7. addPriceRecord ====================

/**
 * 添加价格变更记录。
 */
export async function addPriceRecord(
  db: SQLite.SQLiteDatabase,
  productId: string,
  oldPrice: number,
  newPrice: number,
): Promise<PriceHistory> {
  const id = randomUUID();
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO price_history (id, productId, oldPrice, newPrice, changedAt)
     VALUES (?, ?, ?, ?, ?)`,
    id,
    productId,
    oldPrice,
    newPrice,
    now,
  );

  return {
    id,
    productId,
    oldPrice,
    newPrice,
    changedAt: now,
  };
}

// ==================== 8. getPriceHistory ====================

/**
 * 获取指定商品的价格历史（按时间降序）。
 */
export async function getPriceHistory(
  db: SQLite.SQLiteDatabase,
  productId: string,
): Promise<PriceHistory[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM price_history WHERE productId = ? ORDER BY changedAt DESC`,
    productId,
  );

  return rows.map(
    (row): PriceHistory => ({
      id: row.id as string,
      productId: row.productId as string,
      oldPrice: row.oldPrice as number,
      newPrice: row.newPrice as number,
      changedAt: row.changedAt as string,
    }),
  );
}
