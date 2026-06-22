/**
 * 按住说话语音按钮
 *
 * 交互流程：
 * 1. 按下 → 请求权限 → 开始录音 → 按钮高亮 + 脉冲动画 + 声波动画
 * 2. 手指上滑超过 CANCEL_THRESHOLD_DP(80dp) → 显示"松开取消"区域（渐进出现）
 * 3. 松手：
 *    - 超过取消阈值 → 停止录音 → 丢弃 → 不触发 onResult
 *    - 未超过 → 转录中 → onResult(text) / 失败 Toast
 * 4. 手指划回按钮区域 → 取消提示消失，恢复正常录音态
 *
 * 子组件（内联）：
 * - RecordingIndicator  录音中声波动画（3 条竖线交替伸缩）
 * - CancelZone          取消区域提示（半透明红色条带"松开取消"）
 * - ProcessingOverlay   转录中处理指示器（"..." 闪烁）
 *
 * plan-phase7.md Commit 2
 */

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  PanResponder,
  Animated,
  StyleSheet,
} from 'react-native';
import { useAIConfigStore } from '../store/aiConfig';
import {
  recordAndTranscribe,
  requestAudioPermission,
  CANCEL_THRESHOLD_DP,
  type STTResult,
  type RecordingStatus,
} from '../services/stt';
import { showToast } from '../utils/toast';
import * as SecureStore from 'expo-secure-store';
import { useTheme, type ThemeColors } from '../theme/ThemeContext';

// ==================== 常量 ====================

/** SecureStore 缓存 AI 配置的键名（与 aiConfig.ts 一致） */
const AI_CONFIG_KEY = 'pstore_ai_config';

/** 声波动画条数量 */
const WAVE_BAR_COUNT = 3;

/** 脉冲动画最大缩放 */
const PULSE_MAX_SCALE = 1.15;

/** 脉冲动画周期（ms） */
const PULSE_DURATION = 1000;

/** 取消区域高度（dp） */
const CANCEL_ZONE_HEIGHT = 32;

// ==================== Props ====================

interface VoiceButtonProps {
  /** 语音识别成功回调，传入识别文本 */
  onResult: (text: string) => void;
  /** 是否可用（AI 配置可达 + 权限已授权） */
  available?: boolean;
  /** 录音状态变更回调：idle | recording | processing */
  onStatusChange?: (status: RecordingStatus) => void;
}

// ==================== 类型 ====================

type UIState = 'idle' | 'recording' | 'processing';

// 样式对象类型（由 createStyles 返回）
type Styles = ReturnType<typeof createStyles>;

// ==================== 样式工厂 ====================

function createStyles(colors: ThemeColors, scale: number) {
  return StyleSheet.create({
    container: {
      position: 'relative',
      width: 44 * scale,
      height: 44 * scale,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // 隐藏占位（非聊天模式）
    hidden: {
      width: 0,
      height: 0,
    },

    // 取消区域（Animated.View 作为 opacity 载体）
    cancelZoneAnimated: {
      position: 'absolute',
      top: -CANCEL_THRESHOLD_DP - CANCEL_ZONE_HEIGHT,
      left: -28 * scale,
      right: -28 * scale,
      height: CANCEL_ZONE_HEIGHT,
      borderRadius: 8 * scale,
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: 10,
    },

    cancelZoneInner: {
      flex: 1,
      backgroundColor: 'rgba(220, 38, 38, 0.85)',
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 8 * scale,
    },

    cancelZoneText: {
      color: colors.text.inverse,
      fontSize: 13 * scale,
      fontWeight: '600',
      letterSpacing: 0.5,
    },

    // 按钮外层（opacity + scale 动画载体）
    button: {
      width: 44 * scale,
      height: 44 * scale,
      borderRadius: 22 * scale,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.bg.primary,
      overflow: 'hidden',
    },

    // 录音/处理中按钮样式
    buttonActive: {
      backgroundColor: colors.brand.primary,
      shadowColor: colors.brand.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 8 * scale,
      elevation: 6,
    },

    // 按钮可点击区域（PanResponder 绑定层）
    touchTarget: {
      width: 44 * scale,
      height: 44 * scale,
      borderRadius: 22 * scale,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // 麦克风图标（idle 态）
    micIcon: {
      fontSize: 20 * scale,
      lineHeight: 22 * scale,
    },

    // ===== 声波动画 =====
    waveContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3 * scale,
      height: 20 * scale,
    },

    waveBar: {
      width: 3 * scale,
      height: 16 * scale,
      borderRadius: 1.5 * scale,
      backgroundColor: colors.text.inverse,
    },

    // ===== 处理指示器 =====
    processingText: {
      fontSize: 20 * scale,
      color: colors.text.inverse,
      fontWeight: '600',
      letterSpacing: 2 * scale,
      lineHeight: 22 * scale,
    },
  });
}

// ==================== 子组件 ====================

/**
 * 录音指示器：3 条竖线交替伸缩动画，白色（Primary 背景上的白色条）。
 */
function RecordingIndicator({ styles }: { styles: Styles }): JSX.Element {
  // 每条竖线的动画错开相位，形成波浪效果
  const bars = useRef(
    Array.from({ length: WAVE_BAR_COUNT }, (_, i) => ({
      anim: new Animated.Value(1),
      phase: i * 120, // 相位偏移（ms）
    }))
  ).current;

  useEffect(() => {
    const loops = bars.map((bar) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(bar.phase),
          Animated.timing(bar.anim, {
            toValue: 0.3,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(bar.anim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ])
      )
    );

    const instances = loops.map((l) => l.start());
    return () => instances.forEach((inst) => inst.stop());
  }, []);

  return (
    <View style={styles.waveContainer}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={[
            styles.waveBar,
            {
              transform: [
                {
                  scaleY: bar.anim.interpolate({
                    inputRange: [0.3, 1],
                    outputRange: [0.3, 1],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

/**
 * 取消区域提示：半透明红色条带"松开取消"，位于按钮上方。
 * 使用 Animated.View 包裹，opacity 由外部 Animated.Value 驱动。
 */
function CancelZone({
  opacity,
  styles,
}: {
  opacity: Animated.AnimatedInterpolation<number> | Animated.Value;
  styles: Styles;
}): JSX.Element {
  return (
    <Animated.View style={[styles.cancelZoneAnimated, { opacity }]}>
      <View style={styles.cancelZoneInner}>
        <Text style={styles.cancelZoneText}>松开取消</Text>
      </View>
    </Animated.View>
  );
}

/**
 * 转录中处理指示器：简单 "..." 文字循环闪烁。
 */
function ProcessingOverlay({ styles }: { styles: Styles }): JSX.Element {
  const dotAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(dotAnim, {
          toValue: 0.3,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.Text style={[styles.processingText, { opacity: dotAnim }]}>
      ...
    </Animated.Text>
  );
}

// ==================== 辅助 hook ====================

/**
 * 保持回调引用的最新值，避免 PanResponder 闭包捕获 stale 的 onResult。
 */
function useFnRef<T extends (...args: any[]) => any>(fn: T): React.MutableRefObject<T> {
  const ref = useRef(fn);
  ref.current = fn;
  return ref as React.MutableRefObject<T>;
}

// ==================== 主组件 ====================

/**
 * 按住说话语音按钮。
 *
 * 状态机：
 * IDLE → (按下) → RECORDING → (滑过阈值) → READY_TO_CANCEL
 *   → (松手) → CANCELLED → IDLE
 *   → (滑回) → RECORDING
 *   → (松手未超阈值) → PROCESSING → DONE → IDLE
 */
export function VoiceButton({ onResult, available = true, onStatusChange }: VoiceButtonProps): JSX.Element {
  const { theme } = useTheme();
  const { colors, scale } = theme;
  const styles = useMemo(() => createStyles(colors, scale), [colors, scale]);

  // ----- 状态 -----
  const [uiState, setUiState] = useState<UIState>('idle');
  const aiMode = useAIConfigStore((s) => s.mode);

  // 只在聊天模式显示
  if (aiMode !== 'chat') {
    return <View style={styles.hidden} />;
  }

  // ----- Refs -----
  const statusRef = useRef<RecordingStatus>('idle');
  const isRecordingRef = useRef(false);   // 防止并发
  const panDyRef = useRef(0);             // 最新滑动 dy
  const resolveRef = useFnRef(onResult);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const cancelOpacity = useRef(new Animated.Value(0)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // ----- 动画控制 -----

  const startPulse = useCallback(() => {
    stopPulse();
    pulseLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: PULSE_MAX_SCALE,
          duration: PULSE_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: PULSE_DURATION,
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoopRef.current.start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    if (pulseLoopRef.current) {
      pulseLoopRef.current.stop();
      pulseLoopRef.current = null;
    }
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  // ----- AI 配置读取 -----

  const getAIConfig = useCallback(async (): Promise<{ apiUrl: string; apiKey: string; textModel: string } | null> => {
    try {
      const raw = await SecureStore.getItemAsync(AI_CONFIG_KEY);
      if (!raw) return null;
      const config = JSON.parse(raw);
      if (!config.apiUrl || !config.apiKey) return null;
      return config;
    } catch {
      return null;
    }
  }, []);

  // ----- 状态同步 -----

  const setStatus = useCallback((s: RecordingStatus) => {
    statusRef.current = s;
    isRecordingRef.current = s === 'recording';
    setUiState(s === 'idle' ? 'idle' : s === 'recording' ? 'recording' : 'processing');
    onStatusChange?.(s);
  }, [onStatusChange]);

  // ----- 取消区域动画更新 -----

  const updateCancelZone = useCallback(
    (dy: number) => {
      // dy < 0 表示手指向上滑
      const upwardSlide = Math.max(0, -dy);
      const progress = Math.min(1, upwardSlide / CANCEL_THRESHOLD_DP);

      // 取消区域透明度渐进
      cancelOpacity.setValue(progress);

      // 按钮微缩：越接近取消区域越缩小，增加紧迫感
      const scale = 1 - progress * 0.1;
      scaleAnim.setValue(scale);
    },
    [cancelOpacity, scaleAnim]
  );

  const resetCancelZone = useCallback(() => {
    cancelOpacity.setValue(0);
    scaleAnim.setValue(1);
    panDyRef.current = 0;
  }, [cancelOpacity, scaleAnim]);

  // ----- 清理资源 -----

  const cleanup = useCallback(() => {
    stopPulse();
    resetCancelZone();
    isRecordingRef.current = false;
    setStatus('idle');
  }, [stopPulse, resetCancelZone, setStatus]);

  // 组件卸载时确保清理
  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      stopPulse();
    };
  }, [stopPulse]);

  // ----- 权限检查（独立函数） -----

  const checkPermission = useCallback(async (): Promise<boolean> => {
    const { requestAudioPermission } = await import('../services/stt');
    const granted = await requestAudioPermission();
    if (!granted) {
      showToast('请在设置中开启麦克风权限');
      return false;
    }
    return true;
  }, []);

  // ----- 手势处理 -----

  const panResponder = useRef(
    PanResponder.create({
      // 在垂直滑动时吸收手势，阻止冒泡到外层 ScrollView
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },

      onPanResponderGrant: async () => {
        // 不可用时：Toast 提示原因
        if (!available) {
          const mode = aiMode;
          if (mode === 'chat') {
            showToast('AI 服务未连接');
          } else {
            showToast('请在设置中开启麦克风权限');
          }
          return;
        }

        // 防止并发（快速连按时叠加录音）
        if (isRecordingRef.current) {
          return;
        }

        // 权限检查
        const granted = await checkPermission();
        if (!granted) {
          return;
        }

        // 进入录音态
        resetCancelZone();
        setStatus('recording');
        startPulse();
      },

      onPanResponderMove: (_evt, gestureState) => {
        if (statusRef.current !== 'recording') return;
        // 记录最新 dy 供 release 时判断
        panDyRef.current = gestureState.dy;
        updateCancelZone(gestureState.dy);
      },

      onPanResponderRelease: async (_evt, _gestureState) => {
        const shouldCancel = panDyRef.current < -CANCEL_THRESHOLD_DP;

        if (shouldCancel) {
          // 滑动取消：丢弃录音，不触发回调
          isRecordingRef.current = false;
          cleanup();
          return;
        }

        if (statusRef.current !== 'recording') {
          // 不在录音状态（权限被拒、误触等）
          cleanup();
          return;
        }

        // 正常释放：转录
        setStatus('processing');
        try {
          const config = await getAIConfig();
          if (!config) {
            showToast('AI 配置不可用，请检查设置');
            cleanup();
            return;
          }

          const result: STTResult | null = await recordAndTranscribe(
            config,
            setStatus
          );

          // 仅在未被取消时触发回调
          if (result) {
            resolveRef.current(result.text);
          }
        } catch {
          showToast('语音识别失败，请使用文字输入');
        } finally {
          cleanup();
        }
      },

      onPanResponderTerminate: () => {
        // 手势被系统中断（如来电），安全清理
        isRecordingRef.current = false;
        cleanup();
      },
    })
  ).current;

  // ----- 渲染 -----

  // 根据 UI 状态决定按钮内容
  const renderContent = () => {
    switch (uiState) {
      case 'recording':
        return <RecordingIndicator styles={styles} />;
      case 'processing':
        return <ProcessingOverlay styles={styles} />;
      default:
        return <Text style={styles.micIcon}>🎤</Text>;
    }
  };

  const isActive = uiState !== 'idle';

  return (
    <View style={styles.container}>
      {/* 取消区域（Animated opacity 驱动，始终渲染但 pointerEvents='none'） */}
      <CancelZone opacity={cancelOpacity} styles={styles} />

      {/* 按钮主体 */}
      <Animated.View
        style={[
          styles.button,
          {
            opacity: available ? 1 : 0.3,
            transform: [
              { scale: Animated.multiply(scaleAnim, pulseAnim) },
            ],
          },
          isActive && styles.buttonActive,
        ]}
        accessibilityLabel={available ? '按住说话' : '语音不可用'}
        accessibilityRole="button"
        accessibilityState={{ busy: isActive }}
      >
        {/* PanResponder 绑定层 */}
        <View {...panResponder.panHandlers} style={styles.touchTarget}>
          {renderContent()}
        </View>
      </Animated.View>
    </View>
  );
}
