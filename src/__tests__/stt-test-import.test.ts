import { describe, expect, it, vi } from 'vitest';

// Mock the modules first
const mockSecureStore = {
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
};

vi.mock('expo-secure-store', () => mockSecureStore);

vi.mock('../services/n1', () => ({
  getConfig: vi.fn(),
}));

global.fetch = vi.fn(async () =>
  Promise.resolve(new Response('', { status: 200, headers: { 'Content-Type': 'application/json' } })),
) as typeof fetch;

// Now import
import { useAIConfigStore } from '../store/aiConfig';
import { useSyncConfigStore } from '../store/syncConfig';

describe('aiConfig import test', () => {
  it('imports work', () => {
    expect(useAIConfigStore.getState().mode).toBe('search');
    expect(useSyncConfigStore.getState().serverUrl).toBeNull();
  });
});
