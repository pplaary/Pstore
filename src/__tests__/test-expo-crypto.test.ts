import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  randomUUID: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  }),
  default: { randomUUID: vi.fn() },
}));

// Import after mock is registered
// eslint-disable-next-line import/order
import { randomUUID } from 'expo-crypto';

describe('expo-crypto import test', () => {
  it('randomUUID returns a string', () => {
    const id = randomUUID();
    expect(typeof id).toBe('string');
  });
});
