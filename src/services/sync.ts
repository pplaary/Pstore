/**
 * 客户端同步引擎
 *
 * 核心逻辑：推送本地变更 → 拉取服务端增量 → 合并入库 → 更新时间戳
 */

import * as N1 from './n1';
import * as db from '../db/product';
import type { SyncConfigState } from '../store/syncConfig';

// ==================== 类型 ====================

export interface SyncResult {
  synced: number;
  pushed: number;
}

// ==================== 内部函数 ====================

/**
 * 获取本地自 lastPushAt 以来有变更的商品。
 */
function getPendingChanges(
  allProducts: Parameters<typeof db.getAllProducts>[0],
  lastPushAt: string | null,
): N1.PushChange[] {
  if (!lastPushAt) return [];

  const pending: N1.PushChange[] = [];
  // 此处由调用方先调用 getAllProducts 再传入过滤结果
  // 为避免二次查询，这里由 performSync 直接内联过滤
  return pending;
}

/**
 * 标记已推送的 id 列表。
 */
function markPushed(
  store: SyncConfigState,
  _ids: string[],
): void {
  store.setSyncStatus({
    lastPushAt: new Date().toISOString(),
  });
}

// ==================== 公开 API ====================

/**
 * 执行一次完整同步循环。
 *
 * 1. 推送本地未同步变更
 * 2. 拉取全量/增量
 * 3. 合并入库（按时间戳规则）
 * 4. 更新时间戳
 */
export async function performSync(
  dbInstance: Parameters<typeof db.getAllProducts>[0],
  store: SyncConfigState,
  serverUrl: string,
): Promise<SyncResult> {
  const lastPushAt = store.lastPushAt;
  let pushed = 0;

  // 1. 推送本地未同步变更
  const allProducts = await db.getAllProducts(dbInstance);

  const pending: N1.PushChange[] = [];
  for (const p of allProducts) {
    if (!lastPushAt || p.updatedAt > lastPushAt) {
      pending.push({
        id: p.id,
        name: p.name,
        price: p.price,
        barcode: p.barcode ?? undefined,
        category: p.category ?? '',
        unit: '个',
        imageUri: p.imageUri ?? undefined,
        isDeleted: p.isDeleted,
        updatedAt: p.updatedAt,
      });
    }
  }

  if (pending.length > 0) {
    try {
      await N1.pushProducts(serverUrl, pending);
      pushed = pending.length;
      markPushed(store, pending.map((p) => p.id));
    } catch (e) {
      console.warn('pushProducts 失败:', e);
      // 推送失败不中断同步流程，继续拉取
    }
  }

  // 2. 拉取全量/增量
  const lastSync = store.lastSyncAt;
  let result: { products: N1.SyncProduct[]; serverTime: string };
  try {
    result = await N1.syncProducts(serverUrl, lastSync || undefined);
  } catch (e) {
    console.warn('syncProducts 失败:', e);
    throw e;
  }

  // 3. 合并入库（服务端较新 → 覆盖本地；本地较新 → 保留）
  let synced = 0;
  for (const p of result.products) {
    const local = await db.getProductById(dbInstance, p.id);
    if (!local || new Date(p.updatedAt) >= new Date(local.updatedAt)) {
      await db.updateProduct(dbInstance, p.id, {
        name: p.name,
        price: p.price,
        barcode: p.barcode ?? null,
        category: p.category,
        status: p.isDeleted ? 'OUT_OF_STOCK' : 'IN_SHOP',
      });
      synced++;
    }
  }

  // 4. 更新时间戳
  store.setSyncStatus({
    lastSyncAt: result.serverTime,
  });

  return { synced, pushed };
}
