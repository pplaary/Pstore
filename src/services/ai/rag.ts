/**
 * RAG (Retrieval-Augmented Generation) 检索增强模块
 *
 * 从用户输入构建 Top 20 商品摘要，注入 AI System Prompt。
 * 仅在售（IN_SHOP）商品出现在候选中（spec §7.2）。
 */

import * as SQLite from 'expo-sqlite';
import { searchProducts } from '../../db/search';
import { IN_SHOP, type Product, type ProductStatus } from '../../db/types';
import type { AIResponse } from '../ai';

// ==================== 类型 ====================

/** RAG 上下文结果 */
export interface RAGContext {
  /** 商品摘要文本（注入 System Prompt） */
  summary: string;
  /** 匹配到的商品 ID 列表（用于 productId 本地校验） */
  productIds: string[];
  /** 匹配到的商品数量 */
  totalHits: number;
}

// ==================== 常量 ====================

const MAX_RESULTS = 20; // spec §7.4: Top K = 20

// ==================== 核心函数 ====================

/**
 * 从用户输入构建 RAG 上下文。
 *
 * 调用 FTS5 searchProducts，取 Top 20，构造为 AI 可理解的结构化文本摘要。
 * 仅包含在售（IN_SHOP）商品。
 */
export async function buildRAGContext(
  db: SQLite.SQLiteDatabase,
  userInput: string,
): Promise<RAGContext> {
  const products = await searchProducts(db, userInput, {
    status: IN_SHOP,
    limit: MAX_RESULTS,
  });

  const productIds = products.map((p) => p.id);

  let summary: string;
  if (products.length === 0) {
    summary = '商品库中暂无匹配商品';
  } else {
    summary = products.map((p) => formatProductLine(p)).join('\n');
  }

  return {
    summary,
    productIds,
    totalHits: products.length,
  };
}

// ==================== 辅助函数 ====================

/**
 * 将单个商品格式化为摘要行。
 *
 * 格式：ID:{id} | {name} | {spec} | ¥{price} | [{status}]
 */
function formatProductLine(p: Product): string {
  const spec = p.spec || '-';
  const statusLabel = formatStatus(p.status);
  return `ID:${p.id} | ${p.name} | ${spec} | ¥${p.price.toFixed(2)} | [${statusLabel}]`;
}

/**
 * 将商品状态转为简短中文标签。
 */
function formatStatus(status: ProductStatus): string {
  switch (status) {
    case 'IN_SHOP':
      return '在售';
    case 'OUT_OF_STOCK':
      return '缺货';
    case 'TO_BE_PURCHASED':
      return '待采';
    default:
      return status;
  }
}
