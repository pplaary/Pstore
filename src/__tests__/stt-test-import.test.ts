import { describe, expect, it, vi } from 'vitest';

// Mock the modules first (vi.hoisted for vi.mock hoisting safety)
const { mockSecureStore } = vi.hoisted(() => ({
  mockSecureStore: {
    getItemAsync: vi.fn(),
    setItemAsync: vi.fn(),
    deleteItemAsync: vi.fn(),
  },
}));

vi.mock('expo-secure-store', () => mockSecureStore);

// expo-av mock（aiConfig.ts 通过 stt.ts 间接依赖）
vi.mock('expo-av', () => ({
  Audio: {
    requestPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
    setAudioModeAsync: vi.fn(async () => {}),
    Recording: vi.fn(() => ({
      prepareToRecordAsync: vi.fn(async () => {}),
      startAsync: vi.fn(async () => {}),
      stopAndUnloadAsync: vi.fn(async () => {}),
      getStatusAsync: vi.fn(async () => ({ isDoneRecording: true, durationMillis: 600 })),
      getURI: vi.fn(() => 'file:///tmp/test.m4a'),
    })),
    RecordingOptionsPresets: { HIGH_QUALITY: { android: {}, ios: {} } },
    AndroidOutputFormat: { MPEG_4: 2 },
    AndroidAudioEncoder: { AAC: 3 },
    IOSOutputFormat: { MPEG4AAC: 1 },
  },
}));

// expo-file-system mock
vi.mock('expo-file-system', () => ({
  deleteAsync: vi.fn(async () => {}),
  getInfoAsync: vi.fn(async () => ({ exists: true })),
}));

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
