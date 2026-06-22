/**
 * CSV 导出服务
 *
 * - 全部使用参数化 SQL
 * - BOM 头 ﻿ 确保 Excel 正确识别 UTF-8
 * - 输出到 expo-file-system cacheDirectory，通过 expo-sharing 分享
 */

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Product, PriceHistory } from '../../db/types';

export interface CSVResult {
  ok: boolean;
  filePath?: string;
  error?: string;
}

// ==================== 辅助 ====================

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function productToCsvRow(p: Product): string {
  return [
    csvEscape(p.name),
    csvEscape(p.aliases ?? ''),
    p.price.toFixed(2),
    csvEscape(p.spec ?? ''),
    csvEscape(p.barcode ?? ''),
    csvEscape(p.category ?? ''),
    csvEscape(p.status),
    csvEscape(p.updatedAt),
    csvEscape(p.createdAt),
  ].join(',');
}

function priceHistoryToCsvRow(h: PriceHistory): string {
  return [
    csvEscape(h.changedAt),
    h.oldPrice.toFixed(2),
    h.newPrice.toFixed(2),
  ].join(',');
}

// ==================== 导出全部商品 ====================

/**
 * 导出全部未删除商品为 CSV 文件并分享。
 *
 * @param products 商品数组（通常从 exportProducts() 获取）
 */
export async function exportProductsCSV(
  products: Product[],
): Promise<CSVResult> {
  try {
    if (products.length === 0) {
      return { ok: false, error: '没有可导出的商品' };
    }

    const headers = ['名称', '别名', '价格', '规格', '条码', '分类', '状态', '更新时间', '创建时间'];
    const headerLine = headers.map(csvEscape).join(',');

    const lines = [
      '﻿' + headerLine,
      ...products.map(productToCsvRow),
    ];

    const csvContent = lines.join('\n');

    const fileName = `pstore-products-${new Date().toISOString().slice(0, 10)}.csv`;
    const filePath = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, csvContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      return { ok: true, filePath, error: '当前平台不支持分享功能，文件已保存到缓存' };
    }

    await Sharing.shareAsync(filePath, {
      mimeType: 'text/csv',
      dialogTitle: '导出商品数据',
      UTI: 'public.comma-separated-values-text',
    });

    return { ok: true, filePath };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ==================== 导出单个商品价格历史 ====================

/**
 * 导出单个商品的价格历史为 CSV 文件并分享。
 *
 * @param db         已打开的 SQLite 数据库
 * @param productId  商品 ID
 * @param productName 商品名称（用于文件名）
 */
export async function exportPriceHistoryCSV(
  db: unknown,
  productId: string,
  productName: string,
): Promise<CSVResult> {
  try {
    const sqliteDb = db as { getAllAsync: (...params: unknown[]) => Promise<unknown[]> };

    const rawHistory = await sqliteDb.getAllAsync(
      `SELECT * FROM price_history WHERE productId = ? ORDER BY changedAt DESC`,
      productId,
    );

    if (rawHistory.length === 0) {
      return { ok: false, error: '该商品暂无价格变更记录' };
    }

    const history: PriceHistory[] = rawHistory.map((row: unknown) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string,
        productId: r.productId as string,
        oldPrice: r.oldPrice as number,
        newPrice: r.newPrice as number,
        changedAt: r.changedAt as string,
      };
    });

    const headers = ['时间', '旧价格', '新价格'];
    const headerLine = headers.map(csvEscape).join(',');

    const lines = [
      '﻿' + headerLine,
      ...history.map(priceHistoryToCsvRow),
    ];

    const csvContent = lines.join('\n');

    const safeName = productName.replace(/[^一-鿿\w]/g, '_').slice(0, 20);
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `pstore-price-${safeName}-${dateStr}.csv`;
    const filePath = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, csvContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      return { ok: true, filePath, error: '当前平台不支持分享功能，文件已保存到缓存' };
    }

    await Sharing.shareAsync(filePath, {
      mimeType: 'text/csv',
      dialogTitle: `导出「${productName}」价格历史`,
      UTI: 'public.comma-separated-values-text',
    });

    return { ok: true, filePath };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
