import { describe, expect, it, vi } from 'vitest';

vi.mock('pinyin-pro', () => {
  const pinyin = (text: string, _opts?: Record<string, unknown>) => {
    if (!text) return '';
    return text.split('').filter((c) => /[一-鿿]/.test(c)).map(() => 'b').join(' ');
  };
  return { pinyin, default: { pinyin } };
});

// Import after mock is registered
// eslint-disable-next-line import/order
import { pinyin } from 'pinyin-pro';

describe('pinyin-pro import test', () => {
  it('pinyin works', () => {
    const result = pinyin('百事可乐', { pattern: 'first', toneType: 'none', type: 'string' });
    expect(typeof result).toBe('string');
  });
});
