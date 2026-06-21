/**
 * PStore 数据模型类型定义
 */

// ==================== 状态常量 ====================

export const IN_SHOP = 'IN_SHOP';
export const OUT_OF_STOCK = 'OUT_OF_STOCK';
export const TO_BE_PURCHASED = 'TO_BE_PURCHASED';

// ==================== 分类常量 ====================

export const CATEGORIES = [
  '零食',
  '饮料',
  '粮油',
  '调味',
  '日化',
  '生鲜',
  '冻品',
  '烟酒',
  '日用',
  '其他',
] as const;

export type Category = (typeof CATEGORIES)[number];

// ==================== 产品状态联合类型 ====================

export type ProductStatus = 'IN_SHOP' | 'OUT_OF_STOCK' | 'TO_BE_PURCHASED';

// ==================== 核心接口 ====================

/** 产品主表 */
export interface Product {
  id: string;
  name: string;
  aliases?: string;
  pinyin: string;
  searchText: string;
  price: number;
  spec?: string;
  imageUri?: string;
  barcode?: string;
  category?: string;
  status: ProductStatus;
  isDeleted: 0 | 1;
  updatedAt: string;
  createdAt: string;
}

/** 价格历史 */
export interface PriceHistory {
  id: string;
  productId: string;
  oldPrice: number;
  newPrice: number;
  changedAt: string;
}

/** 待处理扫码记录 */
export interface PendingItem {
  id: string;
  barcode: string;
  scannedAt: string;
}

/** 自检结果 */
export interface VerifyResult {
  test: string;
  passed: boolean;
  detail: string;
}

// ==================== 重复检测类型 ====================

/** 重复检测候选 */
export interface MergeCandidate {
  productA: Product;
  productB: Product;
  reason: 'barcode' | 'name_similarity';
  similarity?: number; // 仅 name_similarity 时有值
}

/** 合并结果 */
export interface MergeResult {
  keptId: string; // 保留的商品 ID
  mergedId: string; // 被合并（软删除）的商品 ID
  mergedName: string; // 被合并的商品名（已写入保留商品的 aliases）
}

// ==================== 同步类型 ====================

/** 同步状态 */
export interface SyncStatus {
  lastSyncAt: string | null;
  lastPushAt: string | null;
  serverUrl: string | null;
  isConnected: boolean;
}

/** 推送变更（客户端 → 服务端） */
export interface PushChange {
  id: string;
  name: string;
  price: number;
  barcode?: string;
  category: string;
  unit: string;
  imageUri?: string;
  isDeleted: number;
  updatedAt: string;
}
