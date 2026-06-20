/**
 * 搜索单元测试
 *
 * 覆盖 escapeFts5 转义正确性以及 tokenize → escape 完整流水线。
 */

import { describe, expect, it } from 'vitest';
import { tokenizeChinese } from '../tokenizer';
import { escapeFts5 } from '../init';

describe('escapeFts5', () => {
  // ==================== spec §10.1 确定性示例 ====================

  it('含 FTS5 保留字符的 token 整体用双引号包裹', () => {
    // (550ml) 含括号 — FTS5 保留字符
    expect(escapeFts5('(550ml)')).toBe('"(550ml)"');
  });

  it('多 token 查询末尾追加 *', () => {
    // "可乐" 拆为 "可" "乐"，末尾 token "乐" 追加 *
    expect(escapeFts5('可 乐')).toBe('("可" "乐"*)');
  });

  it('空字符串返回空串', () => {
    expect(escapeFts5('')).toBe('');
  });

  // ==================== 转义边界 ====================

  it('含双引号的 token 被包裹', () => {
    // 单独的双引号在核心 token 中，FTS5_SPECIAL_RE 命中
    const result = escapeFts5('5"屏');
    // tokenize → ['5"屏']，单 token 含 " 保留字符
    expect(result).toBe('"5\\"屏"*');
  });

  it('含 - 的 token 被正确转义', () => {
    const result = escapeFts5('a-b');
    // 'a-b' 非 CJK，整个作为单 token，含 - 保留字符
    expect(result).toBe('"a-b"*');
  });

  // ==================== 已含通配符的处理 ====================

  it('末尾已有 * 不重复追加', () => {
    const result = escapeFts5('可乐*');
    // tokenize → ['可','乐*']，第二个 token 已有 *，不重复追加
    expect(result).toBe('"可" "乐"*');
  });

  // ==================== 流水线集成测试 ====================

  it('tokenize → escapeFts5 完整流水线', () => {
    const input = '农夫山泉500ml';
    const tokens = tokenizeChinese(input);
    expect(tokens).toEqual(['农', '夫', '山', '泉', '500ml']);

    const escaped = escapeFts5(input);
    // 每个 CJK token 加引号，末尾 500ml 追加 *
    expect(escaped).toBe('"农" "夫" "山" "泉" "500ml"*');
  });

  it('产品名称搜索流水线', () => {
    const input = '可口可乐';
    const escaped = escapeFts5(input);
    expect(escaped).toBe('"可" "口" "可" "乐"*');
  });

  it('含括号规格搜索流水线', () => {
    const input = '(550ml)';
    const escaped = escapeFts5(input);
    expect(escaped).toBe('"(550ml)"*');
  });
});
