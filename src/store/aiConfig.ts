/**
 * AI 配置 Zustand Store
 *
 * 存储 AI 服务配置（供拍照识别使用）。
 * Phase 3 先用本地 store 作为过渡，后续 N1 实现时替换数据源（spec §10.5/§10.7）。
 */

import { create } from 'zustand';

export interface AIConfig {
  apiUrl: string;       // 视觉模型 API 地址
  apiKey: string;       // API Key
  visionModel: string;  // 视觉模型名称
}

interface AIConfigStoreState {
  config: AIConfig | null;
  setConfig: (config: AIConfig | null) => void;
  hasConfig: () => boolean;
}

export const useAIConfigStore = create<AIConfigStoreState>((set, get) => ({
  config: null,
  setConfig: (config) => set({ config }),
  hasConfig: () => get().config !== null,
}));
