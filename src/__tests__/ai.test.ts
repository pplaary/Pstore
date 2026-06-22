/**
 * AI 服务层单元测试
 *
 * 覆盖：buildSystemPrompt、callAI、parseAIResponse、interceptChineseNumerals
 * spec-v4.5 §7、§7.4、§14.2
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ==================== Mock 模块 ====================

vi.mock('expo-sqlite', () => ({
  SQLiteDatabase: class MockDB {},
  openDatabaseAsync: vi.fn(),
}));

// ==================== 导入源文件 ====================

import {
  buildSystemPrompt,
  callAI,
  parseAIResponse,
  interceptChineseNumerals,
} from '../services/ai';
import type { AIResponse, AIMessage } from '../services/ai';

// ==================== buildSystemPrompt ====================

describe('buildSystemPrompt', () => {
  it('输出包含 spec §7.2 核心指令块', () => {
    const result = buildSystemPrompt({
      cartSnapshot: '',
      mode: 'NORMAL',
      productSummary: '',
    });

    // 核心指令段必须包含
    expect(result).toContain('你是 PStore 商品查价助手');
    expect(result).toContain('匹配商品库');
    expect(result).toContain('输出结构化 JSON');
    expect(result).toContain('仅在售商品可选');
    expect(result).toContain('回复简洁');
  });

  it('注入购物车快照', () => {
    const result = buildSystemPrompt({
      cartSnapshot: '可乐 ×2\n鸡蛋 ×12',
      mode: 'NORMAL',
      productSummary: '',
    });

    expect(result).toContain('【购物车快照】');
    expect(result).toContain('可乐 ×2');
    expect(result).toContain('鸡蛋 ×12');
  });

  it('购物车为空时显示"购物车为空"', () => {
    const result = buildSystemPrompt({
      cartSnapshot: '',
      mode: 'NORMAL',
      productSummary: '',
    });

    expect(result).toContain('购物车为空');
  });

  it('注入管理模式标记', () => {
    const adminPrompt = buildSystemPrompt({
      cartSnapshot: '',
      mode: 'ADMIN',
      productSummary: '',
    });
    expect(adminPrompt).toContain('管理模式');

    const normalPrompt = buildSystemPrompt({
      cartSnapshot: '',
      mode: 'NORMAL',
      productSummary: '',
    });
    expect(normalPrompt).toContain('普通模式');
  });

  it('注入商品库摘要', () => {
    const summary = 'ID:p1 | 可乐 | 330ml | ¥3.00 | [在售]\nID:p2 | 雪碧 | 330ml | ¥3.00 | [在售]';
    const result = buildSystemPrompt({
      cartSnapshot: '',
      mode: 'NORMAL',
      productSummary: summary,
    });

    expect(result).toContain('【商品库摘要】');
    expect(result).toContain(summary);
  });

  it('输出为多行字符串', () => {
    const result = buildSystemPrompt({
      cartSnapshot: '',
      mode: 'NORMAL',
      productSummary: '',
    });

    const lines = result.split('\n');
    // 应有：空行、核心指令、空行、购物车快照、空行、当前模式、空行、商品库摘要
    expect(lines.length).toBeGreaterThanOrEqual(7);
  });
});

// ==================== interceptChineseNumerals ====================

describe('interceptChineseNumerals', () => {
  // 基础数字字
  it('两/二→2', () => {
    expect(interceptChineseNumerals('两瓶').text).toBe('2瓶');
    expect(interceptChineseNumerals('二瓶').text).toBe('2瓶');
  });

  it('三→3、四→4、五→5、六→6、七→7、八→8、九→9', () => {
    expect(interceptChineseNumerals('三瓶').text).toBe('3瓶');
    expect(interceptChineseNumerals('四瓶').text).toBe('4瓶');
    expect(interceptChineseNumerals('五瓶').text).toBe('5瓶');
    expect(interceptChineseNumerals('六瓶').text).toBe('6瓶');
    expect(interceptChineseNumerals('七瓶').text).toBe('7瓶');
    expect(interceptChineseNumerals('八瓶').text).toBe('8瓶');
    expect(interceptChineseNumerals('九瓶').text).toBe('9瓶');
  });

  it('一→1、零→0', () => {
    expect(interceptChineseNumerals('一瓶').text).toBe('1瓶');
    expect(interceptChineseNumerals('零瓶').text).toBe('0瓶');
  });

  // 十的组合
  it('十→10', () => {
    const result = interceptChineseNumerals('十瓶');
    expect(result.text).toBe('10瓶');
    expect(result.replaced).toBe(true);
  });

  it('二十三→23（十位 + 个位组合）', () => {
    const result = interceptChineseNumerals('二十三瓶');
    expect(result.text).toBe('23瓶');
    expect(result.replaced).toBe(true);
  });

  it('三十→30', () => {
    const result = interceptChineseNumerals('三十瓶');
    expect(result.text).toBe('30瓶');
    expect(result.replaced).toBe(true);
  });

  it('十五→15', () => {
    const result = interceptChineseNumerals('十五瓶');
    expect(result.text).toBe('15瓶');
    expect(result.replaced).toBe(true);
  });

  // 百/千/万组合
  it('百→100、千→1000、万→10000', () => {
    expect(interceptChineseNumerals('百').text).toBe('100');
    expect(interceptChineseNumerals('千').text).toBe('1000');
    expect(interceptChineseNumerals('万').text).toBe('10000');
  });

  it('半打→6（半+打组合）', () => {
    const result = interceptChineseNumerals('半打鸡蛋');
    expect(result.text).toBe('6鸡蛋');
    expect(result.replaced).toBe(true);
  });

  // 无替换
  it('普通文本不替换', () => {
    const result = interceptChineseNumerals('普通可乐');
    expect(result.text).toBe('普通可乐');
    expect(result.replaced).toBe(false);
  });

  it('英文数字不替换', () => {
    const result = interceptChineseNumerals('2瓶可乐');
    expect(result.text).toBe('2瓶可乐');
    expect(result.replaced).toBe(false);
  });

  // 边缘情况
  it('空字符串返回空', () => {
    const result = interceptChineseNumerals('');
    expect(result.text).toBe('');
    expect(result.replaced).toBe(false);
  });

  it('只含中文数字', () => {
    expect(interceptChineseNumerals('两').text).toBe('2');
    expect(interceptChineseNumerals('半').text).toBe('半'); // 半单独不是半打
  });

  it('中文大写数字兼容', () => {
    expect(interceptChineseNumerals('壹瓶').text).toBe('1瓶');
    expect(interceptChineseNumerals('贰瓶').text).toBe('2瓶');
    expect(interceptChineseNumerals('拾').text).toBe('10');
    expect(interceptChineseNumerals('佰').text).toBe('100');
  });

  it('replaced 标志正确', () => {
    const r1 = interceptChineseNumerals('普通文本');
    expect(r1.replaced).toBe(false);

    const r2 = interceptChineseNumerals('两瓶');
    expect(r2.replaced).toBe(true);
  });
});

// ==================== parseAIResponse ====================

describe('parseAIResponse', () => {
  // Mock SQLite database
  // expo-sqlite getFirstAsync signature: getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | undefined>
  const createMockDB = (existsProductId: string | null = null) => ({
    getFirstAsync: vi.fn(async (_sql: string, ...params: unknown[]) => {
      const productId = params[0] as string;
      if (existsProductId && productId === existsProductId) {
        return { count: 1 };
      }
      return { count: 0 };
    }),
  });

  // 标准有效响应
  const validResponse: AIResponse = {
    action: 'addToCart',
    productId: 'prod-123',
    quantity: 2,
    message: '已识别：可乐 ×2',
    confidence: 0.95,
  };

  // ---- 标准 JSON 解析 ----

  it('正确解析标准 JSON 回复', async () => {
    const mockDB = createMockDB('prod-123');
    const result = await parseAIResponse(mockDB, JSON.stringify(validResponse));

    expect(result).not.toBeNull();
    expect(result!.action).toBe('addToCart');
    expect(result!.productId).toBe('prod-123');
    expect(result!.quantity).toBe(2);
    expect(result!.message).toBe('已识别：可乐 ×2');
    expect(result!.confidence).toBe(0.95);
  });

  // ---- 必填字段校验 ----

  it('缺少 action 字段返回 null', async () => {
    const bad = { ...validResponse, action: undefined as unknown as string };
    const mockDB = createMockDB('prod-123');
    const result = await parseAIResponse(mockDB, JSON.stringify(bad));
    expect(result).toBeNull();
  });

  it('非法 action 值返回 null', async () => {
    const bad = { ...validResponse, action: 'delete' };
    const mockDB = createMockDB('prod-123');
    const result = await parseAIResponse(mockDB, JSON.stringify(bad));
    expect(result).toBeNull();
  });

  it('action=addToCart 缺少 productId 返回 null', async () => {
    const bad = { ...validResponse, productId: '' };
    const mockDB = createMockDB('prod-123');
    const result = await parseAIResponse(mockDB, JSON.stringify(bad));
    expect(result).toBeNull();
  });

  it('quantity 非整数返回 null', async () => {
    const bad = { ...validResponse, quantity: 1.5 };
    const mockDB = createMockDB('prod-123');
    const result = await parseAIResponse(mockDB, JSON.stringify(bad));
    expect(result).toBeNull();
  });

  it('quantity < 1 返回 null', async () => {
    const bad = { ...validResponse, quantity: 0 };
    const mockDB = createMockDB('prod-123');
    const result = await parseAIResponse(mockDB, JSON.stringify(bad));
    expect(result).toBeNull();
  });

  it('confidence 超出 [0,1] 返回 null', async () => {
    const bad = { ...validResponse, confidence: 1.5 };
    const mockDB = createMockDB('prod-123');
    const result = await parseAIResponse(mockDB, JSON.stringify(bad));
    expect(result).toBeNull();
  });

  it('缺少 message 字段返回 null', async () => {
    const bad = { ...validResponse, message: undefined as unknown as string };
    const mockDB = createMockDB('prod-123');
    const result = await parseAIResponse(mockDB, JSON.stringify(bad));
    expect(result).toBeNull();
  });

  // ---- 非 JSON 输入 ----

  it('纯文本返回 null', async () => {
    const mockDB = createMockDB();
    const result = await parseAIResponse(mockDB, '这是一段普通文本回复');
    expect(result).toBeNull();
  });

  it('空字符串返回 null', async () => {
    const mockDB = createMockDB();
    const result = await parseAIResponse(mockDB, '');
    expect(result).toBeNull();
  });

  // ---- Markdown 代码块提取 ----

  it('从 markdown 代码块中提取 JSON', async () => {
    const mockDB = createMockDB('prod-123');
    const raw = '```json\n' + JSON.stringify(validResponse) + '\n```';
    const result = await parseAIResponse(mockDB, raw);

    expect(result).not.toBeNull();
    expect(result!.action).toBe('addToCart');
    expect(result!.productId).toBe('prod-123');
  });

  it('markdown 代码块内 JSON 不合法返回 null', async () => {
    const mockDB = createMockDB();
    const raw = '```json\n{ invalid json\n```';
    const result = await parseAIResponse(mockDB, raw);
    expect(result).toBeNull();
  });

  it('无 markdown 标记的非 JSON 文本返回 null', async () => {
    const mockDB = createMockDB();
    const result = await parseAIResponse(mockDB, 'some response without json');
    expect(result).toBeNull();
  });

  // ---- productId 本地校验 ----

  it('不存在的 productId 返回 null', async () => {
    const mockDB = createMockDB(null); // 商品不存在
    const resp: AIResponse = {
      ...validResponse,
      productId: 'nonexistent-id',
    };
    const result = await parseAIResponse(mockDB, JSON.stringify(resp));
    expect(result).toBeNull();
  });

  it('空 productId 且 action=addToCart 返回 null', async () => {
    const mockDB = createMockDB(null);
    const resp: AIResponse = {
      action: 'addToCart',
      productId: '',
      quantity: 1,
      message: '',
      confidence: 0,
    };
    const result = await parseAIResponse(mockDB, JSON.stringify(resp));
    expect(result).toBeNull();
  });

  // ---- search/ambiguous/notFound 无需 productId ----

  it('action=search 且无 productId 解析成功', async () => {
    const resp: AIResponse = {
      action: 'search',
      quantity: 1,
      message: '请提供更多信息',
      confidence: 0.3,
    };
    const mockDB = createMockDB();
    const result = await parseAIResponse(mockDB, JSON.stringify(resp));
    expect(result).not.toBeNull();
    expect(result!.action).toBe('search');
    expect(result!.productId).toBeUndefined();
  });

  it('action=ambiguous 解析成功', async () => {
    const resp: AIResponse = {
      action: 'ambiguous',
      quantity: 1,
      message: '可能是可乐或雪碧，请确认',
      confidence: 0.5,
    };
    const mockDB = createMockDB();
    const result = await parseAIResponse(mockDB, JSON.stringify(resp));
    expect(result).not.toBeNull();
    expect(result!.action).toBe('ambiguous');
  });

  it('action=notFound 解析成功', async () => {
    const resp: AIResponse = {
      action: 'notFound',
      quantity: 1,
      message: '商品库中未找到匹配商品',
      confidence: 0,
    };
    const mockDB = createMockDB();
    const result = await parseAIResponse(mockDB, JSON.stringify(resp));
    expect(result).not.toBeNull();
    expect(result!.action).toBe('notFound');
  });
});

// ==================== callAI ====================

describe('callAI', () => {
  it('成功时返回 AI 回复文本', async () => {
    const mockResponse = JSON.stringify({
      choices: [{ message: { content: '{"action":"search","quantity":1,"message":"请确认","confidence":0.5}' } }],
    });

    global.fetch = vi.fn(async () =>
      Promise.resolve(new Response(mockResponse, { status: 200, headers: { 'Content-Type': 'application/json' } })),
    ) as typeof fetch;

    const result = await callAI(
      { apiUrl: 'https://api.example.com', apiKey: 'test-key', textModel: 'gpt-4' },
      [{ role: 'user', content: '测试' }],
    );

    expect(result).toBe('{"action":"search","quantity":1,"message":"请确认","confidence":0.5}');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('HTTP 错误返回 null', async () => {
    global.fetch = vi.fn(async () =>
      Promise.resolve(new Response('error', { status: 500 })),
    ) as typeof fetch;

    const result = await callAI(
      { apiUrl: 'https://api.example.com', apiKey: 'test-key', textModel: 'gpt-4' },
      [{ role: 'user', content: '测试' }],
    );

    expect(result).toBeNull();
  });

  it('网络异常返回 null', async () => {
    global.fetch = vi.fn(async () => Promise.reject(new Error('Network error'))) as typeof fetch;

    const result = await callAI(
      { apiUrl: 'https://api.example.com', apiKey: 'test-key', textModel: 'gpt-4' },
      [{ role: 'user', content: '测试' }],
    );

    expect(result).toBeNull();
  });

  it('请求体格式正确（含 model + messages + max_tokens）', async () => {
    let capturedBody: string | null = null;

    global.fetch = vi.fn(async (_url: string, options: RequestInit) => {
      capturedBody = options.body as string;
      return Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
          status: 200,
        }),
      );
    }) as typeof fetch;

    await callAI(
      { apiUrl: 'https://api.example.com', apiKey: 'test-key', textModel: 'gpt-4' },
      [{ role: 'system', content: '你是一个助手' }, { role: 'user', content: '你好' }],
    );

    expect(capturedBody).not.toBeNull();
    const body = JSON.parse(capturedBody!);
    expect(body.model).toBe('gpt-4');
    expect(body.messages).toHaveLength(2);
    expect(body.max_tokens).toBe(500);
  });
});
