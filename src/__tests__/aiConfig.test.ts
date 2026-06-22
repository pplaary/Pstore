/**
 * AI 配置 SecureStore 读写测试
 *
 * 测试 useAIConfigStore 中 SecureStore 的存储/读取/清除逻辑。
 * 覆盖 setAIConfig、clearAIConfig、detectReachability 缓存路径。
 * spec-v4.5 §7（AI 引擎）
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ==================== Mock 模块（vi.hoisted 解决提升问题） ====================

const { mockSecureStore, mockGetConfig } = vi.hoisted(() => {
  const _mockGetConfig = vi.fn();

  return {
    mockSecureStore: {
      getItemAsync: vi.fn(),
      setItemAsync: vi.fn(),
      deleteItemAsync: vi.fn(),
    },
    mockGetConfig: _mockGetConfig,
  };
});

vi.mock('expo-secure-store', () => mockSecureStore);
vi.mock('../services/n1', () => ({
  getConfig: mockGetConfig,
}));

// expo-av mock（aiConfig.ts 通过 stt.ts 间接依赖，防止 Rollup 解析 RN 原生模块报错）
vi.mock('expo-av', () => ({
  Audio: {
    requestPermissionsAsync: vi.fn(),
    setAudioModeAsync: vi.fn(),
    Recording: vi.fn(),
    RecordingOptionsPresets: { HIGH_QUALITY: {} },
    AndroidOutputFormat: { MPEG_4: 2 },
    AndroidAudioEncoder: { AAC: 3 },
    IOSOutputFormat: { MPEG4AAC: 1 },
  },
}));

// expo-file-system mock（stt.ts 依赖链）
vi.mock('expo-file-system', () => ({
  deleteAsync: vi.fn(),
  getInfoAsync: vi.fn(),
}));

global.fetch = vi.fn(async () =>
  Promise.resolve(new Response('', { status: 200, headers: { 'Content-Type': 'application/json' } })),
) as typeof fetch;

// ==================== 导入被测模块 ====================

import { useAIConfigStore } from '../store/aiConfig';
import { useSyncConfigStore } from '../store/syncConfig';

const AI_CONFIG_KEY = 'pstore_ai_config';

// ==================== 辅助函数 ====================

function makeConfig(overrides: Partial<{ apiUrl: string; apiKey: string; textModel: string }> = {}): {
  apiUrl: string;
  apiKey: string;
  textModel: string;
} {
  return {
    apiUrl: 'https://ai.example.com',
    apiKey: 'sk-test',
    textModel: 'gpt-4',
    ...overrides,
  };
}

function resetStore(): void {
  useAIConfigStore.setState({
    configured: false,
    reachable: false,
    mode: 'search',
    latencyTier: 'unknown',
    lastLatencyMs: null,
  });
  useSyncConfigStore.setState({
    serverUrl: null,
    lastSyncAt: null,
    lastPushAt: null,
    isSyncing: false,
  });
  vi.clearAllMocks();
  mockSecureStore.getItemAsync.mockResolvedValue(null);
  mockSecureStore.setItemAsync.mockResolvedValue(undefined);
  mockSecureStore.deleteItemAsync.mockResolvedValue(undefined);
  mockGetConfig.mockResolvedValue(null);
}

// ==================== 测试 ====================

describe('AI 配置 SecureStore 操作', () => {
  beforeEach(() => {
    resetStore();
  });

  // ---- setAIConfig ----

  describe('setAIConfig', () => {
    it('有效配置写入 SecureStore（JSON 序列化）', async () => {
      const config = makeConfig();
      await useAIConfigStore.getState().setAIConfig(config);

      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        AI_CONFIG_KEY,
        JSON.stringify(config),
      );
    });

    it('setAIConfig 后 store 状态为 configured=true', async () => {
      const config = makeConfig();
      await useAIConfigStore.getState().setAIConfig(config);

      expect(useAIConfigStore.getState().configured).toBe(true);
    });

    it('setAIConfig 后 mode 根据可达性设置', async () => {
      const config = makeConfig();
      await useAIConfigStore.getState().setAIConfig(config);

      // fetch HEAD /v1/models mock 返回 200 → reachable=true → mode='chat'
      expect(useAIConfigStore.getState().reachable).toBe(true);
      expect(useAIConfigStore.getState().mode).toBe('chat');
    });

    it('空 apiUrl 时清除 SecureStore', async () => {
      const badConfig = makeConfig({ apiUrl: '' });
      await useAIConfigStore.getState().setAIConfig(badConfig);

      expect(mockSecureStore.setItemAsync).not.toHaveBeenCalled();
      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith(AI_CONFIG_KEY);
      expect(useAIConfigStore.getState().configured).toBe(false);
    });

    it('空 apiKey 时清除 SecureStore', async () => {
      const badConfig = makeConfig({ apiKey: '' });
      await useAIConfigStore.getState().setAIConfig(badConfig);

      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith(AI_CONFIG_KEY);
      expect(useAIConfigStore.getState().configured).toBe(false);
    });

    it('空 textModel 时清除 SecureStore', async () => {
      const badConfig = makeConfig({ textModel: '' });
      await useAIConfigStore.getState().setAIConfig(badConfig);

      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith(AI_CONFIG_KEY);
      expect(useAIConfigStore.getState().configured).toBe(false);
    });
  });

  // ---- clearAIConfig ----

  describe('clearAIConfig', () => {
    it('清除 SecureStore 中的 AI 配置键', async () => {
      const config = makeConfig();
      await useAIConfigStore.getState().setAIConfig(config);
      vi.clearAllMocks();

      await useAIConfigStore.getState().clearAIConfig();

      expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith(AI_CONFIG_KEY);
    });

    it('清除后 store 状态重置为默认', async () => {
      const config = makeConfig();
      await useAIConfigStore.getState().setAIConfig(config);
      await useAIConfigStore.getState().clearAIConfig();

      const state = useAIConfigStore.getState();
      expect(state.configured).toBe(false);
      expect(state.reachable).toBe(false);
      expect(state.mode).toBe('search');
      expect(state.latencyTier).toBe('unknown');
      expect(state.lastLatencyMs).toBeNull();
    });
  });

  // ---- detectReachability 缓存路径 ----

  describe('detectReachability 缓存路径', () => {
    it('N1 在线时调用 getConfig 并缓存到 SecureStore', async () => {
      mockGetConfig.mockResolvedValue({
        apiUrl: 'https://ai.example.com',
        apiKey: 'sk-n1',
        textModel: 'gpt-3.5-turbo',
      });

      // 设置 N1 服务器 URL，使 detectReachability 进入 N1 路径
      useSyncConfigStore.getState().setServerUrl('http://192.168.1.1:3141');

      await useAIConfigStore.getState().detectReachability();

      expect(mockGetConfig).toHaveBeenCalledWith('http://192.168.1.1:3141');
      // N1 配置写入 SecureStore
      expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
        AI_CONFIG_KEY,
        expect.stringContaining('ai.example.com'),
      );
    });

    it('N1 返回空配置时降级为搜索模式', async () => {
      mockGetConfig.mockResolvedValue(null);
      useSyncConfigStore.getState().setServerUrl('http://192.168.1.1:3141');

      await useAIConfigStore.getState().detectReachability();

      expect(useAIConfigStore.getState().mode).toBe('search');
      expect(useAIConfigStore.getState().reachable).toBe(false);
      expect(useAIConfigStore.getState().configured).toBe(false);
    });

    it('N1 离线时尝试读取 SecureStore 缓存', async () => {
      // N1 在线 → getConfig 抛出异常 → 回退到 SecureStore
      mockGetConfig.mockRejectedValue(new Error('N1 unreachable'));

      // SecureStore 有缓存配置
      const cachedConfig = makeConfig();
      mockSecureStore.getItemAsync.mockImplementation((key: string) => {
        if (key === AI_CONFIG_KEY) return Promise.resolve(JSON.stringify(cachedConfig));
        return Promise.resolve(null);
      });

      useSyncConfigStore.getState().setServerUrl('http://192.168.1.1:3141');
      await useAIConfigStore.getState().detectReachability();

      // 应该读取缓存
      expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith(AI_CONFIG_KEY);
    });

    it('N1 离线且缓存为空时降级为搜索模式', async () => {
      mockGetConfig.mockRejectedValue(new Error('N1 unreachable'));
      mockSecureStore.getItemAsync.mockResolvedValue(null);

      useSyncConfigStore.getState().setServerUrl('http://192.168.1.1:3141');
      await useAIConfigStore.getState().detectReachability();

      const state = useAIConfigStore.getState();
      expect(state.configured).toBe(false);
      expect(state.reachable).toBe(false);
      expect(state.mode).toBe('search');
    });
  });

  describe('detectReachability 无 N1 路径', () => {
    it('serverUrl 为 null 时直接尝试 SecureStore 缓存', async () => {
      const cachedConfig = makeConfig();
      mockSecureStore.getItemAsync.mockImplementation((key: string) => {
        if (key === AI_CONFIG_KEY) return Promise.resolve(JSON.stringify(cachedConfig));
        return Promise.resolve(null);
      });

      // serverUrl 为 null（默认状态）
      await useAIConfigStore.getState().detectReachability();

      expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith(AI_CONFIG_KEY);
      expect(useAIConfigStore.getState().configured).toBe(true);
    });

    it('serverUrl 为 null 且缓存为空时降级为搜索模式', async () => {
      mockSecureStore.getItemAsync.mockResolvedValue(null);

      await useAIConfigStore.getState().detectReachability();

      const state = useAIConfigStore.getState();
      expect(state.configured).toBe(false);
      expect(state.mode).toBe('search');
    });
  });
});
