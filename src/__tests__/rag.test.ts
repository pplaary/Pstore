import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../db/search', () => ({
  searchProducts: vi.fn(),
}));

import { searchProducts } from '../db/search';
import { buildRAGContext } from '../services/ai/rag';

const mockProduct = (overrides: Record<string, unknown> = {}) => ({
  id: 'P001',
  name: '测试商品',
  spec: '500g',
  price: 29.9,
  status: 'IN_SHOP',
  ...overrides,
});

describe('buildRAGContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('匹配到商品时返回格式化摘要（格式包含 ID:xxx | name | spec | ¥price | [status]）', async () => {
    vi.mocked(searchProducts).mockResolvedValueOnce([
      mockProduct(),
      mockProduct({
        id: 'P002',
        name: '商品B',
        spec: '-',
        price: 15.5,
        status: 'OUT_OF_STOCK',
      }),
    ] as any);

    const result = await buildRAGContext({} as any, '测试');

    expect(result.totalHits).toBe(2);
    expect(result.summary).toContain('ID:P001');
    expect(result.summary).toContain('| 测试商品 | 500g | ¥29.90 | [在售]');
    expect(result.summary).toContain('ID:P002');
    expect(result.summary).toContain('| 商品B | - | ¥15.50 | [缺货]');
  });

  it('无匹配时返回 "商品库中暂无匹配商品"', async () => {
    vi.mocked(searchProducts).mockResolvedValueOnce([]);

    const result = await buildRAGContext({} as any, '不存在');

    expect(result.totalHits).toBe(0);
    expect(result.summary).toBe('商品库中暂无匹配商品');
  });

  it('productIds 正确映射', async () => {
    vi.mocked(searchProducts).mockResolvedValueOnce([
      mockProduct({ id: 'A1' }),
      mockProduct({ id: 'B2' }),
      mockProduct({ id: 'C3' }),
    ] as any);

    const result = await buildRAGContext({} as any, '测试');

    expect(result.productIds).toEqual(['A1', 'B2', 'C3']);
  });
});
