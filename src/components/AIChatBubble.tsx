/**
 * AI 会话气泡组件 — 现代化设计
 *
 * 设计特征：
 * - 用户气泡：品牌色背景，右对齐，微阴影
 * - AI 气泡：表面色背景，左对齐，带头像占位
 * - 时间戳 + AI 提示
 * - 支持消息状态指示
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
      marginVertical: spacing.xs,
      paddingHorizontal: spacing.md,
    },
    userRow: {
      justifyContent: 'flex-end',
    },
    aiRow: {
      justifyContent: 'flex-start',
    },

    // AI 头像占位
    aiAvatar: {
      width: 32 * scale,
      height: 32 * scale,
      borderRadius: radii.full,
      backgroundColor: colors.brand.primaryMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm,
      alignSelf: 'flex-end',
    },
    aiAvatarText: {
      fontSize: 13 * scale,
      fontWeight: '700',
      color: colors.brand.primary,
    },

    // 气泡容器
    bubbleWrapper: {
      maxWidth: '75%',
    },

    // 气泡主体
    bubble: {
      borderRadius: radii.lg,
      paddingHorizontal: spacing.md + 2,
      paddingVertical: spacing.sm + 2,
    },
    userBubble: {
      backgroundColor: colors.chat.userBubble,
      borderBottomRightRadius: radii.sm,
      ...theme.shadows.sm,
    },
    aiBubble: {
      backgroundColor: colors.chat.aiBubble,
      borderBottomLeftRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },

    // 消息文字
    content: {
      fontSize: 15 * scale,
      lineHeight: 21 * scale,
    },
    userContent: {
      color: colors.chat.userBubbleText,
    },
    aiContent: {
      color: colors.chat.aiBubbleText,
    },

    // 元信息行
    metaRow: {
      flexDirection: 'row',
      marginTop: spacing.xs,
      paddingHorizontal: spacing.xs,
      gap: spacing.sm,
    },
    userMeta: {
      justifyContent: 'flex-end',
    },
    aiMeta: {
      justifyContent: 'flex-start',
      paddingLeft: 32 * scale + spacing.sm,
    },
    timestamp: {
      fontSize: 11 * scale,
      color: colors.text.tertiary,
    },
    aiHint: {
      fontSize: 11 * scale,
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
      {/* AI 头像 */}
      {!isUser && (
        <View style={styles.aiAvatar}>
          <Text style={styles.aiAvatarText}>AI</Text>
        </View>
      )}

      <View style={styles.bubbleWrapper}>
        {/* 气泡主体 */}
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
          <Text style={[styles.content, isUser ? styles.userContent : styles.aiContent]}>
            {content}
          </Text>
        </View>

        {/* 元信息 */}
        <View style={[styles.metaRow, isUser ? styles.userMeta : styles.aiMeta]}>
          {timeStr ? <Text style={styles.timestamp}>{timeStr}</Text> : null}
          {!isUser && <Text style={styles.aiHint}>AI 生成，请确认</Text>}
        </View>
      </View>
    </View>
  );
}