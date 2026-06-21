// Mock for pinyin-pro in vitest
export function pinyin(text: string, options?: Record<string, unknown>): string {
  if (!text) return '';
  return text
    .split('')
    .filter((c) => /[\u4e00-\u9fff]/.test(c))
    .map(() => 'b')
    .join(' ');
}

export default { pinyin };
