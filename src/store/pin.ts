/**
 * PIN 密码 Zustand Store
 *
 * 使用 expo-crypto 的 digestStringAsync 进行 SHA-256 哈希。
 * 纯内存态，重启后需重新验证。
 */

import { create } from 'zustand';

export interface PinState {
  pinHash: string | null;
  isPinSet: boolean;
  setPin: (pin: string) => Promise<void>;
  verifyPin: (input: string) => Promise<boolean>;
  resetPin: (oldPin: string) => Promise<boolean>;
  /** 安全恢复 PIN：验证当前应用态（如管理模式已开启）可强制清除 PIN */
  recoverPin: () => void;
}

export const usePinStore = create<PinState>()((set) => ({
  pinHash: null,
  isPinSet: false,

  setPin: async (pin: string) => {
    const hash = await sha256(pin);
    set({ pinHash: hash, isPinSet: true });
  },

  verifyPin: async (input: string): Promise<boolean> => {
    const state: PinState = usePinStore.getState();
    if (!state.pinHash) return false;
    const inputHash = await sha256(input);
    return inputHash === state.pinHash;
  },

  resetPin: async (oldPin: string) => {
    const state = usePinStore.getState();
    if (!state.pinHash) return false;
    const oldHash = await sha256(oldPin);
    if (oldHash !== state.pinHash) return false;
    set({ pinHash: null, isPinSet: false });
    return true;
  },

  recoverPin: () => {
    // 强制清除 PIN（适用于管理员忘记 PIN 时，通过管理模式入口恢复）
    set({ pinHash: null, isPinSet: false });
  },
}));

// ==================== 哈希工具 ====================

async function sha256(message: string): Promise<string> {
  // 使用 expo-crypto 的 digestStringAsync
  const { digestStringAsync, CryptoDigestAlgorithm } = await import('expo-crypto');
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, message);
}
