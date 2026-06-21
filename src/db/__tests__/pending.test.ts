/**
 * PendingItem DB 单元测试（纯内存模拟，不依赖 expo-sqlite 原生模块）
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { createOrUpdate, getAll, deleteById, findByBarcode, convertToProduct } from '../pending';

// ==================== 内存模拟 SQLite ====================

interface Row {
  id: string;
  barcode: string;
  scannedAt: string;
}

class MockDB {
  private rows: Row[] = [];
  private nextId = 0;

  private genId(): string {
    return `mock-${++this.nextId}`;
  }

  async execAsync(_sql: string): Promise<void> {}
  async runAsync(sql: string, ...params: unknown[]): Promise<void> {
    if (sql.includes('INSERT INTO pending_items')) {
      const id = params[0] as string;
      const barcode = params[1] as string;
      const scannedAt = params[2] as string;
      const existing = this.rows.find((r) => r.barcode === barcode);
      if (existing) {
        existing.scannedAt = scannedAt;
      } else {
        this.rows.push({ id, barcode, scannedAt });
      }
    } else if (sql.includes('DELETE FROM pending_items WHERE id')) {
      const id = params[0] as string;
      this.rows = this.rows.filter((r) => r.id !== id);
    }
  }
  async getFirstAsync<T>(_sql: string, ...params: unknown[]): Promise<T | null> {
    if (_sql.includes('WHERE barcode = ?')) {
      const barcode = params[0] as string;
      return (this.rows.find((r) => r.barcode === barcode) ?? null) as T;
    }
    if (_sql.includes('WHERE id = ?')) {
      const id = params[0] as string;
      return (this.rows.find((r) => r.id === id) ?? null) as T;
    }
    return null;
  }
  async getAllAsync<T>(_sql: string): Promise<T[]> {
    return [...this.rows].sort((a, b) => b.scannedAt.localeCompare(a.scannedAt)) as T[];
  }
  async withTransactionAsync(fn: () => Promise<void>): Promise<void> {
    await fn();
  }
}

// ==================== 测试 ====================

describe('pending.ts', () => {
  let db: MockDB;

  beforeEach(() => {
    db = new MockDB();
  });

  // createOrUpdate

  it('createOrUpdate 创建新 PendingItem', async () => {
    await createOrUpdate(db, '6901234567890');
    const all = await getAll(db);
    expect(all).toHaveLength(1);
    expect(all[0].barcode).toBe('6901234567890');
    expect(all[0].id).toBeTruthy();
    expect(all[0].scannedAt).toBeTruthy();
  });

  it('createOrUpdate 重复条码不新增记录', async () => {
    await createOrUpdate(db, '6901234567890');
    await createOrUpdate(db, '6901234567890');
    const all = await getAll(db);
    expect(all).toHaveLength(1);
  });

  it('createOrUpdate 重复条码时更新 scannedAt', async () => {
    await createOrUpdate(db, '6901234567890');
    const first = await findByBarcode(db, '6901234567890');

    await new Promise((r) => setTimeout(r, 50));
    await createOrUpdate(db, '6901234567890');
    const second = await findByBarcode(db, '6901234567890');

    expect(second!.id).toBe(first!.id);
    expect(second!.scannedAt).not.toBe(first!.scannedAt);
  });

  it('createOrUpdate 不同条码各自独立', async () => {
    await createOrUpdate(db, '6901111111111');
    await createOrUpdate(db, '6902222222222');
    const all = await getAll(db);
    expect(all).toHaveLength(2);
  });

  // getAll

  it('getAll 按 scannedAt 降序', async () => {
    await createOrUpdate(db, 'A');
    await new Promise((r) => setTimeout(r, 10));
    await createOrUpdate(db, 'B');
    await new Promise((r) => setTimeout(r, 10));
    await createOrUpdate(db, 'C');

    const all = await getAll(db);
    expect(all[0].barcode).toBe('C');
    expect(all[1].barcode).toBe('B');
    expect(all[2].barcode).toBe('A');
  });

  it('getAll 空表返回空数组', async () => {
    const all = await getAll(db);
    expect(all).toEqual([]);
  });

  // deleteById

  it('deleteById 删除记录', async () => {
    await createOrUpdate(db, '6901234567890');
    const all1 = await getAll(db);
    const id = all1[0].id;
    await deleteById(db, id);
    const all2 = await getAll(db);
    expect(all2).toHaveLength(0);
  });

  // findByBarcode

  it('findByBarcode 命中', async () => {
    await createOrUpdate(db, '6901234567890');
    const item = await findByBarcode(db, '6901234567890');
    expect(item).not.toBeNull();
    expect(item!.barcode).toBe('6901234567890');
  });

  it('findByBarcode 不命中返回 null', async () => {
    const item = await findByBarcode(db, '9999999999999');
    expect(item).toBeNull();
  });

  // convertToProduct

  it('convertToProduct 删除记录并返回条码', async () => {
    await createOrUpdate(db, '6901234567890');
    const all1 = await getAll(db);
    const id = all1[0].id;
    const barcode = await convertToProduct(db, id);
    expect(barcode).toBe('6901234567890');
    const all2 = await getAll(db);
    expect(all2).toHaveLength(0);
  });

  it('convertToProduct 不存在的 id 抛错', async () => {
    await expect(convertToProduct(db, 'nonexistent')).rejects.toThrow();
  });
});
