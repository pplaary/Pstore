/**
 * duplicate.ts 单元测试（纯内存模拟，不依赖 expo-sqlite 原生模块）
 *
 * 覆盖：findByBarcode / findByNameSimilarity / getAllMergeCandidates / mergeProducts。
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  findByBarcode,
  findByNameSimilarity,
  getAllMergeCandidates,
  mergeProducts,
} from '../duplicate';

// ==================== 内存模拟 SQLite ====================

interface Row {
  id: string;
  name: string;
  aliases: string | null;
  pinyin: string;
  searchText: string;
  price: number;
  barcode: string | null;
  category: string | null;
  status: string;
  isDeleted: number;
  updatedAt: string;
  createdAt: string;
}

class MockDB {
  private products: Row[] = [];
  private nextId = 1;

  private genId(): string {
    return `p-${this.nextId++}`;
  }

  async execAsync(_sql: string): Promise<void> {}
  async runAsync(sql: string, ...params: unknown[]): Promise<void> {
    // UPDATE product SET aliases = ?, updatedAt = ? WHERE id = ?
    if (sql.includes('UPDATE product SET aliases')) {
      const id = params[2] as string;
      const aliases = params[0] as string | null;
      const row = this.products.find((r) => r.id === id);
      if (row) row.aliases = aliases;
    }
    // UPDATE product SET isDeleted = 1
    if (sql.includes('SET isDeleted = 1')) {
      const id = params[1] as string;
      const row = this.products.find((r) => r.id === id);
      if (row) row.isDeleted = 1;
    }
    // DELETE/INSERT INTO product_fts — no-op in mock
  }
  async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    // mergeProducts 查询: WHERE id = ? AND isDeleted = 0
    if (sql.includes('WHERE id = ?')) {
      const id = params[0] as string;
      const row = sql.includes('AND isDeleted')
        ? this.products.find((r) => r.id === id && r.isDeleted === 0)
        : this.products.find((r) => r.id === id);
      return (row ?? null) as T;
    }
    return null;
  }
  async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    // findByBarcode: SELECT * FROM product WHERE barcode = ? AND isDeleted = 0
    if (sql.includes('WHERE barcode = ?')) {
      let barcode: string;
      let excludeId: string | undefined;
      if (sql.includes('AND id != ?')) {
        barcode = params[0] as string;
        excludeId = params[1] as string;
      } else {
        barcode = params[0] as string;
      }
      return this.products
        .filter(
          (r) => r.barcode === barcode && r.isDeleted === 0 && r.id !== excludeId,
        )
        .map((r) => r as T);
    }

    // findByNameSimilarity / getAllMergeCandidates: SELECT * FROM product WHERE isDeleted = 0
    if (sql.includes('FROM product WHERE isDeleted = 0')) {
      return this.products.filter((r) => r.isDeleted === 0).map((r) => r as T);
    }

    return [];
  }
  async withTransactionAsync(fn: () => Promise<void>): Promise<void> {
    await fn();
  }

  // 测试辅助：直接插入商品
  async insertProduct(opts: {
    id?: string;
    name: string;
    barcode?: string;
  }): Promise<string> {
    const id = opts.id ?? this.genId();
    this.products.push({
      id,
      name: opts.name,
      aliases: null,
      pinyin: opts.name.toUpperCase().replace(/[^A-Z]/g, ''),
      searchText: opts.name.split('').join(' '),
      price: 10,
      barcode: opts.barcode ?? null,
      category: null,
      status: 'IN_SHOP',
      isDeleted: 0,
      updatedAt: '2025-01-01T00:00:00Z',
      createdAt: '2025-01-01T00:00:00Z',
    });
    return id;
  }

  async softDelete(id: string): Promise<void> {
    const row = this.products.find((r) => r.id === id);
    if (row) row.isDeleted = 1;
  }

  async getAliases(id: string): Promise<string | null> {
    return this.products.find((r) => r.id === id)?.aliases ?? null;
  }
}

// ==================== 测试 ====================

describe('duplicate.ts', () => {
  let db: MockDB;

  beforeEach(async () => {
    db = new MockDB();
  });

  // ==================== findByBarcode ====================

  describe('findByBarcode', () => {
    it('同条码命中', async () => {
      await db.insertProduct({ id: 'p1', name: '百事可乐', barcode: '690111' });
      await db.insertProduct({ id: 'p2', name: '百事可乐500ml', barcode: '690111' });

      const results = await findByBarcode(db, '690111');
      expect(results).toHaveLength(2);
    });

    it('排除自身', async () => {
      await db.insertProduct({ id: 'p1', name: '百事可乐', barcode: '690111' });

      const results = await findByBarcode(db, '690111', 'p1');
      expect(results).toHaveLength(0);
    });

    it('排除已删除商品', async () => {
      await db.insertProduct({ id: 'p1', name: '百事可乐', barcode: '690111' });
      await db.insertProduct({ id: 'p2', name: '百事可乐500ml', barcode: '690111' });
      await db.softDelete('p2');

      const results = await findByBarcode(db, '690111');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('p1');
    });

    it('空条码返回空数组', async () => {
      const results = await findByBarcode(db, '');
      expect(results).toEqual([]);
    });
  });

  // ==================== findByNameSimilarity ====================

  describe('findByNameSimilarity', () => {
    it('相似度 ≥ 90% 命中', async () => {
      await db.insertProduct({ id: 'p1', name: '百事可乐' });

      const results = await findByNameSimilarity(db, '百事可乐(500ml)');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('p1');
    });

    it('相似度 < 90% 不命中', async () => {
      await db.insertProduct({ id: 'p1', name: '可口可乐' });

      const results = await findByNameSimilarity(db, '百事可乐');
      expect(results).toHaveLength(0);
    });

    it('排除自身', async () => {
      await db.insertProduct({ id: 'p1', name: '百事可乐' });

      const results = await findByNameSimilarity(db, '百事可乐', 'p1');
      expect(results).toHaveLength(0);
    });

    it('完全相同的名称命中', async () => {
      await db.insertProduct({ id: 'p1', name: '农夫山泉' });

      const results = await findByNameSimilarity(db, '农夫山泉');
      expect(results).toHaveLength(1);
    });
  });

  // ==================== getAllMergeCandidates ====================

  describe('getAllMergeCandidates', () => {
    it('条码重复 → barcode 类型候选', async () => {
      await db.insertProduct({ id: 'p1', name: '百事可乐', barcode: '690111' });
      await db.insertProduct({ id: 'p2', name: '百事可乐500ml', barcode: '690111' });

      const candidates = await getAllMergeCandidates(db);
      const barcodeCandidates = candidates.filter((c) => c.reason === 'barcode');
      expect(barcodeCandidates).toHaveLength(1);
    });

    it('名称高度相似 → name_similarity 候选', async () => {
      await db.insertProduct({ id: 'p1', name: '百事可乐' });
      await db.insertProduct({ id: 'p2', name: '百事可乐(500ml)' });

      const candidates = await getAllMergeCandidates(db);
      const simCandidates = candidates.filter((c) => c.reason === 'name_similarity');
      expect(simCandidates.length).toBeGreaterThanOrEqual(1);
      if (simCandidates.length > 0) {
        expect(simCandidates[0].similarity).toBeGreaterThanOrEqual(0.9);
      }
    });

    it('不相似名称不产生候选', async () => {
      await db.insertProduct({ id: 'p1', name: '可口可乐' });
      await db.insertProduct({ id: 'p2', name: '农夫山泉' });

      const candidates = await getAllMergeCandidates(db);
      expect(candidates).toHaveLength(0);
    });

    it('空表返回空候选', async () => {
      const candidates = await getAllMergeCandidates(db);
      expect(candidates).toEqual([]);
    });
  });

  // ==================== mergeProducts ====================

  describe('mergeProducts', () => {
    it('合并后 mergeId 商品 isDeleted=1', async () => {
      await db.insertProduct({ id: 'p1', name: '百事可乐', barcode: '690111' });
      await db.insertProduct({ id: 'p2', name: '百事可乐500ml', barcode: '690111' });

      await mergeProducts(db, 'p1', 'p2');

      const p2 = db.products.find((r) => r.id === 'p2');
      expect(p2?.isDeleted).toBe(1);
    });

    it('合并后 keepId 的 aliases 包含合并商品名', async () => {
      await db.insertProduct({ id: 'p1', name: '百事可乐', barcode: '690111' });
      await db.insertProduct({ id: 'p2', name: '百事可乐500ml', barcode: '690111' });

      await mergeProducts(db, 'p1', 'p2');

      const aliases = await db.getAliases('p1');
      expect(aliases).toContain('百事可乐500ml');
    });

    it('不存在商品抛错', async () => {
      await expect(mergeProducts(db, 'nonexistent', 'p2')).rejects.toThrow();
    });
  });
});
