/**
 * Levenshtein 距离 + 归一化相似度工具
 *
 * 规范化流程（spec §5.7）：
 * 1. strip 两侧空格
 * 2. 转全小写
 * 3. 移除括号内容（removeBrackets 正则 /\([^)]*\)/g）
 * 4. 距离公式：distance / max(len(a), len(b))
 * 5. 相似度 = 1 - 归一化距离，返回值 ∈ [0, 1]
 * 6. 两个空字符串 → 1.0
 */

/** 移除所有括号及其内容，如 "(500ml)" → "" */
function removeBrackets(s: string): string {
  return s.replace(/\([^)]*\)/g, '');
}

/**
 * 计算归一化 Levenshtein 相似度。
 *
 * @param a 待比较字符串 A
 * @param b 待比较字符串 B
 * @returns 0~1 之间的相似度分数（1 = 完全相同）
 */
export function normalizedSimilarity(a: string, b: string): number {
  const sa = removeBrackets(a.trim().toLowerCase());
  const sb = removeBrackets(b.trim().toLowerCase());

  if (sa.length === 0 && sb.length === 0) return 1;

  const distance = levenshtein(sa, sb);
  return 1 - distance / Math.max(sa.length, sb.length);
}

/**
 * 经典 Levenshtein 编辑距离（动态规划）。
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // 只保留两行，空间 O(min(m,n))
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // 删除
        curr[j - 1] + 1,  // 插入
        prev[j - 1] + cost, // 替换
      );
    }
    // 交换引用，避免复制
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }

  return prev[n];
}
