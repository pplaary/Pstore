declare module 'pinyin-pro' {
  export function pinyin(text: string, options?: Record<string, unknown>): string;
  export function match(text: string, pinyinStr: string): boolean;
  const mod: { pinyin: typeof pinyin; match: typeof match };
  export default mod;
}
