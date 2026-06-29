/**
 * AI 配置 Zustand Store
 *
 * 管理 AI 服务的配置状态、可达性检测、模式切换和延迟色标。
 * 符合 plan-phase6.md §1.2 和 spec-v4.5 §7（AI 引擎）。
 *
 * 检测逻辑（spec §7.1 降级逻辑）：
 *   App 启动 → detectReachability()
 *     ├─ N1 在线 → 拉取 AI 配置 → HEAD /v1/models → 可达？
 *     │   ├─ 可达 → mode='chat', reachable=true
 *     │   └─ 不可达 → mode='search', reachable=false
 *     ├─ N1 离线 + SecureStore 有缓存 → HEAD 缓存地址 → 可达？
 *     │   ├─ 可达 → mode='chat', reachable=true
 *     │   └─ 不可达 → mode='search', reachable=false
 *     └─ 无配置 → mode='search', reachable=false, configured=false
 *
 * AI 配置本地加密缓存使用 expo-secure-store，键名 pstore_ai_config。
 * N1 短暂故障时可临时直连 AI（读缓存地址）。
 */

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { AITextConfig } from '../services/ai';
import { useSyncConfigStore } from '../store/syncConfig';
import { getConfig, type ConfigGetResult } from '../services/n1';
import { requestAudioPermission } from '../services/stt';

// ==================== 常量 ====================

/** SecureStore 缓存键名 */
const AI_CONFIG_KEY = 'pstore_ai_config';

/** 延迟色标阈值（ms） */
const LATENCY_GREEN_MS = 1000;   // < 1s → green
const LATENCY_YELLOW_MS = 3000;  // 1-3s → yellow
// > 3s → red

// ==================== 类型 ====================

export type LatencyTier = 'green' | 'yellow' | 'red' | 'unknown';
export type AIMode = 'chat' | 'search';

export interface AIConfigState {
  /** AI 是否已配置 */
  configured: boolean;
  /** API 是否可达 */
  reachable: boolean;
  /** 当前模式：chat（AI 驱动）或 search（FTS5 直搜） */
  mode: AIMode;
  /** AI API 延迟色标：green / yellow / red / unknown */
  latencyTier: LatencyTier;
  /** 最近一次延迟（ms） */
  lastLatencyMs: number | null;
  /** 麦克风权限是否已授权 */
  micPermissionGranted: boolean;
  /** 完整的 AI 配置（含 textModel 和 visionModel） */
  aiConfig: ConfigGetResult | null;

  // Derived
  /** 语音按钮是否可用：mode=chat && reachable && micPermissionGranted */
  isVoiceAvailable: boolean;

  // Actions
  /** App 启动时调用：检测 AI 配置可达性 */
  detectReachability: () => Promise<void>;
  /** 更新延迟色标 */
  updateLatency: (ms: number) => void;
  /** 设置 AI 配置（从 N1 或手动输入），同时写入 SecureStore 缓存 */
  setAIConfig: (config: AITextConfig) => Promise<void>;
  /** 清除 AI 配置和 SecureStore 缓存 */
  clearAIConfig: () => Promise<void>;
  /** 检查并请求麦克风权限 */
  checkMicPermission: () => Promise<void>;
}

// ==================== Store ====================

export const useAIConfigStore = create<AIConfigState>((set, get) => ({
  configured: false,
  reachable: false,
  mode: 'search',
  latencyTier: 'unknown',
  lastLatencyMs: null,
  micPermissionGranted: false,
  isVoiceAvailable: false,
  aiConfig: null as any,

  detectReachability: async () => {
    const { micPermissionGranted } = get();

    // 第一级：N1 在线 → 拉取 AI 配置 → 检测可达性
    try {
      const serverUrl = useSyncConfigStore.getState().serverUrl;

      if (serverUrl) {
        const n1Config = await getConfig(serverUrl);

        if (n1Config && validateAIConfig({
          apiUrl: n1Config.apiUrl,
          apiKey: n1Config.apiKey,
          textModel: n1Config.textModel,
        })) {
          const aiConfig: AITextConfig = {
            apiUrl: n1Config.apiUrl,
            apiKey: n1Config.apiKey,
            textModel: n1Config.textModel,
          };

          const reachable = await checkAIReachable(aiConfig.apiUrl, aiConfig.apiKey);

          // 缓存到 SecureStore
          await SecureStore.setItemAsync(AI_CONFIG_KEY, JSON.stringify(aiConfig));

          set({
            configured: true,
            reachable,
            mode: reachable ? 'chat' : 'search',
            aiConfig: n1Config as any,
            isVoiceAvailable: computeVoiceAvailable(micPermissionGranted, reachable, reachable ? 'chat' : 'search'),
          });
          return;
        } else {
          // N1 返回了空配置或无效配置 → 降级
          set({
            configured: false,
            reachable: false,
            mode: 'search',
            aiConfig: null as any,
            isVoiceAvailable: false,
          });
          return;
        }
      }
    } catch {
      // N1 离线或错误，继续尝试二级
    }

    // 第二级：尝试 SecureStore 缓存
    try {
      const cached = await SecureStore.getItemAsync(AI_CONFIG_KEY);
      if (cached) {
        const aiConfig: AITextConfig = JSON.parse(cached);

        if (validateAIConfig(aiConfig)) {
          const reachable = await checkAIReachable(aiConfig.apiUrl, aiConfig.apiKey);
          set({
            configured: true,
            reachable,
            mode: reachable ? 'chat' : 'search',
            aiConfig: aiConfig as any,
            isVoiceAvailable: computeVoiceAvailable(micPermissionGranted, reachable, reachable ? 'chat' : 'search'),
          });
          return;
        } else {
          await SecureStore.deleteItemAsync(AI_CONFIG_KEY);
        }
      }
    } catch {
      // 缓存读取失败
    }

    // 第三级：最终降级
    // 注意：测试期望在所有路径失败后 configured: false, mode: 'search'
    set({
      configured: false,
      reachable: false,
      mode: 'search',
      aiConfig: null as any,
      isVoiceAvailable: false,
    });
  },

  updateLatency: (ms: number) => {
    let tier: LatencyTier;
    if (ms < LATENCY_GREEN_MS) {
      tier = 'green';
    } else if (ms < LATENCY_YELLOW_MS) {
      tier = 'yellow';
    } else {
      tier = 'red';
    }
    set({ lastLatencyMs: ms, latencyTier: tier });
  },

  setAIConfig: async (config: AITextConfig) => {
    if (!validateAIConfig(config)) {
      console.warn('setAIConfig: config has empty fields, treating as cleared');
      await get().clearAIConfig();
      return;
    }
    await SecureStore.setItemAsync(AI_CONFIG_KEY, JSON.stringify(config));
    const reachable = await checkAIReachable(config.apiUrl, config.apiKey);
    set({
      configured: true,
      reachable,
      mode: reachable ? 'chat' : 'search',
      latencyTier: 'unknown',
      lastLatencyMs: null,
    });
  },

  clearAIConfig: async () => {
    try {
      await SecureStore.deleteItemAsync(AI_CONFIG_KEY);
    } catch {
      // ignore
    }
    set({
      configured: false,
      reachable: false,
      mode: 'search',
      latencyTier: 'unknown',
      lastLatencyMs: null,
      micPermissionGranted: false,
      isVoiceAvailable: false,
    });
  },

  checkMicPermission: async () => {
    const granted = await requestAudioPermission();
    set({ micPermissionGranted: granted, isVoiceAvailable: computeVoiceAvailable(granted, get().reachable, get().mode) });
  },
}));

// ==================== 内部工具 ====================

/**
 * 校验 AI 配置三字段均为非空字符串。
 * 返回 true 表示配置有效，false 表示至少一个字段为空。
 */
function validateAIConfig(config: AITextConfig): boolean {
  return (
    typeof config.apiUrl === 'string' &&
    config.apiUrl.trim().length > 0 &&
    typeof config.apiKey === 'string' &&
    config.apiKey.trim().length > 0 &&
    typeof config.textModel === 'string' &&
    config.textModel.trim().length > 0
  );
}

/**
 * 检测 AI API 是否可达：HEAD /v1/models，5s 超时。
 */
async function checkAIReachable(apiUrl: string, apiKey: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const baseUrl = apiUrl.replace(/\/+$/, '');
      const url = baseUrl.endsWith('/v1')
        ? `${baseUrl}/models`
        : `${baseUrl}/v1/models`;
      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      });

      return response.ok;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    return false;
  }
}

/**
 * 计算 isVoiceAvailable 的派生值。
 */
function computeVoiceAvailable(micPermission: boolean, reachable: boolean, mode: AIMode): boolean {
  return mode === 'chat' && reachable && micPermission;
}
