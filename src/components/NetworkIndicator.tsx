/**
 * 网络延迟指示器
 *
 * 显示 AI API 延迟色标圆点，反映当前网络质量。
 * 顶栏区域始终显示。
 *
 * spec-v4.5 §7.4 网络质量指示：
 *   < 1s  → 绿色  #4CAF50
 *   1-3s  → 黄色  #FFC107
 *   > 3s  → 红色  #F44336
 *   未知  → 灰色  #9E9E9E
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAIConfigStore } from '../store/aiConfig';

// ==================== 色彩映射（Material Design 色标） ====================

const TIER_COLORS: Record<string, string> = {
  green: '#4CAF50',
  yellow: '#FFC107',
  red: '#F44336',
  unknown: '#9E9E9E',
};

// ==================== 组件 ====================

export function NetworkIndicator(): JSX.Element {
  const latencyTier = useAIConfigStore((s) => s.latencyTier);
  const lastLatencyMs = useAIConfigStore((s) => s.lastLatencyMs);

  const color = TIER_COLORS[latencyTier] ?? TIER_COLORS.unknown;

  return (
    <View
      style={styles.container}
      testID="network-indicator"
      accessibilityLabel={`AI延迟${latencyTier === 'unknown' ? '未知' : `${lastLatencyMs}毫秒` + (latencyTier === 'green' ? '，正常' : latencyTier === 'yellow' ? '，较慢' : '，很慢')}`}
      accessibilityRole="image"
    >
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
    color: '#9E9E9E',
    minWidth: 32,
  },
});
