/**
 * 网络延迟指示器
 *
 * 显示 AI API 延迟色标圆点，反映当前网络质量。
 * 仅在 AI 聊天模式下渲染。
 *
 * spec-v4.5 §14.2 网络质量指示：
 *   < 1s  → 绿色  #16A34A
 *   1-3s  → 黄色  #F59E0B
 *   > 3s  → 红色  #EF4444
 *   未知  → 灰色  #94A3B8
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAIConfigStore } from '../store/aiConfig';

// ==================== 色彩映射 ====================

const TIER_COLORS: Record<string, string> = {
  green: '#16A34A',
  yellow: '#F59E0B',
  red: '#EF4444',
  unknown: '#94A3B8',
};

// ==================== 组件 ====================

/**
 * 网络质量指示器：AI 延迟色标圆点。
 *
 * 仅在 `aiConfig.mode === 'chat'` 时渲染。
 */
export function NetworkIndicator(): JSX.Element | null {
  const mode = useAIConfigStore((s) => s.mode);
  const latencyTier = useAIConfigStore((s) => s.latencyTier);
  const lastLatencyMs = useAIConfigStore((s) => s.lastLatencyMs);

  // 仅在聊天模式下渲染
  if (mode !== 'chat') return null;

  const color = TIER_COLORS[latencyTier] ?? TIER_COLORS.unknown;

  return (
    <View style={styles.container} testID="network-indicator">
      <View style={[styles.dot, { backgroundColor: color }]} />
      {lastLatencyMs !== null && (
        <Text style={styles.latencyText}>{lastLatencyMs}ms</Text>
      )}
    </View>
  );
}

// ==================== 样式 ====================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  latencyText: {
    fontSize: 11,
    color: '#94A3B8',
    minWidth: 32,
  },
});
