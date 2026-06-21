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
}

export const usePinStore = create<PinState>()((set) => ({
  pinHash: null,
  isPinSet: false,

  setPin: async (pin: string) => {
    const hash = await sha256(pin);
    set({ pinHash: hash, isPinSet: true });
  },

  verifyPin: async (input: string) => {
    const state = usePinStore.getState();
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
}));

// ==================== 哈希工具 ====================

async function sha256(message: string): Promise<string> {
  // 使用 expo-crypto 的 digestStringAsync
  const { digestStringAsync, CryptoEncoding } = await import('expo-crypto');
  return digestStringAsync(message, CryptoEncoding.HEX);
}
