/**
 * 搜索单元测试
 *
 * 覆盖 escapeFts5 转义正确性以及 tokenize → escape 完整流水线。
 * 对应 spec §6.2 全部确定性示例。
 */

import { describe, expect, it } from 'vitest';
import { tokenizeChinese } from '../tokenizer';
import { escapeFts5 } from '../fts5';

describe('escapeFts5', () => {
  // ==================== spec §6.2 确定性示例 ====================

  it('多 token：可 乐 → ("可" "乐"*)', () => {
    expect(escapeFts5('可 乐')).toBe('("可" "乐"*)');
  });

  it('多 token 无空格：可乐 → ("可" "乐"*)', () => {
    expect(escapeFts5('可乐')).toBe('("可" "乐"*)');
  });

  it('已含通配符：可乐* → ("可" "乐"*)', () => {
    expect(escapeFts5('可乐*')).toBe('("可" "乐"*)');
  });

  it('含括号单 token：(550ml) → "(550ml)"', () => {
    expect(escapeFts5('(550ml)')).toBe('"(550ml)"');
  });

  it('空字符串 → 空串', () => {
    expect(escapeFts5('')).toBe('');
  });

  // ==================== 转义边界 ====================

  it('含双引号的 CJK 分隔 token 各自被包裹', () => {
    // tokenizeChinese('5"屏') → ['5"', '屏']（非CJK " 与 CJK 屏 分属不同 token）
    const result = escapeFts5('5"屏');
    expect(result).toBe('("5"" "屏"*)');
  });

  it('含 - 的 token 被正确转义', () => {
    const result = escapeFts5('a-b');
    expect(result).toBe('"a-b"');
  });

  // ==================== 已含通配符的处理 ====================

  it('末尾已有 * 不重复追加', () => {
    const result = escapeFts5('可乐*');
    expect(result).toBe('("可" "乐"*)');
  });

  // ==================== 流水线集成测试 ====================

  it('tokenize → escapeFts5 完整流水线', () => {
    const input = '农夫山泉500ml';
    const tokens = tokenizeChinese(input);
    expect(tokens).toEqual(['农', '夫', '山', '泉', '500ml']);

    const escaped = escapeFts5(input);
    expect(escaped).toBe('("农" "夫" "山" "泉" "500ml"*)');
  });

  it('产品名称搜索流水线', () => {
    const input = '可口可乐';
    const escaped = escapeFts5(input);
    expect(escaped).toBe('("可" "口" "可" "乐"*)');
  });

  it('含括号规格搜索流水线', () => {
    const input = '(550ml)';
    const escaped = escapeFts5(input);
    expect(escaped).toBe('"(550ml)"');
  });
});
