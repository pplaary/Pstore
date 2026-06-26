/**
 * ThemeContext — 主题基础设施
 *
 * 三种实际模式: 'light' | 'dark' | 'care'
 * 存储值:    'light' | 'dark' | 'care' | 'system'
 *
 * 'system' 跟随系统 useColorScheme()，切换时自动生效。
 * 'care'   关怀模式: 高对比度 + 字号 1.25x + 44dp 最小触摸。
 *
 * 持久化: expo-secure-store, key = 'pstore_theme_mode'
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// ─── 持久化 key ────────────────────────────────────────────
const STORAGE_KEY = 'pstore_theme_mode';

// ─── 颜色令牌 ───────────────────────────────────────────────
export interface ThemeColors {
  bg: {
    primary: string;
    card: string;
    input: string;
    header: string;
  };
  text: {
    primary: string;
    secondary: string;
    hint: string;
    inverse: string;
  };
  brand: {
    primary: string;
    success: string;
    danger: string;
    warning: string;
    inShop: string;
    outOfStock: string;
    toBePurchased: string;
  };
  border: {
    default: string;
    medium: string;
    light: string;
  };
}

export interface Theme {
  /** 存储值 (可能为 'system') */
  storedMode: 'light' | 'dark' | 'care' | 'system';
  /** 实际生效的模式 */
  mode: 'light' | 'dark' | 'care';
  colors: ThemeColors;
  /** 字号缩放: care=1.25, 其余=1 */
  scale: number;
  /** 最小触摸目标 (dp)，care 模式 44，其余 0 */
  minTouchTarget: number;
}

// ─── 令牌表 ─────────────────────────────────────────────────
const COLORS: Record<'light' | 'dark' | 'care', ThemeColors> = {
  light: {
    bg: {
      primary: '#F1F5F9',
      card: '#FFFFFF',
      input: '#F1F5F9',
      header: '#FFFFFF',
    },
    text: {
      primary: '#1E293B',
      secondary: '#64748B',
      hint: '#94A3B8',
      inverse: '#FFFFFF',
    },
    brand: {
      primary: '#2563EB',
      success: '#16A34A',
      danger: '#DC2626',
      warning: '#EA580C',
      inShop: '#2563EB',
      outOfStock: '#9E9E9E',
      toBePurchased: '#F59E0B',
    },
    border: {
      default: '#E2E8F0',
      medium: '#CBD5E1',
      light: '#F1F5F9',
    },
  },
  dark: {
    bg: {
      primary: '#0F172A',
      card: '#1E293B',
      input: '#334155',
      header: '#1E293B',
    },
    text: {
      primary: '#F1F5F9',
      secondary: '#94A3B8',
      hint: '#64748B',
      inverse: '#FFFFFF',
    },
    brand: {
      primary: '#2563EB',
      success: '#16A34A',
      danger: '#DC2626',
      warning: '#EA580C',
      inShop: '#2563EB',
      outOfStock: '#9E9E9E',
      toBePurchased: '#F59E0B',
    },
    border: {
      default: '#475569',
      medium: '#64748B',
      light: '#334155',
    },
  },
  care: {
    bg: {
      primary: '#FFFFFF',
      card: '#FFFFFF',
      input: '#FFFFFF',
      header: '#FFFFFF',
    },
    text: {
      primary: '#000000',
      secondary: '#333333',
      hint: '#666666',
      inverse: '#FFFFFF',
    },
    brand: {
      primary: '#2563EB',
      success: '#16A34A',
      danger: '#DC2626',
      warning: '#EA580C',
      inShop: '#2563EB',
      outOfStock: '#9E9E9E',
      toBePurchased: '#F59E0B',
    },
    border: {
      default: '#333333',
      medium: '#666666',
      light: '#E0E0E0',
    },
  },
};

// ─── 构建 Theme 对象 ────────────────────────────────────────
function buildTheme(storedMode: 'light' | 'dark' | 'care' | 'system', systemScheme: 'light' | 'dark'): Theme {
  const mode: 'light' | 'dark' | 'care' = storedMode === 'system' ? systemScheme : storedMode;
  return {
    storedMode,
    mode,
    colors: COLORS[mode],
    scale: mode === 'care' ? 1.25 : 1,
    minTouchTarget: mode === 'care' ? 44 : 0,
  };
}

// ─── Context ────────────────────────────────────────────────
interface ThemeContextValue {
  /** 当前 Theme 对象（含 colors / scale / minTouchTarget） */
  theme: Theme;
  /** 切换模式并持久化 */
  setMode: (mode: 'light' | 'dark' | 'care' | 'system') => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────
interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const systemColorScheme = useColorScheme(); // 'light' | 'dark' | null — hook 必须在顶层调用
  const systemScheme: 'light' | 'dark' = systemColorScheme ?? 'light';

  const [storedMode, setStoredMode] = useState<'light' | 'dark' | 'care' | 'system'>('system');
  const [ready, setReady] = useState(false);

  // 启动时读取持久化值
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        if (raw === 'light' || raw === 'dark' || raw === 'care' || raw === 'system') {
          setStoredMode(raw);
        }
      } catch {
        // SecureStore 不可用则使用默认值 'system'
      }
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const theme = buildTheme(storedMode, systemScheme);

  const setMode = useCallback(async (mode: 'light' | 'dark' | 'care' | 'system') => {
    setStoredMode(mode);
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, mode);
    } catch {
      // 忽略持久化失败
    }
  }, []);

  if (!ready) {
    // 返回默认 light 主题骨架，避免首屏闪烁
    return (
      <ThemeContext.Provider value={{ theme: buildTheme('light', 'light'), setMode }}>
        {children}
      </ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider value={{ theme, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // 未包裹 ThemeProvider 时回退到 light 主题
    return {
      theme: buildTheme('light', 'light'),
      setMode: async () => {},
    };
  }
  return ctx;
}
