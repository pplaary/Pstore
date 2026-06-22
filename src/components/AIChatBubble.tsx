/**
 * AI 会话气泡组件
 *
 * 渲染用户/AI 消息气泡，包含：
 * - 用户气泡：绿色背景，右对齐
 * - AI 气泡：浅灰背景，左对齐 + "AI 生成，请确认" 提示
 * - 时间戳（小时:分钟）
 *
 * spec-v4.5 §3.1 色彩 Token 对齐
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// ==================== 类型 ====================

export interface AIChatBubbleProps {
  /** 消息角色 */
  role: 'user' | 'assistant';
  /** 消息内容 */
  content: string;
  /** 时间戳（可选） */
  timestamp?: string;
}

// ==================== 色彩常量 ====================

const COLORS = {
  userBubble: '#D1FAE5',
  userBubbleText: '#065F46',
  aiBubble: '#F1F5F9',
  aiBubbleText: '#1E293B',
  textSecondary: '#64748B',
};

// ==================== 辅助函数 ====================

/**
 * 格式化时间戳为 HH:MM。
 */
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

// ==================== 组件 ====================

/**
 * AI 会话气泡组件。
 */
export function AIChatBubble({ role, content, timestamp }: AIChatBubbleProps): JSX.Element {
  const isUser = role === 'user';
  const timeStr = formatTime(timestamp);

  return (
    <View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.aiContainer,
      ]}
    >
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.aiBubble,
        ]}
      >
        <Text
          style={[
            styles.content,
            isUser ? styles.userContent : styles.aiContent,
          ]}
        >
          {content}
        </Text>
      </View>
      <View style={[styles.metaRow, isUser ? styles.userMeta : styles.aiMeta]}>
        {timeStr ? (
          <Text style={styles.timestamp}>{timeStr}</Text>
        ) : null}
        {!isUser && (
          <Text style={styles.aiHint}>AI 生成，请确认</Text>
        )}
      </View>
    </View>
  );
}

// ==================== 样式 ====================

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    maxWidth: '80%',
  },
  // 用户气泡：右对齐
  userContainer: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  // AI 气泡：左对齐
  aiContainer: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  // 气泡主体
  bubble: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: COLORS.userBubble,
  },
  aiBubble: {
    backgroundColor: COLORS.aiBubble,
  },
  // 消息文字
  content: {
    fontSize: 15,
    lineHeight: 20,
  },
  userContent: {
    color: COLORS.userBubbleText,
  },
  aiContent: {
    color: COLORS.aiBubbleText,
  },
  // 元信息行（时间戳 + AI 提示）
  metaRow: {
    flexDirection: 'row',
    marginTop: 4,
    paddingHorizontal: 4,
    gap: 8,
  },
  userMeta: {
    justifyContent: 'flex-end',
  },
  aiMeta: {
    justifyContent: 'flex-start',
  },
  timestamp: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  aiHint: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
});
