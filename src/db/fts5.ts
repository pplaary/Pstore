/**
 * FTS5 搜索辅助函数
 *
 * 从 init.ts 提取出来，避免 search.test.ts 导入 init.ts 时触发
 * rollup 无法解析的动态 import(`./migrations/v${version}`) 语句。
 */

import { tokenizeChinese } from './tokenizer';

/**
 * 对 FTS5 查询词做转义处理。
 *
 * 策略：所有 token 均用双引号包裹。
 * 流程：
 * 1. 先用 tokenizeChinese 将输入拆分为 token
 * 2. 每个 token 用一对双引号包裹
 * 3. 多 token 时末尾追加 `*`（FTS5 前缀通配符），放在引号外右侧
 * 4. 多 token 结果用外括号包裹以实现 FTS5 AND 语义
 * 5. 若输入已含 `*`，保留原样不重复追加
 *
 * 确定性示例：
 *   escapeFts5('(550ml)')   → '"(550ml)"'
 *   escapeFts5('可乐')      → '("可" "乐"*)'
 *   escapeFts5('可乐*')     → '("可" "乐"*)'
 *   escapeFts5('')          → ''
 */
export function escapeFts5(query: string): string {
  const tokens = tokenizeChinese(query)
    .filter((t) => t.trim().length > 0);
  if (tokens.length === 0) return '';

  const quoted = tokens
    .map((token, _i) => {
      // 检查是否已有末尾通配符
      let core = token;
      let hasWildcard = false;
      if (token.endsWith('*')) {
        core = token.slice(0, -1);
        hasWildcard = true;
      }

      // 空 token 跳过（空格等）
      if (core.length === 0) return '';

      // 所有非空 token 均用双引号包裹
      if (hasWildcard) {
        return `"${core}"*`;
      }
      return `"${core}"`;
    })
    .filter((t) => t.length > 0);

  if (quoted.length === 0) return '';

  // 多 token：末尾追加 * 并用外括号包裹实现 AND 语义
  if (quoted.length > 1) {
    quoted[quoted.length - 1] = quoted[quoted.length - 1].replace(/"$/, '"*');
    return `(${quoted.join(' ')})`;
  }

  // 单 token：直接返回，不加 *
  return quoted[0];
}
