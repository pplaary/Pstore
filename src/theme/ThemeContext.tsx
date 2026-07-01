/**
 * ThemeContext — 现代化主题基础设施
 *
 * 设计系统：Modern Minimalist + Soft Tech
 * 主色调: Blue (#2563EB) — 专业可靠聚焦
 * 风格: 干净表面、微妙景深、精致排版
 *
 * 三种实际模式: 'light' | 'dark' | 'care'
 * 存储值:    'light' | 'dark' | 'care' | 'system'
 *
 * 新增:
 * - 间距系统 (4/8/12/16/20/24/32/48)
 * - 圆角系统 (sm/md/lg/xl/full)
 * - 阴影系统 (sm/md/lg)
 * - 动画时长令牌
 * - 语义化表面令牌 (surface0/surface1/surface2)
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
  /** 表面色阶 (0=最底层, 2=最高层) */
  surface: {
    s0: string;  // 页面背景
    s1: string;  // 卡片/列表项
    s2: string;  // 弹层/浮层
  };
  /** 输入区域背景 */
  input: string;
  /** 文字色阶 */
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    inverse: string;
    link: string;
  };
  /** 品牌色 */
  brand: {
    primary: string;
    primaryLight: string;
    primaryMuted: string;
    tertiary: string;
    success: string;
    successMuted: string;
    danger: string;
    dangerMuted: string;
    warning: string;
    warningMuted: string;
  };
  /** 边框色阶 */
  border: {
    subtle: string;
    default: string;
    strong: string;
  };
  /** 聊天特殊色 */
  chat: {
    userBubble: string;
    userBubbleText: string;
    aiBubble: string;
    aiBubbleText: string;
  };
}

// ─── 间距令牌 ───────────────────────────────────────────────
export interface Spacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
  xxxl: number;
}

// ─── 圆角令牌 ───────────────────────────────────────────────
export interface Radii {
  sm: number;
  md: number;
  lg: number;
  xl: number;
  full: number;
}

// ─── 阴影令牌 ───────────────────────────────────────────────
export interface Shadow {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export interface Shadows {
  sm: Shadow;
  md: Shadow;
  lg: Shadow;
}

// ─── 动画时长令牌 ───────────────────────────────────────────
export interface Durations {
  fast: number;    // 100ms - 微交互
  normal: number;  // 200ms - 常规过渡
  slow: number;    // 350ms - 页面过渡
}

// ─── 完整 Theme 接口 ────────────────────────────────────────
export interface Theme {
  /** 存储值 (可能为 'system') */
  storedMode: 'light' | 'dark' | 'care' | 'system';
  /** 实际生效的模式 */
  mode: 'light' | 'dark' | 'care';
  colors: ThemeColors;
  spacing: Spacing;
  radii: Radii;
  shadows: Shadows;
  durations: Durations;
  /** 字号缩放: care=1.25, 其余=1 */
  scale: number;
  /** 最小触摸目标 (dp)，care 模式 48，其余 0 */
  minTouchTarget: number;
  /** 是否暗色模式 */
  isDark: boolean;
}

// ─── 令牌表 ─────────────────────────────────────────────────

// 共享间距/圆角/时长 (所有模式一致)
const SPACING: Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };
const RADII: Radii = { sm: 6, md: 10, lg: 14, xl: 18, full: 9999 };
const DURATIONS: Durations = { fast: 100, normal: 200, slow: 350 };

function makeShadows(shadowColor: string): Shadows {
  return {
    sm: { shadowColor, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 1 },
    md: { shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 },
    lg: { shadowColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 6 },
  };
}

const COLORS: Record<'light' | 'dark' | 'care', ThemeColors> = {
  // ─── Light Mode — 现代明亮 ───────────────────────────────
  light: {
    surface: {
      s0: '#F8FAFC',
      s1: '#FFFFFF',
      s2: '#FFFFFF',
    },
    input: '#F1F5F9',
    text: {
      primary: '#1E293B',
      secondary: '#475569',
      tertiary: '#94A3B8',
      inverse: '#FFFFFF',
      link: '#2563EB',
    },
    brand: {
      primary: '#2563EB',
      primaryLight: '#60A5FA',
      primaryMuted: '#DBEAFE',
      tertiary: '#8B5CF6',
      success: '#10B981',
      successMuted: '#ECFDF5',
      danger: '#EF4444',
      dangerMuted: '#FEF2F2',
      warning: '#F59E0B',
      warningMuted: '#FFFBEB',
    },
    border: {
      subtle: '#F1F5F9',
      default: '#E2E8F0',
      strong: '#CBD5E1',
    },
    chat: {
      userBubble: '#D1FAE5',
      userBubbleText: '#065F46',
      aiBubble: '#F1F5F9',
      aiBubbleText: '#1E293B',
    },
  },

  // ─── Dark Mode — 深邃内敛 ───────────────────────────────
  dark: {
    surface: {
      s0: '#0B1120',
      s1: '#111827',
      s2: '#1E293B',
    },
    input: '#1E293B',
    text: {
      primary: '#F1F5F9',
      secondary: '#94A3B8',
      tertiary: '#64748B',
      inverse: '#FFFFFF',
      link: '#60A5FA',
    },
    brand: {
      primary: '#60A5FA',
      primaryLight: '#93C5FD',
      primaryMuted: '#1E3A5F',
      tertiary: '#A78BFA',
      success: '#34D399',
      successMuted: '#064E3B',
      danger: '#F87171',
      dangerMuted: '#7F1D1D',
      warning: '#FBBF24',
      warningMuted: '#78350F',
    },
    border: {
      subtle: '#1E293B',
      default: '#334155',
      strong: '#475569',
    },
    chat: {
      userBubble: '#064E3B',
      userBubbleText: '#A7F3D0',
      aiBubble: '#1E293B',
      aiBubbleText: '#F1F5F9',
    },
  },

  // ─── Care Mode — 高对比度无障碍 ──────────────────────────
  care: {
    surface: {
      s0: '#FFFFFF',
      s1: '#FFFFFF',
      s2: '#FFFFFF',
    },
    input: '#FFFFFF',
    text: {
      primary: '#000000',
      secondary: '#1A1A1A',
      tertiary: '#4D4D4D',
      inverse: '#FFFFFF',
      link: '#1D4ED8',
    },
    brand: {
      primary: '#1D4ED8',
      primaryLight: '#2563EB',
      primaryMuted: '#DBEAFE',
      tertiary: '#6D28D9',
      success: '#047857',
      successMuted: '#D1FAE5',
      danger: '#B91C1C',
      dangerMuted: '#FEE2E2',
      warning: '#B45309',
      warningMuted: '#FEF3C7',
    },
    border: {
      subtle: '#D4D4D4',
      default: '#737373',
      strong: '#404040',
    },
    chat: {
      userBubble: '#D1FAE5',
      userBubbleText: '#065F46',
      aiBubble: '#F5F5F5',
      aiBubbleText: '#000000',
    },
  },
};

// ─── 构建 Theme 对象 ────────────────────────────────────────
function buildTheme(
  storedMode: 'light' | 'dark' | 'care' | 'system',
  systemScheme: 'light' | 'dark',
): Theme {
  const mode: 'light' | 'dark' | 'care' =
    storedMode === 'system' ? systemScheme : storedMode;

  return {
    storedMode,
    mode,
    colors: COLORS[mode],
    spacing: SPACING,
    radii: RADII,
    shadows: makeShadows(mode === 'light' ? '#000000' : '#000000'),
    durations: DURATIONS,
    scale: mode === 'care' ? 1.25 : 1,
    minTouchTarget: mode === 'care' ? 48 : 0,
    isDark: mode === 'dark',
  };
}

// ─── Context ────────────────────────────────────────────────
interface ThemeContextValue {
  /** 当前 Theme 对象 */
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
  const systemColorScheme = useColorScheme();
  const systemScheme: 'light' | 'dark' = systemColorScheme ?? 'light';

  const [storedMode, setStoredMode] = useState<'light' | 'dark' | 'care' | 'system'>('system');
  const [ready, setReady] = useState(false);

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
    return {
      theme: buildTheme('light', 'light'),
      setMode: async () => {},
    };
  }
  return ctx;
}

// 导出常用便捷方法
export function useSpacing() {
  const { theme } = useTheme();
  return theme.spacing;
}

export function useRadii() {
  const { theme } = useTheme();
  return theme.radii;
}

export function useShadows() {
  const { theme } = useTheme();
  return theme.shadows;
}