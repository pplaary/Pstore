/**
 * AI 会话气泡组件 — 设计稿对齐
 *
 * 设计特征：
 * - AI 气泡：薄荷绿背景 (#D4F8D4)，时间戳在气泡内右下角
 * - 用户气泡：浅紫背景 (#F0ECFE)，时间戳在气泡内右下角
 * - 无头像，纯文字气泡
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, type Theme } from '../theme/ThemeContext';

// ==================== 类型 ====================

export interface AIChatBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

// ==================== 辅助函数 ====================

function formatTime(timestamp?: string): string {
  if (!timestamp) return '';
  try {
    const date = new Date(timestamp);
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  } catch {
    return '';
  }
}

function createStyles(theme: Theme) {
  const { colors, spacing, radii, scale } = theme;
  return StyleSheet.create({
    // 消息行容器
    row: {
      flexDirection: 'row',
      marginVertical: 4 * scale,
      paddingHorizontal: spacing.lg,
    },
    userRow: {
      justifyContent: 'flex-end',
    },
    aiRow: {
      justifyContent: 'flex-start',
    },

    // 气泡容器
    bubbleWrapper: {
      maxWidth: '80%',
    },

    // 气泡主体
    bubble: {
      borderRadius: 12 * scale,
      paddingHorizontal: 14 * scale,
      paddingTop: 10 * scale,
      paddingBottom: 6 * scale,
    },
    userBubble: {
      backgroundColor: colors.chat.userBubble,
      borderBottomRightRadius: 4 * scale,
    },
    aiBubble: {
      backgroundColor: colors.chat.aiBubble,
      borderBottomLeftRadius: 4 * scale,
    },

    // 消息文字
    content: {
      fontSize: 14 * scale,
      lineHeight: 20 * scale,
    },
    userContent: {
      color: colors.chat.userBubbleText,
    },
    aiContent: {
      color: colors.chat.aiBubbleText,
    },

    // 时间戳（气泡内右下角）
    timestampRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: 4 * scale,
      paddingBottom: 2 * scale,
    },
    timestamp: {
      fontSize: 10 * scale,
      color: colors.text.tertiary,
    },
  });
}

// ==================== 组件 ====================

export function AIChatBubble({ role, content, timestamp }: AIChatBubbleProps): JSX.Element {
  const { theme } = useTheme();
  const isUser = role === 'user';
  const timeStr = formatTime(timestamp);

  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={[styles.row, isUser ? styles.userRow : styles.aiRow]}>
      <View style={styles.bubbleWrapper}>
        {/* 气泡主体 */}
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
          <Text style={[styles.content, isUser ? styles.userContent : styles.aiContent]}>
            {content}
          </Text>
          {timeStr ? (
            <View style={styles.timestampRow}>
              <Text style={styles.timestamp}>{timeStr}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}