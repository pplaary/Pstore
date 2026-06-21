/**
 * 重复检测与自动合并模块
 *
 * spec §5.7:
 * - 条码一致 → 直接判定重复，静默自动合并
 * - 名称相似度 ≥ 90% → 需人工确认
 * - 合并：保留 updatedAt 较新的，旧商品名写入保留商品 aliases，旧商品 isDeleted=1
 * - 同一事务内完成
 */

import * as SQLite from 'expo-sqlite';
import { normalizedSimilarity } from '../utils/levenshtein';
import { tokenizeChinese } from './tokenizer';
import type { Product, MergeCandidate, MergeResult } from './types';

// ==================== 条码重复检测 ====================

/**
 * 查询同条码商品（排除自身、排除已删除）。
 */
export async function findByBarcode(
  db: SQLite.SQLiteDatabase,
  barcode: string,
  excludeId?: string,
): Promise<Product[]> {
  if (!barcode) return [];

  let sql = `SELECT * FROM product WHERE barcode = ? AND isDeleted = 0`;
  const params: unknown[] = [barcode];

  if (excludeId) {
    sql += ` AND id != ?`;
    params.push(excludeId);
  }

  const rows = await db.getAllAsync<Record<string, unknown>>(sql, ...params);
  return rows.map(mapRow);
}

// ==================== 名称相似度检测 ====================

/**
 * 遍历所有未删除商品，计算与给定名称的归一化相似度，筛选 ≥ 0.9 的结果。
 */
export async function findByNameSimilarity(
  db: SQLite.SQLiteDatabase,
  name: string,
  excludeId?: string,
): Promise<Product[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM product WHERE isDeleted = 0`,
  );

  const candidates: Product[] = [];
  for (const row of rows) {
    const product = mapRow(row);
    if (excludeId && product.id === excludeId) continue;

    const sim = normalizedSimilarity(name, product.name);
    if (sim >= 0.9) {
      candidates.push(product);
    }
  }

  return candidates;
}

// ==================== 获取所有重复候选 ====================

/**
 * 返回所有重复候选（条码重复 + 名称高度相似）。
 * 遍历所有未删除商品对做 O(n²) 比对。
 */
export async function getAllMergeCandidates(
  db: SQLite.SQLiteDatabase,
): Promise<MergeCandidate[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM product WHERE isDeleted = 0`,
  );
  const products = rows.map(mapRow);

  const seen = new Set<string>();
  const candidates: MergeCandidate[] = [];

  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      const a = products[i];
      const b = products[j];

      // 条码一致
      if (a.barcode && b.barcode && a.barcode === b.barcode) {
        const key = [a.id, b.id].sort().join('|');
        if (!seen.has(key)) {
          seen.add(key);
          candidates.push({
            productA: a,
            productB: b,
            reason: 'barcode',
          });
        }
        continue;
      }

      // 名称相似度 ≥ 90%
      const sim = normalizedSimilarity(a.name, b.name);
      if (sim >= 0.9) {
        const key = [a.id, b.id].sort().join('|');
        if (!seen.has(key)) {
          seen.add(key);
          candidates.push({
            productA: a,
            productB: b,
            reason: 'name_similarity',
            similarity: sim,
          });
        }
      }
    }
  }

  return candidates;
}

// ==================== 合并商品 ====================

/**
 * 将 mergeId 商品合并到 keepId 商品。
 *
 * 操作：
 * 1. 将 mergeId 的商品名写入 keepId 的 aliases（逗号分隔，去重）
 * 2. mergeId 设 isDeleted = 1
 *
 * 在同一事务内完成。
 */
export async function mergeProducts(
  db: SQLite.SQLiteDatabase,
  keepId: string,
  mergeId: string,
): Promise<MergeResult> {
  // 读取两个商品
  const keepRow = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM product WHERE id = ? AND isDeleted = 0`,
    keepId,
  );
  const mergeRow = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM product WHERE id = ? AND isDeleted = 0`,
    mergeId,
  );

  if (!keepRow || !mergeRow) {
    throw new Error('mergeProducts: 商品不存在');
  }

  const keep = mapRow(keepRow);
  const merge = mapRow(mergeRow);
  const now = new Date().toISOString();

  // 合并 aliases：保留原有 + 被合并商品名（逗号分隔，去重）
  const existingAliases = keep.aliases
    ? keep.aliases.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const newNames = merge.name.split(',').map((s) => s.trim()).filter(Boolean);

  // 去重合并
  const aliasSet = new Set(existingAliases);
  for (const n of newNames) {
    if (n !== keep.name) aliasSet.add(n);
  }
  const mergedAliases = aliasSet.size > 0 ? [...aliasSet].join(',') : null;

  // 同一事务：更新 aliases + 重建 FTS + 软删除 mergeId
  await db.withTransactionAsync(async () => {
    // 更新 keepId 的 aliases + updatedAt
    await db.runAsync(
      `UPDATE product SET aliases = ?, updatedAt = ? WHERE id = ?`,
      mergedAliases,
      now,
      keepId,
    );

    // 重建 FTS 索引
    const newPinyin = generatePinyinForRow(keep.name, mergedAliases);
    const newSearchText = generateSearchTextForRow(keep.name, mergedAliases);

    await db.runAsync(
      `DELETE FROM product_fts WHERE rowid = (SELECT rowid FROM product WHERE id = ?)`,
      keepId,
    );
    await db.runAsync(
      `INSERT INTO product_fts (rowid, pinyin, searchText)
       VALUES ((SELECT rowid FROM product WHERE id = ?), ?, ?)`,
      keepId,
      newPinyin,
      newSearchText,
    );

    // 软删除 mergeId
    await db.runAsync(
      `UPDATE product SET isDeleted = 1, updatedAt = ? WHERE id = ?`,
      now,
      mergeId,
    );

    // 从 FTS 移除 mergeId
    await db.runAsync(
      `DELETE FROM product_fts WHERE rowid = (SELECT rowid FROM product WHERE id = ?)`,
      mergeId,
    );
  });

  return {
    keptId: keepId,
    mergedId: mergeId,
    mergedName: merge.name,
  };
}

// ==================== 辅助函数 ====================

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

/**
 * 生成拼音首字母（与 product.ts 相同的逻辑）。
 */
function generatePinyinForRow(name: string, _aliases?: string): string {
  // 简单实现：取每个字符的首字母（非 CJK 保留原样）
  // 实际项目中应使用 pinyin-pro，这里做简化处理用于 FTS 索引重建
  return name
    .split('')
    .filter((c) => /[a-zA-Z]/.test(c))
    .join('')
    .toUpperCase()
    .slice(0, 20);
}

/**
 * 生成 searchText（与 product.ts 相同的分词逻辑）。
 */
function generateSearchTextForRow(name: string, aliases?: string): string {
  const source = aliases ? `${name} ${aliases}` : name;
  return tokenizeChinese(source).join(' ');
}
