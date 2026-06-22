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

    const content = (await response.json()).choices?.[0]?.message?.content;

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
  } finally {
    clearTimeout(timeoutId);
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

  // action=addToCart 时 productId 必填
  if (obj.action === 'addToCart') {
    if (typeof obj.productId !== 'string' || obj.productId.length === 0) {
      return false;
    }
  } else {
    // 其他 action 下 productId 可选，若存在须为字符串
    if (obj.productId !== undefined && typeof obj.productId !== 'string') {
      return false;
    }
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
 * 中文数字预拦截。
 *
 * 在用户输入中识别中文数字并替换为阿拉伯数字。
 * 支持独立字（两→2、三→3…）、组合形式（二十三→23、三十→30）、
 * 半/打组合（半打→6）、以及百/千/万级。
 *
 * 算法：正则扫描所有数字字符位置，带 1-char lookahead。
 * 对「digit + 乘数单位(十/百/千/万)」做乘法合成。
 *
 * 返回处理后的文本和是否做过替换。
 */
export function interceptChineseNumerals(
  input: string,
): { text: string; replaced: boolean } {
  // 1. 字符级别映射
  const CHAR_MAP: Record<string, number> = {
    '零': 0, '〇': 0,
    '一': 1, '壹': 1,
    '二': 2, '贰': 2, '两': 2, '俩': 2,
    '三': 3, '叁': 3,
    '四': 4, '肆': 4,
    '五': 5, '伍': 5,
    '六': 6, '陆': 6,
    '七': 7, '柒': 7,
    '八': 8, '捌': 8,
    '九': 9, '玖': 9,
  };

  // 乘数单位：digit 后跟这些字 → 乘法
  const UNIT_MULT_MAP: Record<string, number> = {
    '十': 10, '拾': 10,
    '百': 100,
    '千': 1000,
    '万': 10000,
  };

  // 特殊组合：半 + 打 = 6
  const HALF_DOZEN = '半打';

  // 2. 先处理「半打」组合
  let result = input;
  let replaced = false;
  if (result.includes(HALF_DOZEN)) {
    result = result.replaceAll(HALF_DOZEN, '6');
    replaced = true;
  }

  // 3. 正则扫描数字字符 + 1-char lookahead
  //    匹配单个中文字符，后面跟一个字符（用于判断是否为单位字）
  const numeralChar = Object.keys(CHAR_MAP).concat(Object.keys(UNIT_MULT_MAP)).join('');
  const NUMERAL_SCAN_RE = new RegExp(`([${numeralChar}])(.)?`, 'g');

  result = result.replace(NUMERAL_SCAN_RE, (_full, ch, next) => {
    // 检查是否为乘数单位
    if (ch in UNIT_MULT_MAP) {
      // 十/百/千/万 自身映射（如 "十" → "10"）
      replaced = true;
      return String(UNIT_MULT_MAP[ch]);
    }

    // 检查是否为数字字
    if (ch in CHAR_MAP) {
      const digit = CHAR_MAP[ch];

      // 检查下一个字符是否为乘数单位 → 乘法合成
      if (next && next in UNIT_MULT_MAP) {
        replaced = true;
        return String(digit * UNIT_MULT_MAP[next]);
      }

      // 「零」在非结尾位置是分隔符，跳过
      if (digit === 0 && next) {
        return '';
      }

      // 普通数字字，直接替换
      replaced = true;
      return String(digit);
    }

    return _full;
  });

  return { text: result, replaced };
}
