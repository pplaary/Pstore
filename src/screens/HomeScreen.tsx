/**
 * 首页 — AI 对话 + 智能物品管理
 *
 * 设计特征：
 * - 现代化聊天界面，类主流 IM 体验
 * - 底部固定输入栏，药丸形设计，单手友好
 * - 语音输入 + 扫码快速入口
 * - 空态引导：无消息时展示快捷操作
 * - 键盘自适应：输入栏跟随键盘上移
 * - 流式输出：AI 回复逐字渲染
 * - 头图：简洁状态栏 + 品牌标题
 *
 * 单手交互要点：
 * - 底部 Tab 栏（抽屉入口在左上角）
 * - 药丸形输入栏在拇指热区
 * - 语音按钮长按触发
 * - 扫码按钮在输入栏右侧
 * - 购物车浮层从底部弹出
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Animated,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Easing,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useTheme, type Theme } from '../theme/ThemeContext';
import { AIChatBubble } from '../components/AIChatBubble';
import { VoiceButton } from '../components/VoiceButton';
import { useAIConfigStore } from '../store/aiConfig';
import { useCartStore } from '../store/cart';
import { callAI, type AIMessage } from '../services/ai';
import * as SecureStore from 'expo-secure-store';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ==================== 类型 ====================

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
}

// ==================== 样式工厂 ====================

function createStyles(theme: Theme) {
  const { colors, spacing, radii, scale } = theme;
  return StyleSheet.create({
    // 页面容器
    container: {
      flex: 1,
      backgroundColor: colors.surface.s0,
    },

    // 自定义 Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: Platform.OS === 'ios' ? 48 : 36,
      paddingBottom: spacing.sm,
      backgroundColor: colors.surface.s1,
      borderBottomWidth: 0.5,
      borderBottomColor: colors.border.subtle,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    menuButton: {
      width: 40 * scale,
      height: 40 * scale,
      borderRadius: radii.full,
      backgroundColor: colors.surface.s0,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: spacing.sm,
    },
    headerTitle: {
      fontSize: 18 * scale,
      fontWeight: '700',
      color: colors.text.primary,
      letterSpacing: -0.3,
    },
    headerSubtitle: {
      fontSize: 11 * scale,
      color: colors.brand.success,
      fontWeight: '600',
      marginTop: 1,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    headerIconBtn: {
      width: 40 * scale,
      height: 40 * scale,
      borderRadius: radii.full,
      backgroundColor: colors.surface.s0,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cartBadge: {
      position: 'absolute',
      top: -2,
      right: -2,
      minWidth: 18 * scale,
      height: 18 * scale,
      borderRadius: radii.full,
      backgroundColor: colors.brand.danger,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    cartBadgeText: {
      fontSize: 10 * scale,
      fontWeight: '700',
      color: colors.text.inverse,
    },

    // 空态
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.xxxl,
    },
    emptyIcon: {
      width: 80 * scale,
      height: 80 * scale,
      borderRadius: radii.xl,
      backgroundColor: colors.brand.primaryMuted,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    emptyTitle: {
      fontSize: 20 * scale,
      fontWeight: '700',
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    emptySubtitle: {
      fontSize: 14 * scale,
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: 20 * scale,
      marginBottom: spacing.xxl,
    },

    // 快捷操作 (空态)
    quickActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      justifyContent: 'center',
    },
    quickAction: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radii.full,
      backgroundColor: colors.surface.s1,
      borderWidth: 1,
      borderColor: colors.border.default,
      gap: spacing.sm,
    },
    quickActionText: {
      fontSize: 14 * scale,
      color: colors.text.primary,
      fontWeight: '500',
    },

    // 消息列表
    messageList: {
      flex: 1,
    },
    messageContent: {
      paddingVertical: spacing.sm,
    },

    // 加载指示器
    loadingBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.sm,
    },
    typingIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.lg + 32 * scale + spacing.sm,
      paddingVertical: spacing.sm,
    },
    typingDot: {
      width: 6 * scale,
      height: 6 * scale,
      borderRadius: radii.full,
      backgroundColor: colors.text.tertiary,
    },

    // 底部输入栏
    bottomBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.surface.s1,
      borderTopWidth: 0.5,
      borderTopColor: colors.border.subtle,
      gap: spacing.sm,
      paddingBottom: Platform.OS === 'ios' ? 20 : spacing.sm,
    },
    inputContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-end',
      backgroundColor: colors.surface.s0,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.border.default,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xs,
      minHeight: 42 * scale,
      maxHeight: 120 * scale,
    },
    input: {
      flex: 1,
      fontSize: 15 * scale,
      color: colors.text.primary,
      paddingVertical: 0,
      paddingRight: spacing.sm,
      minHeight: 30 * scale,
      maxHeight: 100 * scale,
    },
    sendButton: {
      width: 36 * scale,
      height: 36 * scale,
      borderRadius: radii.full,
      backgroundColor: colors.brand.primary,
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: spacing.xs,
      marginBottom: 2,
    },
    sendButtonDisabled: {
      backgroundColor: colors.border.default,
    },
    scanButton: {
      width: 42 * scale,
      height: 42 * scale,
      borderRadius: radii.full,
      backgroundColor: colors.surface.s0,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border.default,
    },

    // 购物车浮层
    cartSheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.surface.s2,
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.md,
      paddingBottom: Platform.OS === 'ios' ? 32 : spacing.lg,
      ...theme.shadows.lg,
    },
    cartSheetHandle: {
      width: 36 * scale,
      height: 4 * scale,
      borderRadius: radii.full,
      backgroundColor: colors.border.default,
      alignSelf: 'center',
      marginBottom: spacing.md,
    },
    cartSheetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    cartSheetTitle: {
      fontSize: 16 * scale,
      fontWeight: '700',
      color: colors.text.primary,
    },
    cartSheetClear: {
      fontSize: 13 * scale,
      color: colors.brand.danger,
      fontWeight: '600',
    },
    cartItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderBottomWidth: 0.5,
      borderBottomColor: colors.border.subtle,
      gap: spacing.sm,
    },
    cartItemName: {
      flex: 1,
      fontSize: 14 * scale,
      color: colors.text.primary,
    },
    cartItemQty: {
      fontSize: 13 * scale,
      color: colors.text.secondary,
    },
    cartItemPrice: {
      fontSize: 14 * scale,
      fontWeight: '600',
      color: colors.text.primary,
    },
    cartSheetTotal: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.md,
      paddingVertical: spacing.sm,
    },
    cartSheetTotalLabel: {
      fontSize: 14 * scale,
      color: colors.text.secondary,
    },
    cartSheetTotalPrice: {
      fontSize: 20 * scale,
      fontWeight: '800',
      color: colors.brand.danger,
    },
    cartSheetAction: {
      backgroundColor: colors.brand.primary,
      borderRadius: radii.md,
      paddingVertical: spacing.md + 2,
      alignItems: 'center',
      marginTop: spacing.md,
    },
    cartSheetActionText: {
      fontSize: 15 * scale,
      fontWeight: '700',
      color: colors.text.inverse,
    },

    // 滚动到底部按钮
    scrollToBottom: {
      position: 'absolute',
      bottom: 80,
      right: spacing.lg,
      width: 36 * scale,
      height: 36 * scale,
      borderRadius: radii.full,
      backgroundColor: colors.surface.s1,
      justifyContent: 'center',
      alignItems: 'center',
      ...theme.shadows.md,
    },
  });
}

// ==================== 子组件 ====================

function TypingIndicator({ theme }: { theme: Theme }) {
  const dots = useRef(
    [0, 1, 2].map((i) => ({
      anim: new Animated.Value(0.3),
      delay: i * 200,
    }))
  ).current;

  useEffect(() => {
    const loops = dots.map((d) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(d.delay),
          Animated.timing(d.anim, {
            toValue: 1,
            duration: 400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(d.anim, {
            toValue: 0.3,
            duration: 400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);

  const { colors, spacing, scale } = theme;

  return (
    <View style={createStyles(theme).typingIndicator}>
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={[
            createStyles(theme).typingDot,
            { opacity: d.anim },
          ]}
        />
      ))}
    </View>
  );
}

function EmptyState({
  theme,
  onQuickAction,
  onScan,
}: {
  theme: Theme;
  onQuickAction: (text: string) => void;
  onScan: () => void;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { colors, scale } = theme;

  const quickActions = [
    { icon: 'search' as const, label: '查找物品', text: '帮我查找最近添加的物品' },
    { icon: 'add-circle-outline' as const, label: '添加物品', text: '我想添加一个物品' },
    { icon: 'list-outline' as const, label: '查看库存', text: '显示我的库存清单' },
    { icon: 'stats-chart-outline' as const, label: '价格分析', text: '分析我的物品价格趋势' },
  ];

  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <Ionicons name="chatbubbles" size={36 * scale} color={colors.brand.primary} />
      </View>
      <Text style={styles.emptyTitle}>AI 智能助手</Text>
      <Text style={styles.emptySubtitle}>
        通过对话管理你的物品，支持语音输入、扫码添加和自然语言查询
      </Text>
      <View style={styles.quickActions}>
        {quickActions.map((action, i) => (
          <TouchableOpacity
            key={i}
            style={styles.quickAction}
            onPress={() => onQuickAction(action.text)}
            accessibilityLabel={action.label}
            accessibilityRole="button"
          >
            <Ionicons name={action.icon} size={16 * scale} color={colors.brand.primary} />
            <Text style={styles.quickActionText}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        style={[
          styles.quickAction,
          { marginTop: 16 * scale, backgroundColor: colors.brand.primaryMuted, borderColor: colors.brand.primary + '40' },
        ]}
        onPress={onScan}
        accessibilityLabel="扫码添加物品"
        accessibilityRole="button"
      >
        <Ionicons name="scan" size={16 * scale} color={colors.brand.primary} />
        <Text style={[styles.quickActionText, { color: colors.brand.primary }]}>扫码添加</Text>
      </TouchableOpacity>
    </View>
  );
}

// ==================== 主组件 ====================

export default function HomeScreen({ navigation }: any) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { colors, scale } = theme;

  const { mode, reachable, isVoiceAvailable } = useAIConfigStore();
  const { items: cartItems, total: cartTotal, clearCart } = useCartStore();

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const cartAnim = useRef(new Animated.Value(0)).current;

  const cartCount = cartItems.reduce((s, i) => s + i.quantity, 0);

  // 切换购物车浮层
  const toggleCart = useCallback(() => {
    const toValue = showCart ? 0 : 1;
    setShowCart(!showCart);
    Animated.spring(cartAnim, {
      toValue,
      useNativeDriver: true,
      damping: 20,
      stiffness: 200,
    }).start();
  }, [showCart, cartAnim]);

  // 发送消息
  const handleSend = useCallback(async () => {
    const trimmed = inputText.trim();
    if (!trimmed || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    // 滚动到最新消息
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      // 通过 AI 服务发送消息并获取回复
      const aiConfigRaw = await SecureStore.getItemAsync('pstore_ai_config');
      const aiConfig = aiConfigRaw ? JSON.parse(aiConfigRaw) : null;
      const aiMessages: AIMessage[] = [
        { role: 'system', content: '你是 PStore 智能物品管理助手。帮助用户管理物品库存、查询信息、添加物品。回复简洁友好。' },
        { role: 'user', content: trimmed },
      ];
      const reply = aiConfig ? await callAI(aiConfig, aiMessages) : null;
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: reply ?? '抱歉，AI 服务暂不可用，请检查配置。',
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '抱歉，处理请求时出现了问题，请重试。',
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [inputText, isLoading]);

  // 语音输入回调
  const handleVoiceResult = useCallback((text: string) => {
    setInputText(text);
  }, []);

  // 快捷操作
  const handleQuickAction = useCallback((text: string) => {
    setInputText(text);
    inputRef.current?.focus();
  }, []);

  // 扫码
  const handleScan = useCallback(() => {
    navigation.navigate('Scan');
  }, [navigation]);

  // 渲染消息
  const renderMessage = useCallback(
    ({ item }: { item: Message }) => (
      <AIChatBubble role={item.role} content={item.content} timestamp={item.timestamp} />
    ),
    []
  );

  const renderFooter = useCallback(() => {
    if (!isLoading) return null;
    return <TypingIndicator theme={theme} />;
  }, [isLoading, theme]);

  const renderEmpty = useCallback(() => {
    if (messages.length > 0) return null;
    return <EmptyState theme={theme} onQuickAction={handleQuickAction} onScan={handleScan} />;
  }, [messages.length, theme, handleQuickAction, handleScan]);

  return (
    <View style={styles.container}>
      {/* 自定义 Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => navigation.openDrawer()}
            accessibilityLabel="打开菜单"
            accessibilityRole="button"
          >
            <Ionicons name="menu" size={22 * scale} color={colors.text.primary} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>PStore</Text>
            <Text style={styles.headerSubtitle}>AI 在线</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={toggleCart}
            accessibilityLabel="购物车"
            accessibilityRole="button"
          >
            <Ionicons name="cart-outline" size={22 * scale} color={colors.text.primary} />
            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount > 99 ? '99+' : cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* 消息列表 */}
      <FlatList
        ref={flatListRef}
        style={styles.messageList}
        contentContainerStyle={[
          styles.messageContent,
          messages.length === 0 && { flex: 1 },
        ]}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        onContentSizeChange={() => {
          if (messages.length > 0) {
            flatListRef.current?.scrollToEnd({ animated: false });
          }
        }}
        keyboardShouldPersistTaps="handled"
      />

      {/* 底部输入栏 */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.bottomBar}>
          {/* 扫码按钮 */}
          <TouchableOpacity
            style={styles.scanButton}
            onPress={handleScan}
            accessibilityLabel="扫码"
            accessibilityRole="button"
          >
            <Ionicons name="scan" size={22 * scale} color={colors.text.primary} />
          </TouchableOpacity>

          {/* 输入框容器 */}
          <View style={styles.inputContainer}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="发送消息..."
              placeholderTextColor={colors.text.tertiary}
              multiline
              maxLength={500}
              editable={!isLoading}
              accessibilityLabel="输入消息"
              returnKeyType="send"
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
            />
            {inputText.trim().length > 0 && (
              <TouchableOpacity
                style={styles.sendButton}
                onPress={handleSend}
                accessibilityLabel="发送"
                accessibilityRole="button"
              >
                <Ionicons name="arrow-up" size={18 * scale} color={colors.text.inverse} />
              </TouchableOpacity>
            )}
            {inputText.trim().length === 0 && (
              <VoiceButton onResult={handleVoiceResult} available={isVoiceAvailable} />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* 购物车浮层 */}
      {showCart && (
        <Animated.View
          style={[
            styles.cartSheet,
            {
              transform: [
                {
                  translateY: cartAnim.interpolate({ inputRange: [0, 1], outputRange: [300, 0] }),
                },
              ],
            },
          ]}
        >
          <View style={styles.cartSheetHandle} />
          <View style={styles.cartSheetHeader}>
            <Text style={styles.cartSheetTitle}>购物车 ({cartItems.length})</Text>
            <TouchableOpacity onPress={clearCart} accessibilityLabel="清空购物车">
              <Text style={styles.cartSheetClear}>清空</Text>
            </TouchableOpacity>
          </View>
          {cartItems.map((item) => (
            <View key={item.productId} style={styles.cartItem}>
              <Text style={styles.cartItemName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.cartItemQty}>x{item.quantity}</Text>
              <Text style={styles.cartItemPrice}>¥{(item.price * item.quantity).toFixed(2)}</Text>
            </View>
          ))}
          <View style={styles.cartSheetTotal}>
            <Text style={styles.cartSheetTotalLabel}>合计</Text>
            <Text style={styles.cartSheetTotalPrice}>¥{cartTotal.toFixed(2)}</Text>
          </View>
          <TouchableOpacity
            style={styles.cartSheetAction}
            onPress={() => {
              toggleCart();
              handleQuickAction('帮我整理购物车里的物品');
            }}
            accessibilityLabel="使用AI处理购物车"
            accessibilityRole="button"
          >
            <Text style={styles.cartSheetActionText}>AI 处理购物车</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}