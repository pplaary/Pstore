/**
 * 按住说话语音按钮 — 现代化设计
 *
 * 设计特征：
 * - 圆形按钮，品牌色激活态
 * - 录音中：声波动画 + 脉冲光环
 * - 上滑取消：红色取消区域渐进出现
 * - 转录中：处理动画
 * - 符合 44dp 最小触摸目标
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
import { useTheme, type Theme } from '../theme/ThemeContext';

// ==================== 常量 ====================

const AI_CONFIG_KEY = 'pstore_ai_config';
const WAVE_BAR_COUNT = 3;
const PULSE_MAX_SCALE = 1.2;
const PULSE_DURATION = 800;
const CANCEL_ZONE_HEIGHT = 36;

// ==================== Props ====================

interface VoiceButtonProps {
  onResult: (text: string) => void;
  available?: boolean;
  onStatusChange?: (status: RecordingStatus) => void;
}

// ==================== 类型 ====================

type UIState = 'idle' | 'recording' | 'processing';
type Styles = ReturnType<typeof createStyles>;

// ==================== 样式工厂 ====================

function createStyles(theme: Theme) {
  const { colors, spacing, radii, scale } = theme;
  return StyleSheet.create({
    container: {
      position: 'relative',
      width: 44 * scale,
      height: 44 * scale,
      justifyContent: 'center',
      alignItems: 'center',
    },
    hidden: {
      width: 0,
      height: 0,
    },

    // 取消区域
    cancelZoneAnimated: {
      position: 'absolute',
      top: -CANCEL_THRESHOLD_DP - CANCEL_ZONE_HEIGHT,
      left: -32 * scale,
      right: -32 * scale,
      height: CANCEL_ZONE_HEIGHT,
      borderRadius: radii.md,
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: 10,
    },
    cancelZoneInner: {
      flex: 1,
      backgroundColor: 'rgba(239, 68, 68, 0.9)',
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: radii.md,
    },
    cancelZoneText: {
      color: colors.text.inverse,
      fontSize: 13 * scale,
      fontWeight: '600',
    },

    // 按钮主体
    button: {
      width: 44 * scale,
      height: 44 * scale,
      borderRadius: radii.full,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.input,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      overflow: 'visible',
    },
    buttonActive: {
      backgroundColor: colors.brand.primary,
      borderColor: colors.brand.primary,
      shadowColor: colors.brand.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 8,
    },

    // 脉冲光环
    pulseRing: {
      position: 'absolute',
      width: 44 * scale,
      height: 44 * scale,
      borderRadius: radii.full,
      borderWidth: 2,
      borderColor: colors.brand.primaryLight,
      opacity: 0,
    },

    touchTarget: {
      width: 44 * scale,
      height: 44 * scale,
      borderRadius: radii.full,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // 麦克风图标
    micIcon: {
      fontSize: 20 * scale,
      lineHeight: 22 * scale,
    },

    // 声波动画
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

    // 处理指示器
    processingText: {
      fontSize: 18 * scale,
      color: colors.text.inverse,
      fontWeight: '600',
      letterSpacing: 2,
      lineHeight: 22 * scale,
    },
  });
}

// ==================== 子组件 ====================

function RecordingIndicator({ styles }: { styles: Styles }): JSX.Element {
  const bars = useRef(
    Array.from({ length: WAVE_BAR_COUNT }, (_, i) => ({
      anim: new Animated.Value(1),
      phase: i * 100,
    }))
  ).current;

  useEffect(() => {
    const loops = bars.map((bar) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(bar.phase),
          Animated.timing(bar.anim, { toValue: 0.25, duration: 250, useNativeDriver: true }),
          Animated.timing(bar.anim, { toValue: 1, duration: 250, useNativeDriver: true }),
        ])
      )
    );
    const instances = loops.map((l) => l.start());
    return () => instances.forEach((inst: any) => inst.stop());
  }, []);

  return (
    <View style={styles.waveContainer}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={[styles.waveBar, { transform: [{ scaleY: bar.anim.interpolate({ inputRange: [0.25, 1], outputRange: [0.25, 1] }) }] }]}
        />
      ))}
    </View>
  );
}

function CancelZone({ opacity, styles }: { opacity: Animated.AnimatedInterpolation<number> | Animated.Value; styles: Styles }): JSX.Element {
  return (
    <Animated.View style={[styles.cancelZoneAnimated, { opacity }]}>
      <View style={styles.cancelZoneInner}>
        <Text style={styles.cancelZoneText}>松开取消</Text>
      </View>
    </Animated.View>
  );
}

function ProcessingOverlay({ styles }: { styles: Styles }): JSX.Element {
  const dotAnim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(dotAnim, { toValue: 0.3, duration: 400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.Text style={[styles.processingText, { opacity: dotAnim }]}>...</Animated.Text>;
}

// ==================== 辅助 hook ====================

function useFnRef<T extends (...args: any[]) => any>(fn: T): React.MutableRefObject<T> {
  const ref = useRef(fn);
  ref.current = fn;
  return ref as React.MutableRefObject<T>;
}

// ==================== 主组件 ====================

export function VoiceButton({ onResult, available = true, onStatusChange }: VoiceButtonProps): JSX.Element {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [uiState, setUiState] = useState<UIState>('idle');
  const aiMode = useAIConfigStore((s) => s.mode);

  if (aiMode !== 'chat') {
    return <View style={styles.hidden} />;
  }

  const statusRef = useRef<RecordingStatus>('idle');
  const isRecordingRef = useRef(false);
  const panDyRef = useRef(0);
  const resolveRef = useFnRef(onResult);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const cancelOpacity = useRef(new Animated.Value(0)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const ringLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const startPulse = useCallback(() => {
    stopPulse();
    pulseLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: PULSE_MAX_SCALE, duration: PULSE_DURATION, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: PULSE_DURATION, useNativeDriver: true }),
      ])
    );
    pulseLoopRef.current.start();

    // 脉冲光环
    ringLoopRef.current = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(ringOpacity, { toValue: 0.5, duration: PULSE_DURATION, useNativeDriver: true }),
          Animated.timing(ringOpacity, { toValue: 0, duration: PULSE_DURATION, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(ringScale, { toValue: 1.5, duration: PULSE_DURATION * 2, useNativeDriver: true }),
          Animated.timing(ringScale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    ringLoopRef.current.start();
  }, [pulseAnim, ringOpacity, ringScale]);

  const stopPulse = useCallback(() => {
    if (pulseLoopRef.current) { pulseLoopRef.current.stop(); pulseLoopRef.current = null; }
    if (ringLoopRef.current) { ringLoopRef.current.stop(); ringLoopRef.current = null; }
    pulseAnim.setValue(1);
    ringOpacity.setValue(0);
    ringScale.setValue(1);
  }, [pulseAnim, ringOpacity, ringScale]);

  const getAIConfig = useCallback(async (): Promise<{ apiUrl: string; apiKey: string; textModel: string } | null> => {
    try {
      const raw = await SecureStore.getItemAsync(AI_CONFIG_KEY);
      if (!raw) return null;
      const config = JSON.parse(raw);
      if (!config.apiUrl || !config.apiKey) return null;
      return config;
    } catch { return null; }
  }, []);

  const setStatus = useCallback((s: RecordingStatus) => {
    statusRef.current = s;
    isRecordingRef.current = s === 'recording';
    setUiState(s === 'idle' ? 'idle' : s === 'recording' ? 'recording' : 'processing');
    onStatusChange?.(s);
  }, [onStatusChange]);

  const updateCancelZone = useCallback((dy: number) => {
    const upwardSlide = Math.max(0, -dy);
    const progress = Math.min(1, upwardSlide / CANCEL_THRESHOLD_DP);
    cancelOpacity.setValue(progress);
    scaleAnim.setValue(1 - progress * 0.08);
  }, [cancelOpacity, scaleAnim]);

  const resetCancelZone = useCallback(() => {
    cancelOpacity.setValue(0);
    scaleAnim.setValue(1);
    panDyRef.current = 0;
  }, [cancelOpacity, scaleAnim]);

  const cleanup = useCallback(() => {
    stopPulse();
    resetCancelZone();
    isRecordingRef.current = false;
    setStatus('idle');
  }, [stopPulse, resetCancelZone, setStatus]);

  useEffect(() => { return () => { isRecordingRef.current = false; stopPulse(); }; }, [stopPulse]);

  const checkPermission = useCallback(async (): Promise<boolean> => {
    const granted = await requestAudioPermission();
    if (!granted) { showToast('请在设置中开启麦克风权限'); return false; }
    return true;
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gestureState) => Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderGrant: async () => {
        if (!available) { showToast('AI 服务未连接'); return; }
        if (isRecordingRef.current) return;
        const granted = await checkPermission();
        if (!granted) return;
        resetCancelZone();
        setStatus('recording');
        startPulse();
      },
      onPanResponderMove: (_evt, gestureState) => {
        if (statusRef.current !== 'recording') return;
        panDyRef.current = gestureState.dy;
        updateCancelZone(gestureState.dy);
      },
      onPanResponderRelease: async (_evt, _gestureState) => {
        const shouldCancel = panDyRef.current < -CANCEL_THRESHOLD_DP;
        if (shouldCancel) { isRecordingRef.current = false; cleanup(); return; }
        if (statusRef.current !== 'recording') { cleanup(); return; }
        setStatus('processing');
        try {
          const config = await getAIConfig();
          if (!config) { showToast('AI 配置不可用，请检查设置'); cleanup(); return; }
          const result: STTResult | null = await recordAndTranscribe(config, setStatus);
          if (result) { resolveRef.current(result.text); }
        } catch { showToast('语音识别失败，请使用文字输入'); }
        finally { cleanup(); }
      },
      onPanResponderTerminate: () => { isRecordingRef.current = false; cleanup(); },
    })
  ).current;

  const renderContent = () => {
    switch (uiState) {
      case 'recording': return <RecordingIndicator styles={styles} />;
      case 'processing': return <ProcessingOverlay styles={styles} />;
      default: return <Text style={styles.micIcon}>🎤</Text>;
    }
  };

  const isActive = uiState !== 'idle';

  return (
    <View style={styles.container}>
      <CancelZone opacity={cancelOpacity} styles={styles} />

      {/* 脉冲光环 */}
      <Animated.View
        style={[styles.pulseRing, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]}
        pointerEvents="none"
      />

      <Animated.View
        style={[
          styles.button,
          { opacity: available ? 1 : 0.3, transform: [{ scale: Animated.multiply(scaleAnim, pulseAnim) }] },
          isActive && styles.buttonActive,
        ]}
        accessibilityLabel={available ? '按住说话' : '语音不可用'}
        accessibilityRole="button"
        accessibilityState={{ busy: isActive }}
      >
        <View {...panResponder.panHandlers} style={styles.touchTarget}>
          {renderContent()}
        </View>
      </Animated.View>
    </View>
  );
}