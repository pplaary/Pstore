/**
 * 中文分词 (tokenize) 纯函数
 *
 * 将输入字符串拆分为 token 数组：
 * - CJK 字符（中日韩统一表意文字）按单字拆分
 * - 非 CJK 字符（字母、数字、标点、空格等）保持连续合并为一个 token
 *
 * CJK Unicode 区间：
 *   - 0x4E00 - 0x9FFF  (CJK Unified Ideographs)
 *   - 0x3400 - 0x4DBF  (CJK Unified Ideographs Extension A)
 *   - 0xF900 - 0xFAFF  (CJK Compatibility Ideographs)
 *
 * @example
 *   tokenizeChinese('百事可乐')      → ['百','事','可','乐']
 *   tokenizeChinese('可口可乐500ml') → ['可','口','可','乐','500ml']
 *   tokenizeChinese('农夫山泉(550ml)') → ['农','夫','山','泉','(550ml)']
 *   tokenizeChinese('你好,世界')    → ['你','好',',','世','界']
 *   tokenizeChinese('')             → []
 *
 * @param text 待分词的原始文本
 * @returns token 字符串数组
 */
export function tokenizeChinese(text: string): string[] {
  if (!text) {
    return [];
  }

  const tokens: string[] = [];
  let buffer = '';

  /** 判断字符是否在 CJK 范围内 */
  const isCJK = (cp: number): boolean =>
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0xf900 && cp <= 0xfaff);

  const flush = () => {
    if (buffer) {
      tokens.push(buffer);
      buffer = '';
    }
  };

  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i)!;

    if (isCJK(cp)) {
      // CJK 字符先 flush 非 CJK buffer，再单字加入
      flush();
      tokens.push(text[i]);
    } else {
      // 非 CJK 字符拼入 buffer
      buffer += text[i];
    }
  }

  // 末尾残留 buffer flush
  flush();

  return tokens;
}
