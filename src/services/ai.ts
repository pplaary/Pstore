/**
 * AI 文本服务层
 *
 * 调用 AI 文本模型 API（OpenAI 兼容格式）进行自然语言商品查价。
 * 超时 10s（spec §14.2），失败时返回 null 由上层降级。
 *
 * spec-v4.5 §7（AI 引擎）、§7.4（保护机制）、§14.2（错误处理）
 */

import * as SQLite from 'expo-sqlite';

// ==================== 类型 ====================

/** AI 文本模型配置 */
export interface AITextConfig {
  apiUrl: string;
  apiKey: string;
  textModel: string;
}

/** AI 结构化回复 */
export interface AIResponse {
  action: 'addToCart' | 'search' | 'ambiguous' | 'notFound';
  productId?: string;
  quantity: number;
  message: string;
  confidence: number;
}

/** AI 消息格式 */
export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ==================== 常量 ====================

const TIMEOUT_MS = 10_000; // spec §14.2: AI API 超时 10s

/** spec §7.2 System Prompt 核心指令块 */
const SYSTEM_PROMPT_CORE = `你是 PStore 商品查价助手。
职责：理解自然语言（查价/数量），匹配商品库。
做法：匹配商品库（名称/别名/拼音/模糊），输出结构化 JSON。
约束：不确定时列候选项；回复简洁≤3句；仅在售商品可选。`;

// ==================== 1. buildSystemPrompt ====================

/**
 * 构造 System Prompt。
 *
 * 注入上下文：购物车快照 + 当前模式（普通/管理）+ RAG 商品摘要
 * 拼接 spec §7.2 的核心指令块。
 */
export function buildSystemPrompt(context: {
  cartSnapshot: string;
  mode: 'NORMAL' | 'ADMIN';
  productSummary: string;
}): string {
  const lines: string[] = [SYSTEM_PROMPT_CORE];

  lines.push('');
  lines.push('【购物车快照】');
  lines.push(context.cartSnapshot || '购物车为空');

  lines.push('');
  lines.push('【当前模式】');
  lines.push(context.mode === 'ADMIN' ? '管理模式' : '普通模式');

  lines.push('');
  lines.push('【商品库摘要】（仅在售商品）');
  lines.push(context.productSummary);

  return lines.join('\n');
}

// ==================== 2. callAI ====================

/**
 * 调用 AI 文本模型（OpenAI 兼容格式）。
 *
 * 超时 10s，失败返回 null。
 * 超时/网络错误 → 返回 null，由上层降级为 FTS5 搜索。
 */
export async function callAI(
  config: AITextConfig,
  messages: AIMessage[],
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const url = `${config.apiUrl}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.textModel,
        messages,
        max_tokens: 500,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`AI text API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return null;
    }

    return content as string;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn('AI text API timeout');
    } else {
      console.warn('AI text API failed:', err);
    }
    return null;
  }
}

// ==================== 3. parseAIResponse ====================

/**
 * 解析 AI 回复 JSON。
 *
 * 提取 { action, productId, quantity, message, confidence }。
 * 解析失败或缺少必填字段 → 返回 null。
 * productId 存在时进行本地校验（查 product 表确认 ID 存在且未删除）。
 */
export async function parseAIResponse(
  db: SQLite.SQLiteDatabase,
  raw: string,
): Promise<AIResponse | null> {
  // 1. 尝试直接 JSON.parse
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 2. 尝试从 markdown 代码块提取
    const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        parsed = JSON.parse(codeBlockMatch[1].trim());
      } catch {
        return null;
      }
    } else {
      return null;
    }
  }

  // 3. 验证必需字段
  if (!isValidAIResponse(parsed)) {
    return null;
  }

  const resp = parsed as AIResponse;

  // 4. productId 本地校验
  if (resp.productId) {
    const exists = await isProductValid(db, resp.productId);
    if (!exists) {
      return null;
    }
  }

  return resp;
}

/**
 * 校验对象是否符合 AIResponse 结构。
 */
function isValidAIResponse(value: unknown): value is AIResponse {
  if (typeof value !== 'object' || value === null) return false;

  const obj = value as Record<string, unknown>;

  // action 必填且合法
  if (
    !['addToCart', 'search', 'ambiguous', 'notFound'].includes(obj.action as string)
  ) {
    return false;
  }

  // productId 可选，若存在须为字符串
  if (obj.productId !== undefined && typeof obj.productId !== 'string') {
    return false;
  }

  // quantity 必填且为正整数
  if (
    typeof obj.quantity !== 'number' ||
    obj.quantity < 1 ||
    !Number.isInteger(obj.quantity)
  ) {
    return false;
  }

  // message 必填且为字符串
  if (typeof obj.message !== 'string') {
    return false;
  }

  // confidence 必填且在 [0, 1]
  if (typeof obj.confidence !== 'number' || obj.confidence < 0 || obj.confidence > 1) {
    return false;
  }

  return true;
}

/**
 * 检查商品 ID 是否存在且未软删除。
 */
async function isProductValid(
  db: SQLite.SQLiteDatabase,
  productId: string,
): Promise<boolean> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(1) as count FROM product WHERE id = ? AND isDeleted = 0',
    productId,
  );
  return (row?.count ?? 0) > 0;
}

// ==================== 4. interceptChineseNumerals ====================

/**
 * 中文数字映射：独立字/词 → 阿拉伯数字
 */
const NUMERAL_MAP: Record<string, string> = {
  '零': '0',
  '〇': '0',
  '一': '1',
  '壹': '1',
  '二': '2',
  '贰': '2',
  '两': '2',
  '俩': '2',
  '三': '3',
  '叁': '3',
  '四': '4',
  '肆': '4',
  '五': '5',
  '伍': '5',
  '六': '6',
  '陆': '6',
  '七': '7',
  '柒': '7',
  '八': '8',
  '捌': '8',
  '九': '9',
  '玖': '9',
  '十': '10',
  '拾': '10',
  '廿': '20',
  '半': '0.5',
  '打': '12',
};

/**
 * 组合型数字前缀：2-4 字前缀 → 数值
 *
 * 长前缀在前，确保优先匹配（如「二十三」先匹配「二十」而非「二」）。
 */
const COMBINATION_PREFIXES: [string, number][] = [
  ['一万', 10000],
  ['二千', 2000],
  ['两千', 2000],
  ['一千', 1000],
  ['九百', 900],
  ['八百', 800],
  ['七百', 700],
  ['六百', 600],
  ['五百', 500],
  ['四百', 400],
  ['三百', 300],
  ['两百', 200],
  ['二百', 200],
  ['一百', 100],
  ['九十', 90],
  ['八十', 80],
  ['七十', 70],
  ['六十', 60],
  ['五十', 50],
  ['四十', 40],
  ['三十', 30],
  ['二十', 20],
];

/**
 * 正则：组合前缀（最长优先）+ 单个数字字
 *
 * 使用 matchAll 全局扫描，每个位置匹配最长前缀或单个字。
 */
const NUMERAL_REGEX = new RegExp(
  '(?:' +
    COMBINATION_PREFIXES.map(([w]) => w).join('|') +
    ')|[零〇一二三四五六七八九十壹贰叁肆伍陆柒捌玖拾廿半打]',
  'g',
);

/**
 * 中文数字预拦截。
 *
 * 在用户输入中识别中文数字并替换为阿拉伯数字。
 * 两/二→2、三→3、...、十→10、半→0.5、打→12。
 * 支持组合形式（如「二十三」→23、「半打」→0.5×12=6）。
 *
 * 返回处理后的文本和是否做过替换。
 */
export function interceptChineseNumerals(
  input: string,
): { text: string; replaced: boolean } {
  let replaced = false;
  const result = input.replace(NUMERAL_REGEX, (match) => {
    // 先检查组合前缀
    const combo = COMBINATION_PREFIXES.find(([w]) => match === w);
    if (combo) {
      replaced = true;
      return String(combo[1]);
    }
    // 再检查独立映射
    const mapped = NUMERAL_MAP[match];
    if (mapped) {
      replaced = true;
      return mapped;
    }
    return match;
  });

  return { text: result, replaced };
}
