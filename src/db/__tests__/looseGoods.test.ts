/**
 * 散装快捷标签 CRUD 测试
 *
 * 覆盖 getAllLabels / addLabel / updateLabel / deleteLabel / reorderLabels。
 * Mock expo-sqlite 和 expo-crypto。
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ==================== Mock 模块 ====================

const { mockSQLite, mockCrypto } = vi.hoisted(() => {
  let orderCounter = 0;
  const resetCounter = () => { orderCounter = 0; };

  return {
    mockSQLite: {
      openDatabaseAsync: vi.fn(),
    },
    mockCrypto: {
      randomUUID: vi.fn(() => `uuid-${++orderCounter}`),
      _reset: resetCounter,
    },
  };
});

vi.mock('expo-sqlite', () => mockSQLite);
vi.mock('expo-crypto', () => mockCrypto);

// ==================== 导入被测模块 ====================

import {
  getAllLabels,
  addLabel,
  updateLabel,
  deleteLabel,
  reorderLabels,
} from '../../db/looseGoods';
import type { LooseGoodsLabel } from '../../db/types';

// ==================== 辅助：构建 mock DB ====================

function createMockDb(overrides: {
  getAllAsync?: ReturnType<typeof vi.fn>;
  getFirstAsync?: ReturnType<typeof vi.fn>;
  runAsync?: ReturnType<typeof vi.fn>;
  withTransactionAsync?: any;
  closeAsync?: ReturnType<typeof vi.fn>;
} = {}): any {
  return {
    getAllAsync: overrides.getAllAsync ?? vi.fn().mockResolvedValue([]),
    getFirstAsync: overrides.getFirstAsync ?? vi.fn().mockResolvedValue(null),
    runAsync: overrides.runAsync ?? vi.fn().mockResolvedValue(undefined),
    withTransactionAsync:
      overrides.withTransactionAsync ??
      vi.fn(async (fn: any) => fn()),
    closeAsync: overrides.closeAsync ?? vi.fn().mockResolvedValue(undefined),
  };
}

function mockRows(labels: Array<{ id: string; label: string; order: number }>) {
  return labels.map((l) => ({
    id: l.id,
    label: l.label,
    order: l.order,
  }));
}

const TEST_ID_PREFIX = 'test-label-';

// ==================== 测试 ====================

describe('looseGoods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSQLite.openDatabaseAsync.mockReset();
    mockCrypto.randomUUID.mockClear();
  });

  // ==================== getAllLabels ====================

  describe('getAllLabels', () => {
    it('happy-path: 返回标签列表，SQL 包含 ORDER BY', async () => {
      const rows = mockRows([
        { id: 'a', label: '塑料袋', order: 2 },
        { id: 'b', label: '汤勺', order: 1 },
        { id: 'c', label: '餐盒', order: 3 },
      ]);
      const db = createMockDb({
        getAllAsync: vi.fn().mockResolvedValue(rows),
      });

      const result = await getAllLabels(db);

      expect(result).toHaveLength(3);
      expect(result.map((r) => r.id)).toEqual(['a', 'b', 'c']);
      expect(db.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY'),
      );
    });

    it('error-path: 空表返回空数组', async () => {
      const db = createMockDb({
        getAllAsync: vi.fn().mockResolvedValue([]),
      });

      const result = await getAllLabels(db);

      expect(result).toEqual([]);
    });

    it('happy-path: SQL 包含 ORDER BY "order" ASC, label ASC', async () => {
      const db = createMockDb();
      await getAllLabels(db);

      expect(db.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM loose_goods_labels ORDER BY "order" ASC, label ASC',
      );
    });
  });

  // ==================== addLabel ====================

  describe('addLabel', () => {
    it('happy-path: 新增标签自动分配递增 order，返回完整对象', async () => {
      const runSpy = vi.fn().mockResolvedValue(undefined);
      const getFirstSpy = vi
        .fn()
        .mockResolvedValueOnce({ maxOrder: 3 }) // 事务内读取当前最大 order
        .mockResolvedValueOnce(null); // 不需要再调用

      const db = createMockDb({
        getFirstAsync: getFirstSpy,
        runAsync: runSpy,
        withTransactionAsync: vi.fn(async (fn) => fn()),
      });

      const result = await addLabel(db, ' 新标签 ');

      expect(result.label).toBe('新标签');
      expect(result.order).toBe(4);
      expect(result.id).toMatch(/^uuid-/);
      expect(runSpy).toHaveBeenCalledWith(
        'INSERT INTO loose_goods_labels (id, label, "order") VALUES (?, ?, ?)',
        'uuid-1',
        '新标签',
        4,
      );
    });

    it('happy-path: 空表时 order 从 1 开始', async () => {
      const getFirstSpy = vi.fn().mockResolvedValue({ maxOrder: 0 });
      const db = createMockDb({
        getFirstAsync: getFirstSpy,
        runAsync: vi.fn().mockResolvedValue(undefined),
        withTransactionAsync: vi.fn(async (fn) => fn()),
      });

      const result = await addLabel(db, '第一个标签');

      expect(result.order).toBe(1);
    });

    it('error-path: 标签文本被自动 trim', async () => {
      const getFirstSpy = vi.fn().mockResolvedValue({ maxOrder: 0 });
      const db = createMockDb({
        getFirstAsync: getFirstSpy,
        runAsync: vi.fn().mockResolvedValue(undefined),
        withTransactionAsync: vi.fn(async (fn) => fn()),
      });

      const result = await addLabel(db, '  标签  ');

      expect(result.label).toBe('标签');
    });

    it('happy-path: 在事务内执行 insert', async () => {
      const txFn = vi.fn(async (fn: () => Promise<void>) => fn());
      const db = createMockDb({
        getFirstAsync: vi.fn().mockResolvedValue({ maxOrder: 0 }),
        runAsync: vi.fn().mockResolvedValue(undefined),
        withTransactionAsync: txFn,
      });

      await addLabel(db, '事务测试');

      expect(txFn).toHaveBeenCalledTimes(1);
    });
  });

  // ==================== updateLabel ====================

  describe('updateLabel', () => {
    it('happy-path: 更新 label 字段', async () => {
      const getFirstSpy = vi.fn().mockResolvedValue({
        id: 'existing-id',
        label: '旧标签',
        order: 2,
      });
      const runSpy = vi.fn().mockResolvedValue(undefined);

      const db = createMockDb({
        getFirstAsync: getFirstSpy,
        runAsync: runSpy,
      });

      const result = await updateLabel(db, 'existing-id', { label: '新标签' });

      expect(result).toEqual({
        id: 'existing-id',
        label: '新标签',
        order: 2,
      });
      expect(runSpy).toHaveBeenCalledWith(
        'UPDATE loose_goods_labels SET label = ?, "order" = ? WHERE id = ?',
        '新标签',
        2,
        'existing-id',
      );
    });

    it('happy-path: 更新 order 字段', async () => {
      const getFirstSpy = vi.fn().mockResolvedValue({
        id: 'existing-id',
        label: '标签',
        order: 1,
      });
      const runSpy = vi.fn().mockResolvedValue(undefined);

      const db = createMockDb({
        getFirstAsync: getFirstSpy,
        runAsync: runSpy,
      });

      await updateLabel(db, 'existing-id', { order: 5 });

      expect(runSpy).toHaveBeenCalledWith(
        'UPDATE loose_goods_labels SET label = ?, "order" = ? WHERE id = ?',
        '标签',
        5,
        'existing-id',
      );
    });

    it('happy-path: 同时更新 label 和 order', async () => {
      const getFirstSpy = vi.fn().mockResolvedValue({
        id: 'id-1',
        label: '标签',
        order: 0,
      });
      const runSpy = vi.fn().mockResolvedValue(undefined);

      const db = createMockDb({
        getFirstAsync: getFirstSpy,
        runAsync: runSpy,
      });

      const result = await updateLabel(db, 'id-1', { label: '新名', order: 3 });

      expect(result.label).toBe('新名');
      expect(result.order).toBe(3);
    });

    it('error-path: 标签不存在时抛错', async () => {
      const db = createMockDb({
        getFirstAsync: vi.fn().mockResolvedValue(null),
      });

      await expect(
        updateLabel(db, 'non-existent-id', { label: '新标签' }),
      ).rejects.toThrow('updateLabel: 标签不存在 id=non-existent-id');
    });

    it('happy-path: label 变更被 trim', async () => {
      const getFirstSpy = vi.fn().mockResolvedValue({
        id: 'id-1',
        label: '旧',
        order: 1,
      });
      const runSpy = vi.fn().mockResolvedValue(undefined);

      const db = createMockDb({
        getFirstAsync: getFirstSpy,
        runAsync: runSpy,
      });

      await updateLabel(db, 'id-1', { label: '  新  ' });

      expect(runSpy).toHaveBeenCalledWith(
        'UPDATE loose_goods_labels SET label = ?, "order" = ? WHERE id = ?',
        '新',
        1,
        'id-1',
      );
    });
  });

  // ==================== deleteLabel ====================

  describe('deleteLabel', () => {
    it('happy-path: 删除指定 ID 的标签', async () => {
      const runSpy = vi.fn().mockResolvedValue(undefined);
      const db = createMockDb({ runAsync: runSpy });

      await deleteLabel(db, 'to-delete-id');

      expect(runSpy).toHaveBeenCalledWith(
        'DELETE FROM loose_goods_labels WHERE id = ?',
        'to-delete-id',
      );
    });

    it('error-path: runAsync 抛异常时向上传播', async () => {
      const db = createMockDb({
        runAsync: vi.fn().mockRejectedValue(new Error('DB locked')),
      });

      await expect(deleteLabel(db, 'any-id')).rejects.toThrow('DB locked');
    });
  });

  // ==================== reorderLabels ====================

  describe('reorderLabels', () => {
    it('happy-path: 批量重排，按索引设置 order', async () => {
      const runCalls: Array<[number, string]> = [];
      const runSpy = vi.fn().mockImplementation((_sql: string, ...args: any[]) => {
        // args: order, id
        if (args.length === 2) {
          runCalls.push([args[0], args[1]]);
        }
        return Promise.resolve(undefined);
      });

      const db = createMockDb({
        runAsync: runSpy,
        withTransactionAsync: vi.fn(async (fn) => fn()),
      });

      const orderedIds = ['id-c', 'id-a', 'id-b'];
      await reorderLabels(db, orderedIds);

      expect(runCalls).toEqual([
        [0, 'id-c'],
        [1, 'id-a'],
        [2, 'id-b'],
      ]);
    });

    it('happy-path: 空数组不执行任何更新', async () => {
      const runSpy = vi.fn().mockResolvedValue(undefined);
      const db = createMockDb({
        runAsync: runSpy,
        withTransactionAsync: vi.fn(async (fn) => fn()),
      });

      await reorderLabels(db, []);

      expect(runSpy).not.toHaveBeenCalled();
    });

    it('happy-path: 在事务内批量更新', async () => {
      const txFn = vi.fn(async (fn: () => Promise<void>) => fn());
      const db = createMockDb({
        runAsync: vi.fn().mockResolvedValue(undefined),
        withTransactionAsync: txFn,
      });

      await reorderLabels(db, ['id-1', 'id-2']);

      expect(txFn).toHaveBeenCalledTimes(1);
    });

    it('error-path: 事务内单个更新失败则整体失败', async () => {
      const db = createMockDb({
        runAsync: vi
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('constraint violation')),
        withTransactionAsync: vi.fn(async (fn) => fn()),
      });

      await expect(reorderLabels(db, ['id-1', 'id-2'])).rejects.toThrow(
        'constraint violation',
      );
    });

    it('happy-path: 单元素数组正确设置 order=0', async () => {
      const runSpy = vi.fn().mockResolvedValue(undefined);
      const db = createMockDb({
        runAsync: runSpy,
        withTransactionAsync: vi.fn(async (fn) => fn()),
      });

      await reorderLabels(db, ['only-id']);

      expect(runSpy).toHaveBeenCalledWith(
        'UPDATE loose_goods_labels SET "order" = ? WHERE id = ?',
        0,
        'only-id',
      );
    });
  });
});
