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
