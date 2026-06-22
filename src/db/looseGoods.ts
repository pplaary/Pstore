/**
 * 散装快捷标签 CRUD 模块
 *
 * 操作 loose_goods_labels 表，管理搜索区域的快捷标签（塑料袋/汤勺/吸管/餐盒等）。
 * 点击标签直接加购，跳过确认卡片（spec §12.5）。
 */

import * as SQLite from 'expo-sqlite';
import type { LooseGoodsLabel } from './types';
import { randomUUID } from 'expo-crypto';

// ==================== 辅助函数 ====================

/**
 * 将数据库行映射为 LooseGoodsLabel 对象。
 */
function rowToLabel(row: Record<string, unknown>): LooseGoodsLabel {
  return {
    id: row.id as string,
    label: row.label as string,
    order: (row.order as number) ?? 0,
  };
}

// ==================== 1. getAll ====================

/**
 * 获取全部散装标签，按 order 升序。
 */
export async function getAllLabels(
  db: SQLite.SQLiteDatabase,
): Promise<LooseGoodsLabel[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM loose_goods_labels ORDER BY "order" ASC, label ASC`,
  );
  return rows.map(rowToLabel);
}

// ==================== 2. addLabel ====================

/**
 * 新增散装标签。
 *
 * @param db   已打开的数据库实例
 * @param label 标签文本
 * @returns 创建的标签对象
 */
export async function addLabel(
  db: SQLite.SQLiteDatabase,
  label: string,
): Promise<LooseGoodsLabel> {
  const trimmed = label.trim();
  const id = randomUUID();
  let maxOrder = 0;
  let newOrder = 1;

  await db.withTransactionAsync(async () => {
    // 放到末尾：获取当前最大 order（在事务内读取，保证原子性）
    const maxRow = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT MAX("order") AS maxOrder FROM loose_goods_labels`,
    );
    maxOrder = (maxRow?.maxOrder as number) ?? 0;
    newOrder = maxOrder + 1;

    await db.runAsync(
      `INSERT INTO loose_goods_labels (id, label, "order") VALUES (?, ?, ?)`,
      id,
      trimmed,
      newOrder,
    );
  });

  return { id, label: trimmed, order: newOrder };
}

// ==================== 3. updateLabel ====================

/**
 * 更新标签文本或排序。
 *
 * @param db     已打开的数据库实例
 * @param id     标签 ID
 * @param changes 可变更字段
 */
export async function updateLabel(
  db: SQLite.SQLiteDatabase,
  id: string,
  changes: { label?: string; order?: number },
): Promise<LooseGoodsLabel> {
  // 读取现有标签
  const row = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM loose_goods_labels WHERE id = ?`,
    id,
  );
  if (!row) {
    throw new Error(`updateLabel: 标签不存在 id=${id}`);
  }

  const newLabel = changes.label !== undefined ? changes.label.trim() : (row.label as string);
  const newOrder = changes.order !== undefined ? changes.order : (row.order as number);

  await db.runAsync(
    `UPDATE loose_goods_labels SET label = ?, "order" = ? WHERE id = ?`,
    newLabel,
    newOrder,
    id,
  );

  return { id: row.id as string, label: newLabel, order: newOrder };
}

// ==================== 4. deleteLabel ====================

/**
 * 删除标签。
 */
export async function deleteLabel(
  db: SQLite.SQLiteDatabase,
  id: string,
): Promise<void> {
  await db.runAsync(
    `DELETE FROM loose_goods_labels WHERE id = ?`,
    id,
  );
}

// ==================== 5. reorderLabels ====================

/**
 * 批量重排标签顺序。
 *
 * @param db       已打开的数据库实例
 * @param orderedIds 按新顺序排列的标签 ID 数组
 */
export async function reorderLabels(
  db: SQLite.SQLiteDatabase,
  orderedIds: string[],
): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.runAsync(
        `UPDATE loose_goods_labels SET "order" = ? WHERE id = ?`,
        i,
        orderedIds[i],
      );
    }
  });
}
