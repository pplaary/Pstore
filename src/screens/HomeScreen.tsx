/**
 * 首页 — AI 对话 + 智能物品管理
 *
 * 设计稿对齐：
 * - 顶部 Header：汉堡菜单 | PStore 标题 | 同步图标 + 购物车
 * - AI 对话区域：消息列表 + 产品确认卡片
 * - 购物车：可折叠底部栏（折叠态显示合计+结账，展开态显示物品列表）
 * - 底部输入栏：药丸形，麦克风(左) + 输入框(中) + 相机(右)
 * - 结账弹窗：居中卡片，合计清单，关闭并清空
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
  Modal,
  Dimensions,
  Easing,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Theme } from '../theme/ThemeContext';
import { AIChatBubble } from '../components/AIChatBubble';
import { VoiceButton } from '../components/VoiceButton';
import { PinModal } from '../components/PinModal';
import { SyncStatusIcon } from '../components/SyncStatusIcon';
import { ThemedTouchable } from '../components/ThemedTouchable';
import { useAIConfigStore } from '../store/aiConfig';
import { useCartStore } from '../store/cart';
import { useStore } from '../context/store';
import { callAI, type AIMessage } from '../services/ai';
import { searchProducts } from '../db/search';
import * as SecureStore from 'expo-secure-store';
import type { Product } from '../db/types';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { HomeTabParamList, HomeScreenCompositeProps } from '../navigation/types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
    container: {
      flex: 1,
      backgroundColor: colors.surface.s0,
    },

    // ─── Header ───
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
      backgroundColor: colors.brand.primary,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    cartBadgeText: {
      fontSize: 10 * scale,
      fontWeight: '700',
      color: colors.text.inverse,
    },

    // ─── 消息列表 ───
    messageList: {
      flex: 1,
    },
    messageContent: {
      paddingVertical: spacing.sm,
    },

    // ─── 空态 ───
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

    // ─── 快捷操作 ───
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

    // ─── 输入指示器 ───
    typingIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4 * scale,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    typingDot: {
      width: 6 * scale,
      height: 6 * scale,
      borderRadius: radii.full,
      backgroundColor: colors.text.tertiary,
    },

    // ─── 底部输入栏 ───
    bottomBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.surface.s1,
      borderTopWidth: 0.5,
      borderTopColor: colors.border.subtle,
      gap: spacing.sm,
      paddingBottom: Platform.OS === 'ios' ? 24 : spacing.sm,
    },
    inputContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface.s0,
      borderRadius: 24 * scale,
      borderWidth: 1,
      borderColor: colors.border.default,
      paddingHorizontal: spacing.lg,
      paddingVertical: 2 * scale,
      minHeight: 44 * scale,
    },
    micBtn: {
      width: 28 * scale,
      height: 28 * scale,
      justifyContent: 'center',
      alignItems: 'center',
    },
    input: {
      flex: 1,
      fontSize: 14 * scale,
      color: colors.text.primary,
      paddingVertical: 0,
      paddingHorizontal: spacing.sm,
      minHeight: 30 * scale,
    },
    sendBtn: {
      width: 28 * scale,
      height: 28 * scale,
      borderRadius: radii.full,
      backgroundColor: colors.brand.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cameraBtn: {
      width: 42 * scale,
      height: 42 * scale,
      borderRadius: radii.full,
      backgroundColor: colors.surface.s0,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border.default,
    },

    // ─── 购物车折叠栏（底部输入栏上方） ───
    cartBar: {
      backgroundColor: colors.surface.s1,
      borderTopWidth: 0.5,
      borderTopColor: colors.border.subtle,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    cartBarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    cartBarLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    cartBarIcon: {
      width: 32 * scale,
      height: 32 * scale,
      borderRadius: radii.full,
      backgroundColor: colors.brand.primaryMuted,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cartBarCount: {
      fontSize: 13 * scale,
      fontWeight: '600',
      color: colors.brand.primary,
    },
    cartBarTotal: {
      fontSize: 16 * scale,
      fontWeight: '700',
      color: colors.text.primary,
    },
    cartBarRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    cartBarExpandBtn: {
      width: 28 * scale,
      height: 28 * scale,
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.border.default,
      justifyContent: 'center',
      alignItems: 'center',
    },
    checkoutBtn: {
      backgroundColor: colors.brand.primary,
      borderRadius: 6 * scale,
      paddingHorizontal: 20 * scale,
      paddingVertical: 8 * scale,
    },
    checkoutBtnText: {
      fontSize: 14 * scale,
      fontWeight: '600',
      color: colors.text.inverse,
    },

    // ─── 购物车展开面板 ───
    cartExpanded: {
      backgroundColor: colors.surface.s1,
      borderTopLeftRadius: 20 * scale,
      borderTopRightRadius: 20 * scale,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      maxHeight: SCREEN_HEIGHT * 0.45,
      ...theme.shadows.lg,
    },
    cartExpandedHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    cartExpandedTitle: {
      fontSize: 16 * scale,
      fontWeight: '700',
      color: colors.text.primary,
    },
    cartExpandedClear: {
      fontSize: 13 * scale,
      color: colors.text.tertiary,
      fontWeight: '500',
    },
    cartItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderBottomWidth: 0.5,
      borderBottomColor: colors.border.subtle,
      gap: spacing.sm,
    },
    cartItemThumb: {
      width: 40 * scale,
      height: 40 * scale,
      borderRadius: 8 * scale,
      backgroundColor: colors.surface.s0,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cartItemName: {
      flex: 1,
      fontSize: 14 * scale,
      color: colors.text.primary,
      fontWeight: '500',
    },
    cartItemQty: {
      fontSize: 13 * scale,
      color: colors.text.secondary,
      marginRight: spacing.sm,
    },
    cartItemPrice: {
      fontSize: 14 * scale,
      fontWeight: '600',
      color: colors.text.primary,
    },
    cartExpandedFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    cartExpandedTotal: {
      fontSize: 16 * scale,
      fontWeight: '700',
      color: colors.text.primary,
    },
    cartExpandedTotalPrice: {
      fontSize: 18 * scale,
      fontWeight: '800',
      color: colors.brand.primary,
    },

    // ─── 结账弹窗（居中卡片） ───
    checkoutOverlay: {
      flex: 1,
      backgroundColor: colors.surface.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.xxl,
    },
    checkoutCard: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: colors.surface.s1,
      borderRadius: 20 * scale,
      padding: spacing.xxl,
      ...theme.shadows.lg,
    },
    checkoutCardTitle: {
      fontSize: 18 * scale,
      fontWeight: '700',
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: spacing.xl,
    },
    checkoutCloseBtn: {
      position: 'absolute',
      top: spacing.md,
      right: spacing.md,
      width: 32 * scale,
      height: 32 * scale,
      borderRadius: radii.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    checkoutItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderBottomWidth: 0.5,
      borderBottomColor: colors.border.subtle,
      gap: spacing.sm,
    },
    checkoutItemName: {
      flex: 1,
      fontSize: 14 * scale,
      color: colors.text.primary,
    },
    checkoutItemQty: {
      fontSize: 13 * scale,
      color: colors.text.secondary,
    },
    checkoutItemPrice: {
      fontSize: 14 * scale,
      fontWeight: '600',
      color: colors.text.primary,
    },
    checkoutTotal: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.lg,
    },
    checkoutTotalLabel: {
      fontSize: 15 * scale,
      fontWeight: '600',
      color: colors.text.primary,
    },
    checkoutTotalPrice: {
      fontSize: 22 * scale,
      fontWeight: '800',
      color: colors.brand.primary,
    },
    checkoutClearBtn: {
      backgroundColor: colors.brand.primary,
      borderRadius: 8 * scale,
      paddingVertical: 14 * scale,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    checkoutClearBtnText: {
      fontSize: 16 * scale,
      fontWeight: '700',
      color: colors.text.inverse,
    },
    checkoutClearHint: {
      fontSize: 12 * scale,
      color: colors.text.tertiary,
      textAlign: 'center',
      marginTop: spacing.sm,
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
          Animated.timing(d.anim, { toValue: 1, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(d.anim, { toValue: 0.3, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);

  return (
    <View style={createStyles(theme).typingIndicator}>
      {dots.map((d, i) => (
        <Animated.View key={i} style={[createStyles(theme).typingDot, { opacity: d.anim }]} />
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
        {[
          { icon: 'search' as const, label: '查找物品', text: '帮我查找最近添加的物品' },
          { icon: 'add-circle-outline' as const, label: '添加物品', text: '我想添加一个物品' },
        ].map((action, i) => (
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
    </View>
  );
}

// ==================== 主组件 ====================

export default function HomeScreen({ navigation }: HomeScreenCompositeProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { colors, scale } = theme;

  const { items: cartItems, total: cartTotal, clearCart } = useCartStore();
  const { db } = useStore();

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [cartExpanded, setCartExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showPinModal, setShowPinModal] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const titleTapCount = useRef(0);
  const titleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cartCount = cartItems.reduce((s, i) => s + i.quantity, 0);

  // ─── 连击标题 5 次进管理模式 ───
  const handleTitlePress = useCallback(() => {
    titleTapCount.current += 1;
    if (titleTapTimer.current) clearTimeout(titleTapTimer.current);
    if (titleTapCount.current >= 5) {
      titleTapCount.current = 0;
      setShowPinModal(true);
    } else {
      titleTapTimer.current = setTimeout(() => { titleTapCount.current = 0; }, 1000);
    }
  }, []);

  // ─── 结账：关闭并清空 ───
  const handleCheckoutClear = useCallback(() => {
    clearCart();
    setShowCheckout(false);
    setCartExpanded(false);
  }, [clearCart]);

  // ─── 发送消息 ───
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

    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
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
    } catch {
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

  // ─── 语音输入 ───
  const handleVoiceResult = useCallback((text: string) => {
    setInputText(text);
  }, []);

  // ─── 快捷操作 ───
  const handleQuickAction = useCallback((text: string) => {
    setInputText(text);
    inputRef.current?.focus();
  }, []);

  // ─── 扫码 ───
  const handleScan = useCallback(() => {
    (navigation as BottomTabNavigationProp<HomeTabParamList>).navigate({ name: 'Scan', params: {} });
  }, [navigation]);

  // ─── 渲染消息 ───
  const renderMessage = useCallback(
    ({ item }: { item: Message }) => (
      <AIChatBubble role={item.role} content={item.content} timestamp={item.timestamp} />
    ),
    [],
  );

  const renderFooter = useCallback(() => {
    if (!isLoading) return null;
    return <TypingIndicator theme={theme} />;
  }, [isLoading, theme]);

  const renderEmpty = useCallback(() => {
    if (messages.length > 0) return null;
    return <EmptyState theme={theme} onQuickAction={handleQuickAction} onScan={handleScan} />;
  }, [messages.length, theme, handleQuickAction, handleScan]);

  useEffect(() => {
    return () => {
      if (titleTapTimer.current) clearTimeout(titleTapTimer.current);
    };
  }, []);

  return (
    <View style={styles.container}>
      {/* Pin Modal */}
      <PinModal visible={showPinModal} onClose={() => setShowPinModal(false)} onSuccess={() => setShowPinModal(false)} />

      {/* ─── Header ─── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <ThemedTouchable style={styles.menuButton} onPress={() => navigation.openDrawer()} accessibilityLabel="打开菜单" accessibilityRole="button">
            <Ionicons name="menu" size={22 * scale} color={colors.text.primary} />
          </ThemedTouchable>
          <TouchableOpacity onPress={handleTitlePress} activeOpacity={1}>
            <Text style={styles.headerTitle}>PStore</Text>
            <Text style={styles.headerSubtitle}>AI 在线</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.headerRight}>
          <SyncStatusIcon />
          <ThemedTouchable style={styles.headerIconBtn} onPress={() => setCartExpanded(!cartExpanded)} disabled={cartCount === 0} accessibilityLabel={`购物车，${cartCount}件商品`} accessibilityRole="button">
            <Ionicons name="cart-outline" size={22 * scale} color={colors.text.primary} />
            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount > 99 ? '99+' : cartCount}</Text>
              </View>
            )}
          </ThemedTouchable>
        </View>
      </View>

      {/* ─── 消息列表 ─── */}
      <FlatList
        ref={flatListRef}
        style={styles.messageList}
        contentContainerStyle={[styles.messageContent, messages.length === 0 && { flex: 1 }]}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        onContentSizeChange={() => { if (messages.length > 0) flatListRef.current?.scrollToEnd({ animated: false }); }}
        keyboardShouldPersistTaps="handled"
      />

      {/* ─── 购物车折叠栏 ─── */}
      {cartCount > 0 && !cartExpanded && (
        <View style={styles.cartBar}>
          <View style={styles.cartBarRow}>
            <View style={styles.cartBarLeft}>
              <View style={styles.cartBarIcon}>
                <Ionicons name="cart" size={16 * scale} color={colors.brand.primary} />
              </View>
              <Text style={styles.cartBarCount}>购物车 ({cartCount})</Text>
              <Text style={styles.cartBarTotal}>合计 ¥{cartTotal.toFixed(2)}</Text>
            </View>
            <View style={styles.cartBarRight}>
              <TouchableOpacity style={styles.cartBarExpandBtn} onPress={() => setCartExpanded(true)} accessibilityLabel="展开购物车" accessibilityRole="button">
                <Ionicons name="chevron-up" size={16 * scale} color={colors.text.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.checkoutBtn} onPress={() => setShowCheckout(true)} accessibilityLabel="结账" accessibilityRole="button">
                <Text style={styles.checkoutBtnText}>结账</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ─── 购物车展开面板 ─── */}
      {cartExpanded && cartCount > 0 && (
        <View style={styles.cartExpanded}>
          <View style={styles.cartExpandedHeader}>
            <Text style={styles.cartExpandedTitle}>购物车 ({cartCount})</Text>
            <TouchableOpacity onPress={clearCart} accessibilityLabel="清空购物车" accessibilityRole="button">
              <Text style={styles.cartExpandedClear}>清空</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: SCREEN_HEIGHT * 0.3 }} bounces={false}>
            {cartItems.map((item) => (
              <View key={item.productId} style={styles.cartItem}>
                <View style={styles.cartItemThumb}>
                  <Ionicons name="cube-outline" size={18 * scale} color={colors.text.tertiary} />
                </View>
                <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.cartItemQty}>×{item.quantity}</Text>
                <Text style={styles.cartItemPrice}>¥{(item.price * item.quantity).toFixed(2)}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.cartExpandedFooter}>
            <Text style={styles.cartExpandedTotal}>合计</Text>
            <Text style={styles.cartExpandedTotalPrice}>¥{cartTotal.toFixed(2)}</Text>
          </View>
          <TouchableOpacity style={[styles.checkoutBtn, { alignSelf: 'stretch', paddingVertical: 12 * scale }]} onPress={() => setShowCheckout(true)} accessibilityLabel="结账" accessibilityRole="button">
            <Text style={styles.checkoutBtnText}>结账</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.cartBarExpandBtn, { alignSelf: 'center', marginTop: 8 * scale }]} onPress={() => setCartExpanded(false)} accessibilityLabel="收起购物车" accessibilityRole="button">
            <Ionicons name="chevron-down" size={16 * scale} color={colors.text.primary} />
          </TouchableOpacity>
        </View>
      )}

      {/* ─── 底部输入栏 ─── */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.bottomBar}>
          {/* 语音按钮 (左) */}
          <VoiceButton onResult={handleVoiceResult} available={true} />

          {/* 输入框 (中) */}
          <View style={styles.inputContainer}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="说'可乐多少钱'或搜索商品..."
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
              <TouchableOpacity style={styles.sendBtn} onPress={handleSend} accessibilityLabel="发送" accessibilityRole="button">
                <Ionicons name="arrow-up" size={16 * scale} color={colors.text.inverse} />
              </TouchableOpacity>
            )}
          </View>

          {/* 扫码按钮 (右) */}
          <TouchableOpacity style={styles.cameraBtn} onPress={handleScan} accessibilityLabel="扫码" accessibilityRole="button">
            <Ionicons name="camera-outline" size={22 * scale} color={colors.text.primary} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ─── 结账弹窗（居中卡片） ─── */}
      <Modal visible={showCheckout} transparent animationType="fade">
        <View style={styles.checkoutOverlay}>
          <View style={styles.checkoutCard}>
            <TouchableOpacity style={styles.checkoutCloseBtn} onPress={() => setShowCheckout(false)} accessibilityLabel="关闭" accessibilityRole="button">
              <Ionicons name="close" size={22 * scale} color={colors.text.secondary} />
            </TouchableOpacity>
            <Text style={styles.checkoutCardTitle}>合计清单</Text>

            {cartItems.map((item) => (
              <View key={item.productId} style={styles.checkoutItem}>
                <Text style={styles.checkoutItemName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.checkoutItemQty}>×{item.quantity}</Text>
                <Text style={styles.checkoutItemPrice}>¥{(item.price * item.quantity).toFixed(2)}</Text>
              </View>
            ))}

            <View style={styles.checkoutTotal}>
              <Text style={styles.checkoutTotalLabel}>总额</Text>
              <Text style={styles.checkoutTotalPrice}>¥{cartTotal.toFixed(2)}</Text>
            </View>

            <TouchableOpacity style={styles.checkoutClearBtn} onPress={handleCheckoutClear} accessibilityLabel="关闭并清空购物车" accessibilityRole="button">
              <Text style={styles.checkoutClearBtnText}>关闭并清空</Text>
            </TouchableOpacity>
            <Text style={styles.checkoutClearHint}>清空购物车，不留任何记录</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}