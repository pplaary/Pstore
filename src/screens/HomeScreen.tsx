/**
 * 首页 — AI 对话 + 智能物品管理
 *
 * 双模式架构：
 * - chat 模式：AI 聊天界面，支持语音输入、AR 扫码
 * - search 模式：本地 FTS5 实时搜索，渲染 ProductCard 列表
 *
 * 单手交互要点：
 * - 底部 Tab 栏（抽屉入口在左上角）
 * - 药丸形输入栏在拇指热区
 * - 语音按钮在输入栏左侧
 * - 扫码按钮在输入栏右侧
 * - 购物车浮层从底部弹出
 * - 连击标题 5 次进入管理模式
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
      backgroundColor: colors.brand.tertiary,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    cartBadgeText: {
      fontSize: 10 * scale,
      fontWeight: '700',
      color: colors.text.inverse,
    },

    // 搜索模式头部
    searchHeader: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    searchInput: {
      height: 40 * scale,
      borderRadius: radii.full,
      backgroundColor: colors.input,
      paddingHorizontal: spacing.lg,
      fontSize: 14 * scale,
      color: colors.text.primary,
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

    // 搜索模式结果列表
    searchResultItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      backgroundColor: colors.surface.s1,
      marginHorizontal: spacing.md,
      marginVertical: 3 * scale,
      borderRadius: radii.md,
      borderWidth: 0.5,
      borderColor: colors.border.subtle,
    },
    searchResultInfo: {
      flex: 1,
      marginLeft: spacing.sm,
    },
    searchResultName: {
      fontSize: 15 * scale,
      fontWeight: '600',
      color: colors.text.primary,
    },
    searchResultSpec: {
      fontSize: 12 * scale,
      color: colors.text.secondary,
      marginTop: 2,
    },
    searchResultPrice: {
      fontSize: 15 * scale,
      fontWeight: '700',
      color: colors.brand.danger,
    },
    searchResultStatus: {
      fontSize: 11 * scale,
      fontWeight: '600',
      color: colors.text.tertiary,
      marginLeft: spacing.sm,
    },
    searchEmpty: {
      paddingVertical: spacing.xxxl,
      alignItems: 'center',
    },
    searchEmptyText: {
      fontSize: 14 * scale,
      color: colors.text.tertiary,
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
      minWidth: 48 * scale,
      minHeight: 48 * scale,
      borderRadius: radii.full,
      backgroundColor: colors.brand.primary,
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: spacing.xs,
      marginBottom: 2,
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
    checkoutBtn: {
      backgroundColor: colors.brand.primary,
      borderRadius: radii.md,
      paddingVertical: spacing.md + 2,
      alignItems: 'center',
      marginTop: spacing.md,
    },
    checkoutBtnText: {
      fontSize: 15 * scale,
      fontWeight: '700',
      color: colors.text.inverse,
    },

    // 结账 Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalContainer: {
      backgroundColor: colors.surface.s2,
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.md,
      paddingBottom: Platform.OS === 'ios' ? 32 : spacing.lg,
      maxHeight: '70%',
    },
    modalHandle: {
      width: 36 * scale,
      height: 4 * scale,
      borderRadius: radii.full,
      backgroundColor: colors.border.default,
      alignSelf: 'center',
      marginBottom: spacing.md,
    },
    modalTitle: {
      fontSize: 18 * scale,
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: spacing.md,
    },
    modalTotal: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
      marginTop: spacing.sm,
    },
    modalTotalLabel: {
      fontSize: 16 * scale,
      fontWeight: '600',
      color: colors.text.primary,
    },
    modalTotalPrice: {
      fontSize: 22 * scale,
      fontWeight: '800',
      color: colors.brand.danger,
    },
    modalActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    modalCloseBtn: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      alignItems: 'center',
    },
    modalCloseBtnText: {
      fontSize: 15 * scale,
      fontWeight: '600',
      color: colors.text.primary,
    },
    modalClearBtn: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.brand.danger,
      alignItems: 'center',
    },
    modalClearBtnText: {
      fontSize: 15 * scale,
      fontWeight: '600',
      color: colors.text.inverse,
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

export default function HomeScreen({ navigation }: HomeScreenCompositeProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { colors, scale } = theme;

  const { mode, reachable, isVoiceAvailable } = useAIConfigStore();
  const { items: cartItems, total: cartTotal, clearCart } = useCartStore();
  const { db } = useStore();

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showPinModal, setShowPinModal] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const cartAnim = useRef(new Animated.Value(0)).current;
  const titleTapCount = useRef(0);
  const titleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 搜索模式状态
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isChatMode = mode === 'chat';
  const cartCount = cartItems.reduce((s, i) => s + i.quantity, 0);

  // ─── 连击标题 5 次进管理模式 ───
  const handleTitlePress = useCallback(() => {
    titleTapCount.current += 1;
    if (titleTapTimer.current) clearTimeout(titleTapTimer.current);
    if (titleTapCount.current >= 5) {
      titleTapCount.current = 0;
      setShowPinModal(true);
    } else {
      titleTapTimer.current = setTimeout(() => {
        titleTapCount.current = 0;
      }, 1000);
    }
  }, []);

  // ─── 搜索模式：FTS5 实时搜索 ───
  const handleSearchInput = useCallback(
    (text: string) => {
      setSearchQuery(text);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (!text.trim()) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      searchTimerRef.current = setTimeout(async () => {
        try {
          const results = await searchProducts(db, text.trim(), { limit: 50 });
          setSearchResults(results);
        } catch {
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      }, 300);
    },
    [db],
  );

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

  // ─── 结账：关闭并清空 ───
  const handleCheckoutClear = useCallback(() => {
    clearCart();
    setShowCheckout(false);
    setShowCart(false);
  }, [clearCart]);

  // 发送消息（AI 模式）
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
    (navigation as BottomTabNavigationProp<HomeTabParamList>).navigate({
      name: 'Scan',
      params: {},
    });
  }, [navigation]);

  // 渲染消息
  const renderMessage = useCallback(
    ({ item }: { item: Message }) => (
      <AIChatBubble role={item.role} content={item.content} timestamp={item.timestamp} />
    ),
    [],
  );

  const renderFooter = useCallback(() => {
    if (!isLoading || !isChatMode) return null;
    return <TypingIndicator theme={theme} />;
  }, [isLoading, isChatMode, theme]);

  const renderEmpty = useCallback(() => {
    if (messages.length > 0 || !isChatMode) return null;
    return <EmptyState theme={theme} onQuickAction={handleQuickAction} onScan={handleScan} />;
  }, [messages.length, isChatMode, theme, handleQuickAction, handleScan]);

  // 搜索模式渲染结果
  const renderSearchResult = useCallback(
    ({ item }: { item: Product }) => (
      <TouchableOpacity
        style={styles.searchResultItem}
        onPress={() => navigation.navigate('ProductDetail', { id: item.id })}
        accessibilityLabel={`${item.name}${item.spec ? ` ${item.spec}` : ''}，¥${item.price.toFixed(2)}`}
        accessibilityRole="button"
      >
        <View style={{ width: 40 * scale, height: 40 * scale, borderRadius: 20 * scale, backgroundColor: colors.brand.primaryMuted, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="cube-outline" size={20 * scale} color={colors.brand.primary} />
        </View>
        <View style={styles.searchResultInfo}>
          <Text style={styles.searchResultName} numberOfLines={1}>{item.name}</Text>
          {item.spec && <Text style={styles.searchResultSpec} numberOfLines={1}>{item.spec}</Text>}
        </View>
        <Text style={styles.searchResultPrice}>¥{item.price.toFixed(2)}</Text>
        <Text style={styles.searchResultStatus}>{item.status === 'IN_SHOP' ? '在售' : item.status === 'OUT_OF_STOCK' ? '缺货' : '待采'}</Text>
      </TouchableOpacity>
    ),
    [styles, colors, navigation, scale],
  );

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (titleTapTimer.current) clearTimeout(titleTapTimer.current);
    };
  }, []);

  return (
    <View style={styles.container}>
      {/* Pin Modal */}
      <PinModal
        visible={showPinModal}
        onClose={() => setShowPinModal(false)}
        onSuccess={() => setShowPinModal(false)}
      />

      {/* 自定义 Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <ThemedTouchable
            style={styles.menuButton}
            onPress={() => navigation.openDrawer()}
            accessibilityLabel="打开菜单"
            accessibilityRole="button"
          >
            <Ionicons name="menu" size={22 * scale} color={colors.text.primary} />
          </ThemedTouchable>
          <TouchableOpacity onPress={handleTitlePress} activeOpacity={1} accessibilityLabel="切换搜索模式" accessibilityRole="button">
            <Text style={styles.headerTitle}>PStore</Text>
            <Text style={styles.headerSubtitle}>{isChatMode ? 'AI 在线' : '搜索模式'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.headerRight}>
          <SyncStatusIcon />
          <ThemedTouchable
            style={styles.headerIconBtn}
            onPress={toggleCart}
            disabled={cartCount === 0}
            accessibilityLabel={`购物车，${cartCount}件商品`}
            accessibilityRole="button"
          >
            <Ionicons name="cart-outline" size={22 * scale} color={colors.text.primary} />
            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount > 99 ? '99+' : cartCount}</Text>
              </View>
            )}
          </ThemedTouchable>
        </View>
      </View>

      {/* 搜索模式：搜索输入框 */}
      {!isChatMode && (
        <View style={styles.searchHeader}>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={handleSearchInput}
            placeholder="搜索商品名..."
            placeholderTextColor={colors.text.tertiary}
            autoFocus
            accessibilityLabel="搜索商品"
          />
        </View>
      )}

      {/* 主体内容 */}
      {isChatMode ? (
        /* Chat 模式：消息列表 */
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
      ) : (
        /* 搜索模式：结果列表 */
        <FlatList
          style={styles.messageList}
          data={searchResults}
          renderItem={renderSearchResult}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            searchQuery.trim() && !isSearching ? (
              <View style={styles.searchEmpty}>
                <Text style={styles.searchEmptyText}>未找到匹配的商品</Text>
              </View>
            ) : null
          }
        />
      )}

      {/* 底部输入栏 */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.bottomBar}>
          {/* 语音按钮 (左) */}
          {isChatMode && (
            <VoiceButton onResult={handleVoiceResult} available={isVoiceAvailable} />
          )}

          {/* 输入框容器 (中) */}
          <View style={styles.inputContainer}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={isChatMode ? inputText : searchQuery}
              onChangeText={isChatMode ? setInputText : handleSearchInput}
              placeholder={isChatMode ? '说"可乐多少钱"' : '搜索商品名…'}
              placeholderTextColor={colors.text.tertiary}
              multiline={isChatMode}
              maxLength={500}
              editable={!isLoading}
              accessibilityLabel={isChatMode ? '输入消息' : '搜索商品'}
              returnKeyType={isChatMode ? 'send' : 'search'}
              onSubmitEditing={isChatMode ? handleSend : undefined}
              blurOnSubmit={false}
            />
            {isChatMode && inputText.trim().length > 0 && (
              <TouchableOpacity
                style={styles.sendButton}
                onPress={handleSend}
                accessibilityLabel="发送"
                accessibilityRole="button"
              >
                <Ionicons name="arrow-up" size={18 * scale} color={colors.text.inverse} />
              </TouchableOpacity>
            )}
          </View>

          {/* 扫码按钮 (右) */}
          <TouchableOpacity
            style={styles.scanButton}
            onPress={handleScan}
            accessibilityLabel="扫码"
            accessibilityRole="button"
          >
            <Ionicons name="scan" size={22 * scale} color={colors.text.primary} />
          </TouchableOpacity>
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
            <TouchableOpacity onPress={clearCart} accessibilityLabel="清空购物车" accessibilityRole="button">
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
          {cartItems.length === 0 && (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <Text style={{ fontSize: 14 * scale, color: colors.text.tertiary }}>购物车为空</Text>
            </View>
          )}
          <View style={styles.cartSheetTotal}>
            <Text style={styles.cartSheetTotalLabel}>合计</Text>
            <Text style={styles.cartSheetTotalPrice}>¥{cartTotal.toFixed(2)}</Text>
          </View>
          {cartItems.length > 0 && (
            <TouchableOpacity
              style={styles.checkoutBtn}
              onPress={() => setShowCheckout(true)}
              accessibilityLabel="结账"
              accessibilityRole="button"
            >
              <Text style={styles.checkoutBtnText}>结账 ({cartItems.length} 件)</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      )}

      {/* 结账弹窗 Modal */}
      <Modal visible={showCheckout} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>结账清单</Text>
            {cartItems.map((item) => (
              <View key={item.productId} style={styles.cartItem}>
                <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.cartItemQty}>x{item.quantity}</Text>
                <Text style={styles.cartItemPrice}>¥{(item.price * item.quantity).toFixed(2)}</Text>
              </View>
            ))}
            <View style={styles.modalTotal}>
              <Text style={styles.modalTotalLabel}>总计</Text>
              <Text style={styles.modalTotalPrice}>¥{cartTotal.toFixed(2)}</Text>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowCheckout(false)}
                accessibilityLabel="关闭"
                accessibilityRole="button"
              >
                <Text style={styles.modalCloseBtnText}>关闭</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalClearBtn}
                onPress={handleCheckoutClear}
                accessibilityLabel="关闭并清空购物车"
                accessibilityRole="button"
              >
                <Text style={styles.modalClearBtnText}>关闭并清空</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}