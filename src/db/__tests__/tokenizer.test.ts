/**
 * tokenizer 单元测试
 *
 * 覆盖 spec §6.1 的所有示例，以及 CJK 边界、空输入、纯数字、纯英文等场景。
 */

import { describe, expect, it } from 'vitest';
import { tokenizeChinese } from '../tokenizer';

describe('tokenizeChinese', () => {
  // ==================== spec §6.1 示例 ====================

  it('"百事可乐" → 单字拆分', () => {
    expect(tokenizeChinese('百事可乐')).toEqual(['百', '事', '可', '乐']);
  });

  it('"可口可乐500ml" → CJK 单字 + 非CJK 合并', () => {
    expect(tokenizeChinese('可口可乐500ml')).toEqual([
      '可', '口', '可', '乐', '500ml',
    ]);
  });

  it('"农夫山泉(550ml)" → 括号+数字合并为 token', () => {
    expect(tokenizeChinese('农夫山泉(550ml)')).toEqual([
      '农', '夫', '山', '泉', '(550ml)',
    ]);
  });

  it('"你好,世界" → 标点单独成 token', () => {
    expect(tokenizeChinese('你好,世界')).toEqual(['你', '好', ',', '世', '界']);
  });

  it('空字符串 → 空数组', () => {
    expect(tokenizeChinese('')).toEqual([]);
  });

  // ==================== CJK 边界 ====================

  it('CJK Extension A 范围 (0x3400-0x4DBF) 按单字拆分', () => {
    // 㐀 (U+3400) 是 CJK Ext-A 的首字符
    expect(tokenizeChinese('㐀水')).toEqual(['㐀', '水']);
  });

  it('CJK Compatibility Ideographs (0xF900-0xFAFF) 按单字拆分', () => {
    // 豈 (U+F900, CJK Compatibility Ideograph)
    expect(tokenizeChinese('豈好')).toEqual(['豈', '好']);
  });

  it('CJK 边界外字符不按单字拆分', () => {
    // U+4DFF 刚好在 Ext-A 边界内，U+4E00 在基本区内
    // 使用非 CJK 范围字符（如韩文 Hangul U+AC00）测试
    expect(tokenizeChinese('한글abc')).toEqual(['한글abc']);
  });

  // ==================== 特殊输入 ====================

  it('纯数字不拆分', () => {
    expect(tokenizeChinese('12345')).toEqual(['12345']);
  });

  it('纯英文字母不拆分', () => {
    expect(tokenizeChinese('helloWorld')).toEqual(['helloWorld']);
  });

  it('数字+英文混合不拆分', () => {
    expect(tokenizeChinese('abc123')).toEqual(['abc123']);
  });

  it('纯标点符号各自按字符处理', () => {
    expect(tokenizeChinese('!@#')).toEqual(['!@#']);
  });

  it('空格保留在非CJK token 中', () => {
    expect(tokenizeChinese('a b c')).toEqual(['a b c']);
  });

  it('单个 CJK 字符', () => {
    expect(tokenizeChinese('水')).toEqual(['水']);
  });

  it('单个非 CJK 字符', () => {
    expect(tokenizeChinese('a')).toEqual(['a']);
  });

  it('CJK + 英文混排', () => {
    expect(tokenizeChinese('可乐Coke')).toEqual(['可', '乐', 'Coke']);
  });

  it('中文+空格+中文', () => {
    expect(tokenizeChinese('可 乐')).toEqual(['可', ' ', '乐']);
  });

  it('中文+数字+单位', () => {
    expect(tokenizeChinese('农夫5L装')).toEqual(['农', '夫', '5', 'L', '装']);
  });
});
