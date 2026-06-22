/**
 * AI 对话引擎 + 缓存管理单元测试
 *
 * 覆盖：ChatManager（FIFO 溢出、messages 格式、clear）、
 *        RAG buildRAGContext（Top 20、IN_SHOP 过滤）、
 *        AIResponseCache（5 分钟命中/过期、草稿 60 秒过期、evict）
 * spec-v4.5 §7、§7.4
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// ==================== Mock 模块 ====================

vi.mock('expo-sqlite', () => ({
  SQLiteDatabase: class MockDB {},
  openDatabaseAsync: vi.fn(),
}));

// ==================== RAG Mock（vi.hoisted 解决提升问题） ====================

const { mockSearchProducts } = vi.hoisted(() => ({
  mockSearchProducts: vi.fn(),
}));

vi.mock('../db/search', () => ({
  searchProducts: (...args: unknown[]) => mockSearchProducts(...args),
}));

// ==================== 导入源文件 ====================

import { ChatManager } from '../services/ai/chat';
import { buildRAGContext } from '../services/ai/rag';
import { AIResponseCache } from '../services/ai/cache';
import type { AIResponse, AIMessage, RAGContext } from '../services/ai';

// ==================== 测试工具 ====================

/** 构造 mock buildSystemPrompt，返回固定字符串 */
const mockBuildSystemPrompt = (): ((ctx: {
  cartSnapshot: string;
  mode: 'NORMAL' | 'ADMIN';
  productSummary: string;
}) => string) => {
  return vi.fn((ctx) => `[SYSTEM] mode=${ctx.mode} cart=${ctx.cartSnapshot} products=${ctx.productSummary}`);
};

/** 构造测试用 AIResponse */
const makeResponse = (overrides: Partial<AIResponse> = {}): AIResponse => ({
  action: 'addToCart',
  productId: 'p1',
  quantity: 1,
  message: 'test',
  confidence: 0.9,
  ...overrides,
});

// ==================== ChatManager ====================

describe('ChatManager', () => {
  let manager: ChatManager;

  beforeEach(() => {
    manager = new ChatManager(mockBuildSystemPrompt());
  });

  // ---- FIFO 溢出 ----

  it('空时 getRecentRounds 返回空数组', () => {
    expect(manager.getRecentRounds()).toEqual([]);
  });

  it('添加 12 轮后仅保留最近 10 轮（FIFO 溢出）', () => {
    for (let i = 0; i < 12; i++) {
      manager.addRound(`input-${i}`, makeResponse({ message: `response-${i}` }));
    }

    const rounds = manager.getRecentRounds();
    expect(rounds).toHaveLength(10);

    // 保留的是最后 10 轮（input-2 ~ input-11）
    expect(rounds[0].userInput).toBe('input-2');
    expect(rounds[9].userInput).toBe('input-11');
  });

  it('添加 10 轮时不溢出', () => {
    for (let i = 0; i < 10; i++) {
      manager.addRound(`input-${i}`, makeResponse());
    }

    expect(manager.getRecentRounds()).toHaveLength(10);
  });

  it('addRound 累积输入和响应', () => {
    manager.addRound('用户输入1', makeResponse({ action: 'search' }));
    manager.addRound('用户输入2', makeResponse({ action: 'addToCart', productId: 'p2' }));

    const rounds = manager.getRecentRounds();
    expect(rounds).toHaveLength(2);
    expect(rounds[0].userInput).toBe('用户输入1');
    expect(rounds[0].aiResponse.action).toBe('search');
    expect(rounds[1].userInput).toBe('用户输入2');
    expect(rounds[1].aiResponse.productId).toBe('p2');
  });

  // ---- buildMessages ----

  it('空历史时 messages 为 [system, user_current]', () => {
    const messages = manager.buildMessages('当前输入', '购物车为空', 'NORMAL', {
      summary: '商品库为空',
      productIds: [],
      totalHits: 0,
    });

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toBe('当前输入');
  });

  it('有历史时 messages 格式为 system → user/assistant 交替 → user_current', () => {
    manager.addRound('你好', makeResponse({ message: '你好！有什么可以帮你的？' }));
    manager.addRound('可乐多少钱', makeResponse({ message: '可乐 ¥3.00' }));

    const messages = manager.buildMessages('再给我来两瓶', '购物车为空', 'NORMAL', {
      summary: '商品库为空',
      productIds: [],
      totalHits: 0,
    });

    // system + 2轮(user+assistant) + current user = 6
    expect(messages).toHaveLength(6);

    // system
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('mode=NORMAL');

    // 历史第 1 轮
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toBe('你好');
    expect(messages[2].role).toBe('assistant');
    expect(messages[2].content).toContain('action');

    // 历史第 2 轮
    expect(messages[3].role).toBe('user');
    expect(messages[3].content).toBe('可乐多少钱');

    // 当前输入
    expect(messages[5].role).toBe('user');
    expect(messages[5].content).toBe('再给我来两瓶');
  });

  it('buildMessages 注入 cartSnapshot 和 mode', () => {
    const sysPromptFn = mockBuildSystemPrompt();
    const mgr = new ChatManager(sysPromptFn);

    mgr.buildMessages('test', '可乐×2', 'ADMIN', {
      summary: '可乐 ¥3.00',
      productIds: ['p1'],
      totalHits: 1,
    });

    expect(sysPromptFn).toHaveBeenCalledWith({
      cartSnapshot: '可乐×2',
      mode: 'ADMIN',
      productSummary: '可乐 ¥3.00',
    });
  });

  it('assistant 消息为 AIResponse 的 JSON 序列化', () => {
    manager.addRound('test', makeResponse({ action: 'ambiguous', confidence: 0.4 }));

    const messages = manager.buildMessages('test2', '', 'NORMAL', {
      summary: '',
      productIds: [],
      totalHits: 0,
    });

    const assistantMsg = messages.find((m) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();

    const parsed = JSON.parse(assistantMsg!.content);
    expect(parsed.action).toBe('ambiguous');
    expect(parsed.confidence).toBe(0.4);
  });

  // ---- clear ----

  it('clear 清空全部历史', () => {
    for (let i = 0; i < 5; i++) {
      manager.addRound(`input-${i}`, makeResponse());
    }

    expect(manager.getRecentRounds()).toHaveLength(5);

    manager.clear();
    expect(manager.getRecentRounds()).toHaveLength(0);
  });

  it('clear 后 buildMessages 仅含 system + user', () => {
    manager.addRound('之前的问题', makeResponse());
    manager.clear();

    const messages = manager.buildMessages('新问题', '', 'NORMAL', {
      summary: '',
      productIds: [],
      totalHits: 0,
    });

    expect(messages).toHaveLength(2);
    expect(messages.filter((m) => m.role === 'assistant')).toHaveLength(0);
  });

  // ---- getRecentRounds 参数 ----

  it('getRecentRounds(5) 返回最近 5 轮', () => {
    for (let i = 0; i < 7; i++) {
      manager.addRound(`input-${i}`, makeResponse());
    }

    const recent = manager.getRecentRounds(5);
    expect(recent).toHaveLength(5);
    expect(recent[0].userInput).toBe('input-2');
    expect(recent[4].userInput).toBe('input-6');
  });

  it('getRecentRounds 超过实际轮次时返回全部', () => {
    manager.addRound('a', makeResponse());
    manager.addRound('b', makeResponse());

    const all = manager.getRecentRounds(100);
    expect(all).toHaveLength(2);
  });
});

// ==================== buildRAGContext ====================

describe('buildRAGContext', () => {
  // ==================== 测试用商品 ====================

  const mockProducts = [
    {
      id: 'p1',
      name: '可乐',
      spec: '330ml',
      price: 3.00,
      status: 'IN_SHOP' as const,
    },
    {
      id: 'p2',
      name: '雪碧',
      spec: '330ml',
      price: 3.00,
      status: 'IN_SHOP' as const,
    },
    {
      id: 'p3',
      name: '橙汁',
      spec: '500ml',
      price: 5.00,
      status: 'OUT_OF_STOCK' as const,
    },
    {
      id: 'p4',
      name: '牛奶',
      spec: '1L',
      price: 8.00,
      status: 'TO_BE_PURCHASED' as const,
    },
  ];

  const mockDB = {
    getFirstAsync: vi.fn(),
  };

  beforeEach(() => {
    mockSearchProducts.mockReset();
  });

  // ---- 基本功能 ----

  it('返回 RAGContext 结构', async () => {
    mockSearchProducts.mockResolvedValue(mockProducts.slice(0, 2));

    const result = await buildRAGContext(mockDB as never, '可乐');

    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('productIds');
    expect(result).toHaveProperty('totalHits');
  });

  it('摘要格式：ID:{id} | {name} | {spec} | ¥{price} | [{status}]', async () => {
    mockSearchProducts.mockResolvedValue(mockProducts.slice(0, 1));

    const result = await buildRAGContext(mockDB as never, '可乐');
    expect(result.summary).toContain('ID:p1');
    expect(result.summary).toContain('可乐');
    expect(result.summary).toContain('330ml');
    expect(result.summary).toContain('¥3.00');
    expect(result.summary).toContain('在售');
  });

  it('调用 searchProducts 时传入 IN_SHOP 和 limit=20', async () => {
    mockSearchProducts.mockResolvedValue([]);

    await buildRAGContext(mockDB as never, 'test');

    expect(mockSearchProducts).toHaveBeenCalledTimes(1);
    const args = mockSearchProducts.mock.calls[0];
    expect(args[2]).toHaveProperty('status', 'IN_SHOP');
    expect(args[2]).toHaveProperty('limit', 20);
  });

  // ---- IN_SHOP 过滤 ----

  it('仅包含 IN_SHOP 商品（不含 OUT_OF_STOCK/TO_BE_PURCHASED）', async () => {
    // searchProducts 应该只返回 IN_SHOP 的结果（由 searchProducts 自己过滤）
    mockSearchProducts.mockResolvedValue(mockProducts.filter((p) => p.status === 'IN_SHOP'));

    const result = await buildRAGContext(mockDB as never, '饮料');

    expect(result.totalHits).toBe(2);
    expect(result.productIds).toEqual(['p1', 'p2']);
    result.productIds.forEach((id) => {
      const product = mockProducts.find((p) => p.id === id);
      expect(product!.status).toBe('IN_SHOP');
    });
  });

  it('productIds 长度 ≤ 20', async () => {
    const manyProducts = Array.from({ length: 25 }, (_, i) => ({
      id: `p${i}`,
      name: `商品${i}`,
      spec: '-',
      price: 1.0,
      status: 'IN_SHOP' as const,
    }));

    mockSearchProducts.mockResolvedValue(manyProducts.slice(0, 20));

    const result = await buildRAGContext(mockDB as never, '商品');
    expect(result.productIds.length).toBeLessThanOrEqual(20);
    expect(result.totalHits).toBeLessThanOrEqual(20);
  });

  // ---- 空商品库 ----

  it('商品库为空时摘要为"商品库中暂无匹配商品"', async () => {
    mockSearchProducts.mockResolvedValue([]);

    const result = await buildRAGContext(mockDB as never, '不存在的商品');
    expect(result.summary).toBe('商品库中暂无匹配商品');
    expect(result.productIds).toEqual([]);
    expect(result.totalHits).toBe(0);
  });

  // ---- summary 格式 ----

  it('多商品摘要用换行分隔', async () => {
    mockSearchProducts.mockResolvedValue(mockProducts.slice(0, 2));

    const result = await buildRAGContext(mockDB as never, '饮料');
    const lines = result.summary.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('ID:p1');
    expect(lines[1]).toContain('ID:p2');
  });

  it('无 spec 时显示 "-"', async () => {
    const productNoSpec = {
      id: 'p99',
      name: '面包',
      spec: '',
      price: 6.00,
      status: 'IN_SHOP' as const,
    };

    mockSearchProducts.mockResolvedValue([productNoSpec]);

    const result = await buildRAGContext(mockDB as never, '面包');
    expect(result.summary).toContain('| - |');
  });
});

// ==================== AIResponseCache ====================

describe('AIResponseCache', () => {
  let cache: AIResponseCache;
  const mockResponse = makeResponse({ message: 'cached response' });

  beforeEach(() => {
    cache = new AIResponseCache();
  });

  // ---- 缓存命中 ----

  it('set + get 5 分钟内命中', () => {
    cache.set('可乐多少钱', mockResponse);
    const result = cache.get('可乐多少钱');

    expect(result).not.toBeNull();
    expect(result!.action).toBe('addToCart');
    expect(result!.message).toBe('cached response');
  });

  it('trim 不影响缓存 key（忽略前后空格）', () => {
    cache.set('  可乐多少钱  ', mockResponse);
    expect(cache.get('可乐多少钱')).not.toBeNull();
    expect(cache.get('  可乐多少钱  ')).not.toBeNull();
  });

  it('不同输入独立缓存', () => {
    cache.set('可乐', makeResponse({ message: '可乐回复' }));
    cache.set('雪碧', makeResponse({ message: '雪碧回复' }));

    expect(cache.get('可乐')!.message).toBe('可乐回复');
    expect(cache.get('雪碧')!.message).toBe('雪碧回复');
  });

  // ---- 缓存过期 ----

  it('5 分钟后 get 返回 null', async () => {
    cache.set('test', mockResponse);

    // 使用 vi.useFakeTimers 模拟时间推进（替代不稳定的 Date spy）
    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000); // 超过 5 分钟
      expect(cache.get('test')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // ---- 草稿管理 ----

  it('setDraft + getDraft 60 秒内返回 expired: false', () => {
    cache.setDraft('可乐', mockResponse);
    const draft = cache.getDraft('可乐');

    expect(draft).not.toBeNull();
    expect(draft!.response.action).toBe('addToCart');
    expect(draft!.expired).toBe(false);
  });

  it('getDraft 60 秒后返回 expired: true', () => {
    cache.setDraft('可乐', mockResponse);

    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(60 * 1000 + 1000); // 超过 60 秒
      const draft = cache.getDraft('可乐');
      expect(draft).not.toBeNull();
      expect(draft!.expired).toBe(true);
      // 过期草稿仍可操作（不阻断交互）
      expect(draft!.response.action).toBe('addToCart');
    } finally {
      vi.useRealTimers();
    }
  });

  it('不存在的草稿 key 返回 null', () => {
    expect(cache.getDraft('不存在')).toBeNull();
  });

  it('过期草稿的响应数据仍可访问', () => {
    cache.setDraft('test', makeResponse({ quantity: 5, confidence: 0.8 }));
    const draft = cache.getDraft('test');

    expect(draft!.response.quantity).toBe(5);
    expect(draft!.response.confidence).toBe(0.8);
  });

  // ---- evict ----

  it('evict 清理过期缓存条目', () => {
    cache.set(' fresh ', mockResponse);

    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000); // 超过 5 分钟
      cache.evict();
      expect(cache.get(' fresh ')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('evict 不清理未过期条目', () => {
    cache.set('current', mockResponse);
    cache.evict();

    expect(cache.get('current')).not.toBeNull();
  });

  // ---- 覆盖 ----

  it('相同 key set 覆盖旧值', () => {
    cache.set('test', makeResponse({ message: 'first' }));
    cache.set('test', makeResponse({ message: 'second' }));

    expect(cache.get('test')!.message).toBe('second');
  });

  // ---- 边界 ----

  it('空输入可缓存', () => {
    cache.set('', mockResponse);
    expect(cache.get('')).not.toBeNull();
  });

  it('从未 set 过的 key 返回 null', () => {
    expect(cache.get('never-set')).toBeNull();
    expect(cache.getDraft('never-set')).toBeNull();
  });
});
