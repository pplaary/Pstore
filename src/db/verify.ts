/**
 * 自验证模块
 *
 * 逐项运行 tokenizer 与 escapeFts5 验证用例，
 * 返回 VerifyResult[] 供上层汇总展示。
 */

import type { VerifyResult } from './types';
import { tokenizeChinese } from './tokenizer';
import { escapeFts5 } from './init';

/**
 * 运行全部验证项，返回结果数组。
 * 所有单项 passed 的 AND 决定整体是否通过。
 */
export function runAll(): VerifyResult[] {
  const results: VerifyResult[] = [];

  // ==================== tokenizer 验证 ====================

  const tokenizerCases: [string, string[]][] = [
    ['百事可乐', ['百', '事', '可', '乐']],
    ['可口可乐500ml', ['可', '口', '可', '乐', '500ml']],
    ['农夫山泉(550ml)', ['农', '夫', '山', '泉', '(550ml)']],
    ['你好,世界', ['你', '好', ',', '世', '界']],
    ['', []],
  ];

  for (const [input, expected] of tokenizerCases) {
    const output = tokenizeChinese(input);
    const passed = arraysEqual(output, expected);
    results.push({
      test: `tokenizeChinese(${JSON.stringify(input)})`,
      passed,
      detail: passed
        ? '通过'
        : `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(output)}`,
    });
  }

  // ==================== escapeFts5 验证 ====================

  const escapeCases: [string, string][] = [
    ['(550ml)', '"(550ml)"'],
    ['可 乐', '("可" "乐"*)'],
  ];

  for (const [input, expected] of escapeCases) {
    const output = escapeFts5(input);
    const passed = output === expected;
    results.push({
      test: `escapeFts5(${JSON.stringify(input)})`,
      passed,
      detail: passed
        ? '通过'
        : `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(output)}`,
    });
  }

  return results;
}

// ==================== 工具函数 ====================

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}
