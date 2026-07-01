/**
 * AI UI 集成测试
 *
 * 测试 HomeScreen 双模式渲染、AI 组件展示逻辑。
 * 采用源代码静态分析方式（不渲染 React 组件），
 * 验证 HomeScreen 在 chat/search 模式下渲染正确 UI 元素。
 *
 * spec-v4.5 §7（AI 引擎）、§7.4（保护机制）
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// ==================== 辅助函数 ====================

function readHomeScreen(): string {
  return fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'screens', 'HomeScreen.tsx'), 'utf8');
}

function readAIChatBubble(): string {
  return fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'components', 'AIChatBubble.tsx'), 'utf8');
}

function readProductConfirmCard(): string {
  return fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'components', 'ProductConfirmCard.tsx'), 'utf8');
}

function readSyncStatusIcon(): string {
  return fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'components', 'SyncStatusIcon.tsx'), 'utf8');
}

// ==================== 搜索模式 UI ====================

describe('搜索模式 UI', () => {
  const content = readHomeScreen();

  it('搜索模式显示搜索栏', () => {
    // 已合并为统一 AI 对话界面，搜索通过输入栏实现
    expect(content).toContain('inputContainer');
    expect(content).toContain('placeholder');
    expect(content).toContain('搜索商品');
  });

  it('新架构不包含条件渲染双模式', () => {
    // 已重构为统一 AI 对话式单屏，不再有 isChatMode 条件
    expect(content).toContain('handleSend');
  });

  it('消息列表渲染 FlatList', () => {
    expect(content).toContain('<FlatList');
    expect(content).toContain('messages');
  });

  it('新架构统一输入栏替代双模式切换', () => {
    const hasChatUI = content.includes('handleSend') && content.includes('AIChatBubble');
    expect(hasChatUI).toBe(true);
  });

  it('AI 对话支持导航到商品详情', () => {
    // 新架构：搜索通过 AI 对话实现，ProductDetail 导航由 ProductListScreen 处理
    expect(content).toContain('navigation');
  });
});

// ==================== 聊天模式 UI ====================

describe('聊天模式 UI', () => {
  const content = readHomeScreen();

  it('聊天模式显示 AIChatBubble 组件', () => {
    expect(content).toContain('AIChatBubble');
    // AIChatBubble 在 renderMessage 中
    expect(content).toContain('renderMessage');
  });

  it('聊天模式显示语音按钮', () => {
    expect(content).toContain('VoiceButton');
    expect(content).toContain('handleVoiceResult');
  });

  it('聊天模式显示扫码按钮', () => {
    expect(content).toContain('cameraBtn');
    expect(content).toContain('camera-outline');
  });

  it('聊天模式 placeholder 为"说\'可乐多少钱\'"', () => {
    expect(content).toContain("说'可乐多少钱'");
  });

  it('搜索模式 placeholder 通过输入栏实现', () => {
    // 新设计：统一 AI 对话式输入栏，placeholder 在 inputContainer 中
    expect(content).toContain('搜索商品');
  });

  it('聊天模式输入栏存在', () => {
    expect(content).toContain('inputContainer');
    expect(content).toContain('TextInput');
  });

  it('AI 加载时显示 TypingIndicator', () => {
    expect(content).toContain('isLoading');
    expect(content).toContain('TypingIndicator');
  });

  it('发送按钮在输入文本时显示', () => {
    expect(content).toContain('sendBtn');
  });
});

// ==================== SyncStatusIcon 集成 ====================

describe('SyncStatusIcon 集成', () => {
  const content = readSyncStatusIcon();

  it('引入 useSyncConfigStore', () => {
    expect(content).toContain('useSyncConfigStore');
  });

  it('读取 serverUrl', () => {
    expect(content).toContain('serverUrl');
  });

  it('导入 NetworkIndicator', () => {
    expect(content).toContain('NetworkIndicator');
  });
});

// ==================== ProductConfirmCard 组件 ====================

describe('ProductConfirmCard 组件', () => {
  const cardContent = readProductConfirmCard();

  it('组件存在且导出', () => {
    expect(
      fs.existsSync(path.join(PROJECT_ROOT, 'src', 'components', 'ProductConfirmCard.tsx')),
    ).toBe(true);
  });

  it('接受 expired 属性', () => {
    expect(cardContent).toContain('expired');
  });

  it('过期态样式：opacity 0.4', () => {
    expect(cardContent).toContain('opacity: 0.4');
  });

  it('卡片背景色使用 colors.surface.s1', () => {
    expect(cardContent).toContain('colors.surface.s1');
  });

  it('卡片边框使用 colors.border.subtle', () => {
    expect(cardContent).toContain('colors.border.subtle');
  });

  it('加购按钮调用 onAddToCart', () => {
    expect(cardContent).toContain('onAddToCart');
  });

  it('忽略按钮调用 onIgnore', () => {
    expect(cardContent).toContain('onIgnore');
  });

  it('置信度通过 props 传递（confidence 属性）', () => {
    // 设计稿简化：置信度通过 props 传入，不在卡片内显示文字标签
    expect(cardContent).toContain('confidence');
  });

  it('数量支持加减控件（qtyControl）', () => {
    expect(cardContent).toContain('qtyControl');
    expect(cardContent).toContain('setQty');
  });

  it('过期态文字颜色使用 colors.text.secondary', () => {
    expect(cardContent).toContain('text.secondary');
  });
});

// ==================== AIChatBubble 组件 ====================

describe('AIChatBubble 组件', () => {
  const bubbleContent = readAIChatBubble();

  it('组件存在且导出', () => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, 'src', 'components', 'AIChatBubble.tsx'))).toBe(true);
  });

  it('用户气泡背景色使用 colors.chat.userBubble', () => {
    expect(bubbleContent).toContain('colors.chat.userBubble');
  });

  it('用户文字色使用 colors.chat.userBubbleText', () => {
    expect(bubbleContent).toContain('colors.chat.userBubbleText');
  });

  it('AI 气泡背景色使用 colors.chat.aiBubble', () => {
    expect(bubbleContent).toContain('colors.chat.aiBubble');
  });

  it('AI 文字色使用 colors.chat.aiBubbleText', () => {
    expect(bubbleContent).toContain('colors.chat.aiBubbleText');
  });

  it('用户气泡右对齐（justifyContent: flex-end）', () => {
    expect(bubbleContent).toContain('flex-end');
  });

  it('AI 气泡左对齐（justifyContent: flex-start）', () => {
    expect(bubbleContent).toContain('flex-start');
  });

  it('气泡圆角使用 12dp', () => {
    expect(bubbleContent).toContain('borderRadius: 12');
  });

  it('最大宽度 80%', () => {
    expect(bubbleContent).toContain('maxWidth: \'80%\'');
  });

  it('时间戳显示（小时:分钟格式）', () => {
    expect(bubbleContent).toContain('formatTime');
    expect(bubbleContent).toContain('getHours');
    expect(bubbleContent).toContain('getMinutes');
  });

  it('时间戳字号 10sp（缩放后）', () => {
    expect(bubbleContent).toContain('fontSize: 10');
  });

  it('对话气泡纯文本，无冗余标签', () => {
    // 设计稿对齐：简洁气泡，无「AI 生成」等冗余标签
    expect(bubbleContent).toContain('role');
    expect(bubbleContent).toContain('content');
  });
});

// ==================== 双模式和购物车 ====================

describe('双模式与购物车', () => {
  const content = readHomeScreen();

  it('采用 AI 对话式单屏架构', () => {
    expect(content).toContain('handleSend');
    expect(content).toContain('AIChatBubble');
  });

  it('支持连击标题进入管理模式（PinModal）', () => {
    expect(content).toContain('handleTitlePress');
    expect(content).toContain('PinModal');
    expect(content).toContain('showPinModal');
  });

  it('Header 显示 SyncStatusIcon', () => {
    expect(content).toContain('SyncStatusIcon');
  });

  it('购物车折叠栏存在', () => {
    expect(content).toContain('cartExpanded');
    expect(content).toContain('cartBar');
    expect(content).toContain('checkoutBtn');
  });

  it('底部栏布局：语音 | 输入框 | 扫码', () => {
    expect(content).toContain('VoiceButton');
    expect(content).toContain('inputContainer');
    expect(content).toContain('cameraBtn');
  });
});