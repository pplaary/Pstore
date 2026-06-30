import React, { useState, useCallback, useLayoutEffect, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { useStore } from '../context/store';
import { useCartStore } from '../store/cart';
import { useModeStore } from '../store/mode';
import { useAIConfigStore } from '../store/aiConfig';
import { searchProducts } from '../db/search';
import { getAllLabels } from '../db/looseGoods';
import { updateProduct, softDeleteProduct } from '../db/product';
import { useTheme } from '../theme/ThemeContext';
import { PinModal } from '../components/PinModal';
import { SyncStatusIcon } from '../components/SyncStatusIcon';
import { AIChatBubble } from '../components/AIChatBubble';
import { ProductConfirmCard } from '../components/ProductConfirmCard';
import { VoiceButton } from '../components/VoiceButton';
import {
  interceptChineseNumerals,
  buildSystemPrompt,
  callAI,
  parseAIResponse,
} from '../services/ai';
import { buildRAGContext } from '../services/ai/rag';
import { aiQuery } from '../services/n1';
import type { AiQueryResult } from '../services/n1';
import { showToast } from '../utils/toast';
import { ChatManager } from '../services/ai/chat';
import { AIResponseCache } from '../services/ai/cache';
import type { AIResponse } from '../services/ai';
import type { Product, ProductStatus } from '../db/types';
import type { HomeScreenCompositeProps } from '../navigation/types';
import { useSyncConfigStore } from '../store/syncConfig';

// ==================== 常量 ====================

/** 聊天输入栏高度 */
const CHAT_INPUT_HEIGHT = 52;
/** 购物车栏折叠态高度 */
const CART_BAR_HEIGHT = 52;

// ==================== 组件 ====================

export function HomeScreen({ navigation }: HomeScreenCompositeProps) {
  // ========== 全局 Store ==========
  const { db, refreshProducts, products } = useStore();
  const { theme } = useTheme();
  const { colors, scale } = theme;
  const styles = useMemo(() => createStyles(colors, scale), [colors, scale]);

  const { items, total, addToCart, removeFromCart, removeItem, clearCart } = useCartStore();
  const { isManagement, exitManagement } = useModeStore();
  const aiMode = useAIConfigStore((s) => s.mode);
  const isChatMode = aiMode === 'chat';
  const syncConfigServerUrl = useSyncConfigStore((s) => s.serverUrl);
  const isNLSearchAvailable = !!syncConfigServerUrl;

  // ========== 散装标签状态 ==========
  const [looseGoodsLabels, setLooseGoodsLabels] = useState<Array<{ id: string; label: string }>>([]);

  // ========== 搜索模式状态 ==========
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);

  // ========== NL 搜索模式状态 ==========
  const [isNLSearch, setIsNLSearch] = useState(false);
  const [isNLLoading, setIsNLLoading] = useState(false);
  const [nlResult, setNlResult] = useState<AiQueryResult | null>(null);

  // ========== 聊天模式状态 ==========
  const [chatMessages, setChatMessages] = useState<
    Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>
  >([]);
  const [draftCard, setDraftCard] = useState<{
    product: Product;
    quantity: number;
    confidence: number;
    expired: boolean;
  } | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [aiFallbackResults, setAiFallbackResults] = useState<Product[] | null>(null);

  // ========== 共享状态 ==========
  const [cartExpanded, setCartExpanded] = useState(false);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [pinVisible, setPinVisible] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusMenuId, setStatusMenuId] = useState<string | null>(null);

  // ========== 语音输入状态 ==========
  const isVoiceAvailable = useAIConfigStore((s) => s.isVoiceAvailable);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);

  // ========== 模型切换状态 ==========
  const [modelSelectorVisible, setModelSelectorVisible] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const aiConfig = useAIConfigStore((s) => s.aiConfig);

  const availableModels = useMemo(() => {
    if (!aiConfig) return [];
    return [
      { id: aiConfig.textModel, label: aiConfig.textModel },
      { id: aiConfig.visionModel, label: `${aiConfig.visionModel} (视觉)` },
    ];
  }, [aiConfig]);

  const handleModelSelect = useCallback((modelId: string) => {
    setSelectedModel(modelId);
    setModelSelectorVisible(false);
  }, []);

  // ========== Refs ==========
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatManagerRef = useRef<ChatManager | null>(null);
  const aiCacheRef = useRef<AIResponseCache | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedOnce = useRef(false);

  // ========== 骨架屏状态 ==========
  const [isSkeletonVisible, setIsSkeletonVisible] = useState(true);
  const skeletonOpacity = useRef(new Animated.Value(0.4)).current;

  // ========== 初始化 AI 引擎实例 ==========
  useEffect(() => {
    chatManagerRef.current = new ChatManager(buildSystemPrompt);
    aiCacheRef.current = new AIResponseCache();

    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, []);

  // ========== 骨架屏脉冲动画 ==========
  useEffect(() => {
    if (!isSkeletonVisible) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonOpacity, { toValue: 0.8, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(skeletonOpacity, { toValue: 0.4, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [isSkeletonVisible, skeletonOpacity]);

  // ========== 数据加载完成时隐藏骨架屏 ==========
  useEffect(() => {
    if (products.length > 0 || hasLoadedOnce.current) {
      setIsSkeletonVisible(false);
    }
    hasLoadedOnce.current = true;
  }, [products]);

  // ========== 搜索（搜索模式） ==========
  const doSearch = useCallback(async () => {
    try {
      const result = await searchProducts(db, query.trim(), {
        category: selectedCategory ?? undefined,
        sortBy: 'relevance',
      });
      setFilteredProducts(result);
    } catch (e) {
      console.error('HomeScreen: 搜索失败', e);
      setFilteredProducts([]);
    }
  }, [db, query, selectedCategory]);

  // ========== NL 搜索 ==========
  const doNLSearch = useCallback(async (question: string) => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || !syncConfigServerUrl) {
      return;
    }

    setIsNLLoading(true);
    try {
      const res = await aiQuery(syncConfigServerUrl, trimmedQuestion);
      if (res.error) {
        setNlResult(null);
        setFilteredProducts([]);
        showToast('AI 搜索失败，请稍后重试');
        return;
      }
      setNlResult(res.data || null);
      if (res.data?.items?.length) {
        const names = res.data.items.map((i) => i.name);
        const localResults = (await Promise.all(
          names.map((name) => searchProducts(db, name, { sortBy: 'relevance' })),
        )).flat();
        setFilteredProducts(localResults);
      } else {
        setFilteredProducts([]);
      }
    } catch (e) {
      console.error('HomeScreen: NL 搜索失败', e);
      setFilteredProducts([]);
      setNlResult(null);
      showToast('AI 搜索失败，请稍后重试');
    } finally {
      setIsNLLoading(false);
    }
  }, [db, syncConfigServerUrl]);

  // ========== 散装标签 ==========
  const loadLooseGoodsLabels = useCallback(async () => {
    try {
      const labels = await getAllLabels(db);
      setLooseGoodsLabels(labels.map((l) => ({ id: l.id, label: l.label })));
    } catch {
      // 静默失败
    }
  }, [db]);

  React.useEffect(() => {
    if (!isChatMode) {
      if (isNLSearch) {
        doNLSearch(query);
      } else {
        doSearch();
      }
    }
  }, [doSearch, doNLSearch, isChatMode, isNLSearch]);

  useFocusEffect(
    useCallback(() => {
      refreshProducts();
      loadLooseGoodsLabels();
    }, [refreshProducts, loadLooseGoodsLabels]),
  );

  // ========== 连击标题进入/退出管理模式 ==========
  const handleTitlePress = useCallback(() => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 5000);

    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      if (isManagement) {
        exitManagement();
      } else {
        setPinVisible(true);
      }
    }
  }, [isManagement, exitManagement]);

  // ========== 顶部栏 ==========
  useLayoutEffect(() => {
    navigation.setOptions({
      headerStyle: {
        backgroundColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0.5 },
        shadowOpacity: 0.06,
        shadowRadius: 1,
        elevation: 1,
      },
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => navigation.openDrawer()}
          style={styles.headerIconContainer}
          accessibilityLabel="打开菜单"
          accessibilityRole="button"
        >
          <Text style={styles.headerIconText}>{"☰"}</Text>
        </TouchableOpacity>
      ),
      headerTitle: () => (
        <TouchableOpacity
          onPress={handleTitlePress}
          activeOpacity={0.6}
          accessibilityLabel={isManagement ? '连击5次退出管理模式' : '连击5次进入管理模式'}
          accessibilityRole="button"
        >
          <Text style={styles.headerTitle}>
            {isManagement ? 'PStore [管理]' : 'PStore'}
          </Text>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity
          style={styles.headerIconContainer}
          onPress={() => navigation.navigate('Config')}
          accessibilityLabel="配置"
          accessibilityRole="button"
        >
          <Ionicons name="cloud-outline" size={18} color={colors.text.primary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, isManagement, handleTitlePress]);

  // ========== 通用操作 ==========
  const handleAddToCart = useCallback((product: Product) => {
    addToCart(product.id, product.name, product.price);
    showToast(`已加入购物车：${product.name} ¥${product.price.toFixed(2)}`);
  }, [addToCart]);

  /** 点击散装标签：搜索同名商品 → 自动加入购物车（首个结果） */
  const handleLooseGoodsTagPress = useCallback(
    async (labelText: string) => {
      try {
        const results = await searchProducts(db, labelText, { limit: 1 });
        if (results.length > 0) {
          handleAddToCart(results[0]);
        } else {
          showToast(`未找到「${labelText}」，请先添加到商品库`);
        }
      } catch {
        showToast(`搜索「${labelText}」失败`);
      }
    },
    [db, handleAddToCart],
  );

  // ========== AI 辅助函数 ==========

  /** 从 SecureStore 读取 AI 配置 */
  const getStoredAIConfig = useCallback(async (): Promise<
    { apiUrl: string; apiKey: string; textModel: string } | null
  > => {
    try {
      const raw = await SecureStore.getItemAsync('pstore_ai_config');
      if (!raw) return null;
      const config = JSON.parse(raw);
      if (config.apiUrl && config.apiKey && config.textModel) {
        return config;
      }
    } catch {
      // ignore
    }
    return null;
  }, []);

  /** 构建购物车快照（注入 System Prompt） */
  const buildCartSnapshot = useCallback((): string => {
    const cartItems = useCartStore.getState().items;
    if (cartItems.length === 0) return '购物车为空';
    return cartItems.map((i) => `${i.name} ×${i.quantity}`).join('、');
  }, []);

  /**
   * 渲染 AI 回复：添加消息气泡 + 可选草稿卡。
   */
  const renderAiResponse = useCallback(
    async (response: AIResponse, userInput: string) => {
      // AI 消息气泡
      const aiTimestamp = new Date().toISOString();
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: response.message, timestamp: aiTimestamp },
      ]);

      // 加入对话上下文
      chatManagerRef.current?.addRound(userInput, response);

      // addToCart action → 显示商品确认卡片
      if (response.action === 'addToCart' && response.productId) {
        try {
          const product = await db.getFirstAsync<Product>(
            'SELECT * FROM product WHERE id = ? AND isDeleted = 0',
            response.productId,
          );
          if (product) {
            setDraftCard({
              product,
              quantity: response.quantity,
              confidence: response.confidence,
              expired: false,
            });
            // 60 秒后过期变灰（视觉提示，不阻断交互）
            if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
            draftTimerRef.current = setTimeout(() => {
              setDraftCard((prev) => (prev ? { ...prev, expired: true } : null));
            }, 60_000);
          }
        } catch {
          // 商品查询失败，忽略草稿卡
        }
      }
    },
    [db],
  );

  /**
   * 发送聊天消息（内部核心函数，接受显式文本）。
   *
   * 流程：中文预拦截 → 缓存检查 → RAG → buildMessages → callAI → parseAIResponse
   * 失败降级：FTS5 搜索，用户无感知
   */
  const handleAiSendWithText = useCallback(async (inputText: string) => {
    if (!inputText || isAiLoading) return;

    // 中文数字预拦截
    const { text: processedText, replaced } = interceptChineseNumerals(inputText);

    // 用户消息气泡（显示预拦截后的文本）
    const userTimestamp = new Date().toISOString();
    setChatMessages((prev) => [
      ...prev,
      { role: 'user', content: processedText, timestamp: userTimestamp },
    ]);
    setChatInput('');
    setIsAiLoading(true);
    setDraftCard(null);
    setAiFallbackResults(null);

    // 清除旧计时器
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }

    try {
      // 1. 缓存检查（key 与 RAG 输入统一为 processedText）
      const cached = aiCacheRef.current?.get(processedText);
      if (cached) {
        await renderAiResponse(cached, processedText);
        return;
      }

      // 2. RAG 上下文
      const rag = await buildRAGContext(db, processedText);

      // 3. 构建 messages
      const cartSnapshot = buildCartSnapshot();
      const mode = isManagement ? 'ADMIN' : 'NORMAL';
      const messages = chatManagerRef.current!.buildMessages(
        processedText,
        cartSnapshot,
        mode,
        rag,
      );

      // 4. 调用 AI
      const aiConfig = await getStoredAIConfig();
      if (!aiConfig) {
        throw new Error('AI 未配置');
      }

      const startTime = Date.now();
      const raw = await callAI(aiConfig, messages);

      // 更新延迟色标
      if (raw) {
        const latencyMs = Date.now() - startTime;
        useAIConfigStore.getState().updateLatency(latencyMs);
      }

      if (!raw) {
        throw new Error('AI 返回空');
      }

      // 5. 解析 AI 回复
      const response = await parseAIResponse(db, raw);
      if (!response) {
        throw new Error('AI 回复解析失败');
      }

      // 6. 存入缓存
      aiCacheRef.current?.set(processedText, response);

      // 7. 渲染回复
      await renderAiResponse(response, processedText);
    } catch {
      // AI 失败 → 降级为 FTS5 搜索
      const fallbackTimestamp = new Date().toISOString();
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'AI 暂不可用，已切换为本地搜索',
          timestamp: fallbackTimestamp,
        },
      ]);

      try {
        const results = await searchProducts(db, processedText, { sortBy: 'relevance' });
        setAiFallbackResults(results);
      } catch {
        // 搜索也失败，静默
      }
    } finally {
      setIsAiLoading(false);
    }
  }, [isAiLoading, db, isManagement, renderAiResponse, getStoredAIConfig, buildCartSnapshot]);

  /**
   * 文字输入路径：读取 chatInput 并发送。
   */
  const handleAiSend = useCallback(async () => {
    const rawInput = chatInput.trim();
    if (!rawInput) return;
    await handleAiSendWithText(rawInput);
  }, [chatInput, handleAiSendWithText]);

  // ========== 语音识别结果处理 ==========
  const handleVoiceResult = useCallback((text: string) => {
    // 中文数字预拦截（与文字输入走同一管道）
    const { text: processed, replaced } = interceptChineseNumerals(text.trim());
    if (!processed) {
      showToast('未识别到有效内容');
      return;
    }
    // 设置为聊天输入并自动发送
    setChatInput(processed);
    // 通过 setTimeout 确保 setChatInput 的 state 更新后再发送
    setTimeout(() => {
      handleAiSendWithText(processed);
    }, 0);
  }, [handleAiSendWithText]);

  // ========== 草稿卡操作 ==========
  const handleDraftAddToCart = useCallback(
    (product: Product, quantity: number) => {
      for (let i = 0; i < quantity; i++) {
        addToCart(product.id, product.name, product.price);
      }
      showToast(`已加入购物车：${product.name} ×${quantity}`);
      setDraftCard(null);
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
    },
    [addToCart],
  );

  const handleDraftIgnore = useCallback(() => {
    setDraftCard(null);
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
  }, []);

  // ========== 搜索模式：商品操作 ==========
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredProducts.map((p) => p.id)));
  }, [filteredProducts]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      '确认删除',
      `确定删除选中的 ${selectedIds.size} 个商品？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            for (const id of selectedIds) {
              await softDeleteProduct(db, id);
            }
            setSelectedIds(new Set());
            setBatchMode(false);
            doSearch();
          },
        },
      ],
    );
  }, [selectedIds, db, doSearch]);

  const handleBatchStatus = useCallback(async (status: ProductStatus) => {
    if (selectedIds.size === 0) return;
    for (const id of selectedIds) {
      await updateProduct(db, id, { status });
    }
    setSelectedIds(new Set());
    setBatchMode(false);
    doSearch();
  }, [selectedIds, db, doSearch]);

  const handleItemLongPress = useCallback((item: Product) => {
    if (!isManagement || batchMode) return;
    Alert.alert(
      item.name,
      '选择操作',
      [
        { text: '编辑', onPress: () => navigation.navigate('ProductEdit', { id: item.id }) },
        {
          text: '改状态',
          onPress: () => {
            Alert.alert('改状态', '选择新状态', [
              { text: '在售', onPress: () => updateProduct(db, item.id, { status: 'IN_SHOP' }).then(doSearch) },
              { text: '缺货', onPress: () => updateProduct(db, item.id, { status: 'OUT_OF_STOCK' }).then(doSearch) },
              { text: '待采', onPress: () => updateProduct(db, item.id, { status: 'TO_BE_PURCHASED' }).then(doSearch) },
              { text: '取消', style: 'cancel' },
            ]);
          },
        },
        {
          text: '软删除',
          style: 'destructive',
          onPress: async () => {
            Alert.alert(
              '确认删除',
              `确定删除「${item.name}」？`,
              [
                { text: '取消', style: 'cancel' },
                {
                  text: '删除',
                  style: 'destructive',
                  onPress: async () => {
                    await softDeleteProduct(db, item.id);
                    doSearch();
                  },
                },
              ],
            );
          },
        },
        { text: '取消', style: 'cancel' },
      ],
    );
  }, [isManagement, batchMode, db, navigation, doSearch]);

  // ========== 渲染：搜索模式商品项 ==========
  const renderItem = ({ item }: { item: Product }) => {
    const isSelected = selectedIds.has(item.id);
    return (
      <TouchableOpacity
        style={[styles.productItem, batchMode && isSelected && styles.productItemSelected]}
        onPress={() => {
          if (batchMode) {
            toggleSelect(item.id);
          } else {
            navigation.navigate('ProductDetail', { id: item.id });
          }
        }}
        onLongPress={() => {
          if (isManagement && !batchMode) {
            setStatusMenuId(item.id);
          }
        }}
        accessibilityLabel={`${item.name}，价格${item.price.toFixed(2)}元，${item.spec ? `规格${item.spec}，` : ''}状态${item.status === 'IN_SHOP' ? '在售' : item.status === 'OUT_OF_STOCK' ? '缺货' : '待采'}${batchMode ? '，批量选择' : ''}`}
        accessibilityRole="button"
      >
        {batchMode && (
          <View style={[styles.checkbox, isSelected && styles.checkboxChecked]} accessible accessibilityLabel={`复选框${isSelected ? '已选中' : '未选中'}`}>
            {isSelected && <Text style={styles.checkboxMark}>✓</Text>}
          </View>
        )}
        <View style={styles.productLeft}>
          <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
          {item.spec && <Text style={styles.productSpec} numberOfLines={1}>{item.spec}</Text>}
        </View>
        <View style={styles.productRight}>
          <Text style={styles.productPrice}>¥{item.price.toFixed(2)}</Text>
          {!batchMode && (
            <TouchableOpacity
              style={styles.addCartBtn}
              onPress={() => handleAddToCart(item)}
              accessibilityLabel={`加入购物车：${item.name}`}
              accessibilityRole="button"
            >
              <Text style={styles.addCartBtnText}>+</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // ========== 渲染：降级搜索结果项 ==========
  const renderFallbackItem = (item: Product) => (
    <TouchableOpacity
      key={item.id}
      style={styles.fallbackItem}
      onPress={() => navigation.navigate('ProductDetail', { id: item.id })}
      accessibilityLabel={`${item.name}${item.spec ? ` ${item.spec}` : ''}，${item.price.toFixed(2)}元，${item.status === 'IN_SHOP' ? '在售' : item.status === 'OUT_OF_STOCK' ? '缺货' : '待采'}`}
      accessibilityRole="button"
    >
      <View style={styles.fallbackLeft}>
        <Text style={styles.fallbackName} numberOfLines={1}>{item.name}</Text>
        {item.spec && <Text style={styles.fallbackSpec} numberOfLines={1}>{item.spec}</Text>}
      </View>
      <Text style={styles.fallbackPrice}>¥{item.price.toFixed(2)}</Text>
    </TouchableOpacity>
  );

  // ========== 计算属性 ==========
  const isEmpty = !query.trim() && !selectedCategory
    ? filteredProducts.length === 0
    : filteredProducts.length === 0;
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  // ========== JSX ==========
  return (
    <View style={styles.container}>
      {/* ===== 搜索栏（仅搜索模式） ===== */}
      {!isChatMode && (
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder={isNLSearch ? '用自然语言描述你需要的商品...' : '搜索商品名称、拼音或条码'}
            placeholderTextColor={colors.text.hint}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel={isNLSearch ? 'AI 自然语言搜索' : '搜索商品'}
          />
          {isNLSearchAvailable && (
            <TouchableOpacity
              style={styles.nlToggleBtn}
              onPress={() => { setIsNLSearch(!isNLSearch); setQuery(''); setFilteredProducts([]); setNlResult(null); }}
              accessibilityLabel={isNLSearch ? '切换到关键词搜索' : '切换到 AI 搜索'}
              accessibilityRole="button"
            >
              <Text style={[styles.nlToggleText, isNLSearch && styles.nlToggleTextActive]}>
                {isNLSearch ? 'KW' : 'NL'}
              </Text>
            </TouchableOpacity>
          )}
          {query.length > 0 && (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => setQuery('')}
              accessibilityLabel="清除搜索"
              accessibilityRole="button"
            >
              <Text style={styles.clearBtnText}>✕</Text>
            </TouchableOpacity>
          )}
          {isNLLoading && (
            <Text style={styles.nlLoadingText}>AI...</Text>
          )}
        </View>
      )}

      {/* ===== 主内容区 ===== */}
      {isChatMode ? (
        /* ---------- 聊天模式 ---------- */
        <View style={styles.chatArea}>
          {chatMessages.length === 0 && !isAiLoading && !aiFallbackResults ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>输入商品名称开始查价</Text>
              <Text style={styles.emptyHint}>例如：「可乐多少钱」「两瓶矿泉水」</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.chatScroll}
              contentContainerStyle={[
                styles.chatContent,
                {
                  paddingBottom: items.length > 0
                    ? CART_BAR_HEIGHT + CHAT_INPUT_HEIGHT + 20
                    : CHAT_INPUT_HEIGHT + 20,
                },
              ]}
              keyboardShouldPersistTaps="handled"
            >
              {chatMessages.map((msg, idx) => (
                <AIChatBubble
                  key={idx}
                  role={msg.role}
                  content={msg.content}
                  timestamp={msg.timestamp}
                />
              ))}
              {isAiLoading && (
                <View style={styles.loadingBubble}>
                  <Text style={styles.loadingText}>思考中...</Text>
                </View>
              )}
              {draftCard && (
                <ProductConfirmCard
                  product={draftCard.product}
                  quantity={draftCard.quantity}
                  confidence={draftCard.confidence}
                  expired={draftCard.expired}
                  onAddToCart={handleDraftAddToCart}
                  onIgnore={handleDraftIgnore}
                />
              )}
              {aiFallbackResults && aiFallbackResults.length > 0 && (
                <View style={styles.fallbackSection}>
                  <Text style={styles.fallbackTitle}>搜索结果</Text>
                  {aiFallbackResults.map(renderFallbackItem)}
                </View>
              )}
              {aiFallbackResults && aiFallbackResults.length === 0 && (
                <View style={styles.fallbackEmpty}>
                  <Text style={styles.fallbackEmptyText}>未找到匹配商品</Text>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      ) : (
        /* ---------- 搜索模式（原有逻辑） ---------- */
        <View style={styles.searchArea}>
          {/* 散装快捷标签行 */}
          {looseGoodsLabels.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.looseGoodsRow}
              keyboardShouldPersistTaps="handled"
            >
              {looseGoodsLabels.map((tag) => (
                <TouchableOpacity
                  key={tag.id}
                  style={styles.looseGoodsTag}
                  onPress={() => handleLooseGoodsTagPress(tag.label)}
                  accessibilityLabel={`散装标签：${tag.label}`}
                  accessibilityRole="button"
                >
                  <Text style={styles.looseGoodsTagText}>{tag.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          {/* 骨架屏 / 空状态 / 商品列表 */}
          {isSkeletonVisible ? (
            <View style={styles.skeletonContainer}>
              <Animated.View style={[styles.skeletonCard, { opacity: skeletonOpacity }]} />
              <Animated.View style={[styles.skeletonCard, { opacity: skeletonOpacity }]} />
            </View>
          ) : isEmpty ? (
            <View style={styles.emptyContainer}>
              {isNLSearch ? (
                <>
                  <Text style={styles.emptyText}>AI 搜索未找到匹配商品</Text>
                  {nlResult?.answer && (
                    <Text style={styles.emptyHint}>{nlResult.answer}</Text>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.emptyText}>未找到商品</Text>
                  {isNLSearchAvailable && (
                    <TouchableOpacity
                      style={styles.emptyAiBtn}
                      onPress={() => setIsNLSearch(true)}
                      accessibilityLabel="用 AI 搜索"
                      accessibilityRole="button"
                    >
                      <Text style={styles.emptyAiBtnText}>AI 智能搜索</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          ) : (
            <FlatList
              data={filteredProducts}
              keyExtractor={(i) => i.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </View>
      )}

      {/* ===== 聊天输入栏（仅聊天模式） ===== */}
      {isChatMode && (
        <View style={styles.chatInputBar}>
          <VoiceButton
            available={isVoiceAvailable}
            onResult={handleVoiceResult}
            onStatusChange={(status) => setIsVoiceRecording(status === 'recording')}
          />
          <TextInput
            style={styles.chatInput}
            placeholder={isVoiceRecording ? '正在聆听...' : '说"可乐多少钱"或搜索商品...'}
            placeholderTextColor={colors.text.hint}
            value={chatInput}
            onChangeText={setChatInput}
            onSubmitEditing={handleAiSend}
            returnKeyType="send"
            autoCorrect={false}
            editable={!isVoiceRecording}
            accessibilityLabel="聊天输入"
          />
          <TouchableOpacity
            style={styles.cameraBtn}
            onPress={() => navigation.navigate('ScanBarcode', { mode: 'scan' })}
            activeOpacity={0.7}
            accessibilityLabel="扫码"
            accessibilityRole="button"
          >
            <Ionicons name="camera" size={20} color={colors.text.secondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.modelBtn}
            onPress={() => setModelSelectorVisible(true)}
            accessibilityLabel="切换AI模型"
            accessibilityRole="button"
          >
            <Ionicons name="sparkles" size={16} color={colors.text.secondary} />
            <Text style={styles.modelBtnText} numberOfLines={1}>{selectedModel || 'AI'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ===== 购物车折叠栏 ===== */}
      {items.length > 0 && (
        <View style={[styles.cartBar, isChatMode && styles.cartBarInChat]}>
          <TouchableOpacity
            style={styles.cartCollapsed}
            onPress={() => setCartExpanded(!cartExpanded)}
            accessibilityLabel="购物车，展开查看"
            accessibilityRole="button"
          >
            <Text style={styles.cartIcon}>🛒</Text>
            <Text style={styles.cartCount}>×{totalQty}</Text>
            <Text style={styles.cartTotal}>¥{total.toFixed(2)}</Text>
            <TouchableOpacity
              style={styles.checkoutBtn}
              onPress={() => setCheckoutVisible(true)}
              accessibilityLabel="结账"
              accessibilityRole="button"
            >
              <Text style={styles.checkoutBtnText}>结账</Text>
            </TouchableOpacity>
          </TouchableOpacity>

          {cartExpanded && (
            <View style={styles.cartExpanded}>
              <ScrollView style={styles.cartList}>
                {items.map((item) => (
                  <View key={item.productId} style={styles.cartItem}>
                    <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.cartItemPrice}>¥{item.price.toFixed(2)}</Text>
                    <TouchableOpacity onPress={() => removeFromCart(item.productId)} accessibilityLabel={`减少${item.name}数量`}>
                      <Text style={styles.cartQtyBtn}>⊖</Text>
                    </TouchableOpacity>
                    <Text style={styles.cartQty}>{item.quantity}</Text>
                    <TouchableOpacity onPress={() => addToCart(item.productId, item.name, item.price)} accessibilityLabel={`增加${item.name}数量`}>
                      <Text style={styles.cartQtyBtn}>⊕</Text>
                    </TouchableOpacity>
                    <Text style={styles.cartSubtotal}>¥{(item.price * item.quantity).toFixed(2)}</Text>
                    <TouchableOpacity onPress={() => removeItem(item.productId)} accessibilityLabel={`移除${item.name}`}>
                      <Text style={styles.cartRemove}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
              <View style={styles.cartActions}>
                <TouchableOpacity style={styles.clearBtnLarge} onPress={clearCart} accessibilityLabel="清空购物车">
                  <Text style={styles.clearBtnLargeText}>清空</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.checkoutBtnLarge} onPress={() => { setCheckoutVisible(true); setCartExpanded(false); }} accessibilityLabel="结账">
                  <Text style={styles.checkoutBtnLargeText}>结账</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      {/* ===== 结账弹窗 ===== */}
      <Modal visible={checkoutVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>结账清单</Text>
            <ScrollView>
              {items.map((item) => (
                <View key={item.productId} style={styles.modalItem}>
                  <Text style={styles.modalItemName}>{item.name}</Text>
                  <Text style={styles.modalItemQty}>×{item.quantity}</Text>
                  <Text style={styles.modalItemTotal}>¥{(item.price * item.quantity).toFixed(2)}</Text>
                </View>
              ))}
            </ScrollView>
            <Text style={styles.modalGrandTotal}>合计：¥{total.toFixed(2)}</Text>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => { clearCart(); setCheckoutVisible(false); }}
              accessibilityLabel="关闭结账弹窗并清空购物车"
              accessibilityRole="button"
            >
              <Text style={styles.modalCloseBtnText}>关闭并清空</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ===== PIN 弹窗 ===== */}
      <PinModal
        visible={pinVisible}
        onClose={() => setPinVisible(false)}
        onSuccess={() => setPinVisible(false)}
      />

      {/* ===== 管理模式 FAB（搜索模式） ===== */}
      {isManagement && !batchMode && !isChatMode && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('ProductEdit', {})}
          accessibilityLabel="添加新商品"
          accessibilityRole="button"
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      {/* ===== 扫码按钮（搜索模式） ===== */}
      {!batchMode && !isChatMode && (
        <TouchableOpacity
          style={[styles.fab, styles.fabScan, isManagement && styles.fabScanWithMgmt]}
          onPress={() => navigation.navigate('ScanBarcode', { mode: 'scan' })}
          accessibilityLabel="扫码"
          accessibilityRole="button"
        >
          <Text style={styles.fabScanText}>📷</Text>
        </TouchableOpacity>
      )}

      {/* ===== 批量管理工具栏 ===== */}
      {batchMode && (
        <View style={styles.batchToolbar}>
          <Text style={styles.batchToolbarText}>已选 {selectedIds.size} 项</Text>
          <View style={styles.batchToolbarRow}>
            <TouchableOpacity style={styles.batchBtn} onPress={selectAll} accessibilityLabel="全选">
              <Text style={styles.batchBtnText}>全选</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.batchBtn} onPress={deselectAll} accessibilityLabel="取消全选">
              <Text style={styles.batchBtnText}>反选</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.batchBtn}
              onPress={() => {
                Alert.alert('批量改状态', '选择目标状态', [
                  { text: '在售', onPress: () => handleBatchStatus('IN_SHOP') },
                  { text: '缺货', onPress: () => handleBatchStatus('OUT_OF_STOCK') },
                  { text: '待采', onPress: () => handleBatchStatus('TO_BE_PURCHASED') },
                  { text: '取消', style: 'cancel' },
                ]);
              }}
              accessibilityLabel="批量改状态"
            >
              <Text style={styles.batchBtnText}>改状态</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.batchBtn, styles.batchBtnDanger]} onPress={handleBatchDelete} accessibilityLabel="批量删除">
              <Text style={[styles.batchBtnText, styles.batchBtnDangerText]}>删除</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.batchBtn, styles.batchBtnExit]} onPress={() => { setBatchMode(false); setSelectedIds(new Set()); }} accessibilityLabel="退出并清空筛选">
              <Text style={styles.batchBtnExitText}>退出</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {/* ===== 模型切换弹窗 ===== */}
      <Modal
        visible={modelSelectorVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setModelSelectorVisible(false)}
      >
        <View style={styles.modelModalOverlay}>
          <View style={styles.modelModalContent}>
            <Text style={styles.modelModalTitle}>切换 AI 模型</Text>
            {availableModels.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[styles.modelOption, selectedModel === m.id && styles.modelOptionActive]}
                onPress={() => handleModelSelect(m.id)}
                accessibilityLabel={`选择模型：${m.label}`}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedModel === m.id }}
              >
                <Ionicons
                  name={selectedModel === m.id ? 'checkmark-circle' : 'ellipse-outline'}
                  size={18}
                  color={selectedModel === m.id ? colors.brand.primary : colors.text.hint}
                />
                <Text style={[styles.modelOptionText, selectedModel === m.id && styles.modelOptionTextActive]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.modelModalClose}
              onPress={() => setModelSelectorVisible(false)}
              accessibilityLabel="关闭模型选择"
              accessibilityRole="button"
            >
              <Text style={styles.modelModalCloseText}>关闭</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ==================== 样式 ====================

function createStyles(colors: ReturnType<typeof useTheme>['theme']['colors'], scale: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg.primary },

    // -- 顶部栏 --
    headerIconContainer: {
      backgroundColor: '#F1F5F9',
      borderRadius: 8,
      padding: 6,
      marginLeft: 8,
    },
    headerIconText: { fontSize: 18 * scale, color: colors.text.primary },
    headerTitle: { fontSize: 17 * scale, fontWeight: '700', color: colors.text.primary },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: 8,
    },

    // -- 搜索栏 --
    searchBar: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.bg.card, marginHorizontal: 12, marginTop: 8, marginBottom: 8,
      borderRadius: 10, paddingHorizontal: 12, height: 44,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
    },
    searchIcon: { fontSize: 16 * scale, marginRight: 8 },
    searchInput: { flex: 1, fontSize: 15 * scale, color: colors.text.primary, padding: 0 },
    clearBtn: { padding: 4, marginLeft: 4 },
    clearBtnText: { fontSize: 14 * scale, color: colors.text.hint },
    nlToggleBtn: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border.default,
      marginLeft: 4,
    },
    nlToggleText: {
      fontSize: 11 * scale,
      fontWeight: '700',
      color: colors.text.hint,
      letterSpacing: 0.5,
    },
    nlToggleTextActive: {
      color: colors.brand.primary,
    },
    nlLoadingText: {
      fontSize: 12 * scale,
      color: colors.brand.primary,
      fontWeight: '600',
      marginLeft: 6,
    },

    // -- 搜索模式内容 --
    searchArea: { flex: 1 },
    looseGoodsRow: {
      paddingHorizontal: 12,
      paddingTop: 4,
      paddingBottom: 8,
      gap: 8,
    },
    looseGoodsTag: {
      backgroundColor: colors.brand.primary + '12',
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: colors.brand.primary + '30',
    },
    looseGoodsTagText: {
      fontSize: 13 * scale,
      color: colors.brand.primary,
      fontWeight: '500',
    },
    listContent: { paddingHorizontal: 12, paddingBottom: 100 },
    productItem: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: colors.bg.card, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14,
      marginBottom: 8,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
    },
    productLeft: { flex: 1, marginRight: 12 },
    productName: { fontSize: 15 * scale, fontWeight: '600', color: colors.text.primary },
    productSpec: { fontSize: 13 * scale, color: colors.text.secondary, marginTop: 2 },
    productRight: { alignItems: 'flex-end' },
    productPrice: { fontSize: 15 * scale, fontWeight: '700', color: colors.brand.danger, marginBottom: 4 },
    addCartBtn: {
      width: 28, height: 28, borderRadius: 14,
      backgroundColor: colors.brand.primary, alignItems: 'center', justifyContent: 'center',
    },
    addCartBtnText: { fontSize: 16 * scale, color: colors.text.inverse, fontWeight: '700' },

    // -- 聊天模式 --
    chatArea: { flex: 1 },
    chatScroll: { flex: 1 },
    chatContent: { paddingHorizontal: 12, paddingTop: 8 },
    loadingBubble: {
      alignSelf: 'flex-start',
      backgroundColor: colors.bg.primary,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginVertical: 4,
    },
    loadingText: { fontSize: 14 * scale, color: colors.text.secondary, fontStyle: 'italic' },

    // -- 降级搜索结果 --
    fallbackSection: {
      marginTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border.default,
      paddingTop: 8,
    },
    fallbackTitle: {
      fontSize: 13 * scale,
      color: colors.text.secondary,
      marginBottom: 8,
      fontWeight: '500',
    },
    fallbackItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.bg.card,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 6,
    },
    fallbackLeft: { flex: 1, marginRight: 8 },
    fallbackName: { fontSize: 14 * scale, fontWeight: '500', color: colors.text.primary },
    fallbackSpec: { fontSize: 12 * scale, color: colors.text.secondary, marginTop: 2 },
    fallbackPrice: { fontSize: 14 * scale, fontWeight: '700', color: colors.brand.danger },
    fallbackEmpty: {
      alignItems: 'center',
      paddingVertical: 16,
    },
    fallbackEmptyText: {
      fontSize: 14 * scale,
      color: colors.text.hint,
    },

    // -- 聊天输入栏 --
    chatInputBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#F1F5F9',
      marginHorizontal: 16,
      marginBottom: 8,
      borderRadius: 24,
      paddingHorizontal: 8,
      height: 48,
      borderWidth: 1,
      borderColor: '#E2E8F0',
    },
    voiceBtn: {
      marginRight: 4,
    },
    voiceBtnText: {
      fontSize: 18 * scale,
    },
    chatInput: {
      flex: 1,
      fontSize: 15 * scale,
      color: colors.text.primary,
      padding: 0,
      maxHeight: 100,
    },
    cameraBtn: {
      marginLeft: 4,
    },
    cameraBtnText: {
      fontSize: 20 * scale,
    },

    // -- 购物车栏 --
    cartBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.bg.card,
      borderTopWidth: 1,
      borderTopColor: colors.border.default,
    },
    cartBarInChat: {
      bottom: CHAT_INPUT_HEIGHT,
    },
    cartCollapsed: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 12,
    },
    cartIcon: { fontSize: 20 * scale, marginRight: 8 },
    cartCount: { fontSize: 14 * scale, fontWeight: '600', color: colors.text.primary, marginRight: 12 },
    cartTotal: { flex: 1, fontSize: 16 * scale, fontWeight: '700', color: colors.brand.danger },
    checkoutBtn: {
      backgroundColor: colors.brand.primary, borderRadius: 8,
      paddingHorizontal: 16, paddingVertical: 6,
    },
    checkoutBtnText: { fontSize: 14 * scale, fontWeight: '600', color: colors.text.inverse },
    cartExpanded: { borderTopWidth: 1, borderTopColor: colors.border.default, paddingBottom: 8 },
    cartList: { maxHeight: 200, paddingHorizontal: 16 },
    cartItem: {
      flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
      borderBottomWidth: 1, borderBottomColor: colors.bg.primary,
    },
    cartItemName: { flex: 1, fontSize: 14 * scale, color: colors.text.primary },
    cartItemPrice: { fontSize: 13 * scale, color: colors.text.secondary, marginRight: 8 },
    cartQtyBtn: { fontSize: 18 * scale, color: colors.brand.primary, marginHorizontal: 6 },
    cartQty: { fontSize: 14 * scale, fontWeight: '600', color: colors.text.primary, minWidth: 20, textAlign: 'center' },
    cartSubtotal: { fontSize: 14 * scale, fontWeight: '700', color: colors.brand.danger, marginRight: 8 },
    cartRemove: { fontSize: 12 * scale, color: colors.text.hint },
    cartActions: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 8, gap: 8 },
    clearBtnLarge: {
      flex: 1, paddingVertical: 10, borderRadius: 8,
      backgroundColor: colors.brand.danger + '20', alignItems: 'center',
    },
    clearBtnLargeText: { fontSize: 14 * scale, color: colors.brand.danger, fontWeight: '600' },
    checkoutBtnLarge: {
      flex: 1, paddingVertical: 10, borderRadius: 8,
      backgroundColor: colors.brand.primary, alignItems: 'center',
    },
    checkoutBtnLargeText: { fontSize: 14 * scale, color: colors.text.inverse, fontWeight: '600' },

    // -- 弹窗 --
    modalOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center', alignItems: 'center',
    },
    modalContent: {
      width: '85%', maxHeight: '70%',
      backgroundColor: colors.bg.card, borderRadius: 12, padding: 20,
    },
    modalTitle: { fontSize: 18 * scale, fontWeight: '700', color: colors.text.primary, marginBottom: 16 },
    modalItem: {
      flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
      borderBottomWidth: 1, borderBottomColor: colors.bg.primary,
    },
    modalItemName: { flex: 1, fontSize: 14 * scale, color: colors.text.primary },
    modalItemQty: { fontSize: 13 * scale, color: colors.text.secondary, marginRight: 12 },
    modalItemTotal: { fontSize: 14 * scale, fontWeight: '600', color: colors.brand.danger },
    modalGrandTotal: {
      fontSize: 18 * scale, fontWeight: '700', color: colors.brand.danger,
      textAlign: 'right', marginTop: 16, marginBottom: 16,
    },
    modalCloseBtn: {
      backgroundColor: colors.brand.primary, borderRadius: 10,
      paddingVertical: 12, alignItems: 'center',
    },
    modalCloseBtnText: { fontSize: 16 * scale, fontWeight: '600', color: colors.text.inverse },

    // -- 复选框 --
    checkbox: {
      width: 22, height: 22, borderRadius: 11,
      borderWidth: 2, borderColor: colors.border.default,
      marginRight: 8, alignItems: 'center', justifyContent: 'center',
    },
    checkboxChecked: {
      backgroundColor: colors.brand.primary, borderColor: colors.brand.primary,
    },
    checkboxMark: { color: colors.text.inverse, fontSize: 14 * scale, fontWeight: '700' },
    productItemSelected: {
      backgroundColor: colors.brand.primary + '20',
    },

    // -- FAB --
    fab: {
      position: 'absolute',
      bottom: 80, right: 16,
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: colors.brand.primary,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: colors.brand.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
    },
    fabText: { fontSize: 28 * scale, color: colors.text.inverse, fontWeight: '300' },
    fabScan: {
      backgroundColor: colors.brand.success, bottom: 148, right: 16,
      shadowColor: colors.brand.success,
    },
    fabScanWithMgmt: { bottom: 216 },
    fabScanText: { fontSize: 22 * scale },

    // -- 空状态 --
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 80 },
    emptyText: { fontSize: 16 * scale, color: colors.text.hint },
    emptyHint: { fontSize: 13 * scale, color: colors.text.hint, marginTop: 6 },
    emptyAiBtn: {
      marginTop: 12,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: colors.brand.primary + '15',
      borderWidth: 1,
      borderColor: colors.brand.primary + '40',
    },
    emptyAiBtnText: {
      fontSize: 14 * scale,
      color: colors.brand.primary,
      fontWeight: '600',
    },

    // -- 批量管理工具栏（固定深色，不受主题影响） --
    batchToolbar: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: '#1E293B', paddingHorizontal: 12, paddingVertical: 8,
    },
    batchToolbarText: {
      fontSize: 12 * scale, color: '#94A3B8', marginBottom: 6,
    },
    batchToolbarRow: {
      flexDirection: 'row', gap: 6,
    },
    batchBtn: {
      flex: 1, paddingVertical: 8, borderRadius: 6,
      backgroundColor: '#334155', alignItems: 'center',
    },
    batchBtnText: { fontSize: 12 * scale, color: '#FFFFFF', fontWeight: '600' },
    batchBtnDanger: { backgroundColor: colors.brand.danger },
    batchBtnDangerText: { color: '#FFFFFF' },
    batchBtnExit: { backgroundColor: '#475569' },
    batchBtnExitText: { color: '#FFFFFF' },

    // -- 骨架屏 --
    skeletonContainer: { padding: 12 },
    skeletonCard: {
      height: 68, backgroundColor: '#E0E0E0', borderRadius: 10,
      marginBottom: 10, opacity: 0.4,
    },

    // -- 模型切换弹窗 --
    modelModalOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center', alignItems: 'center',
    },
    modelModalContent: {
      width: '80%', backgroundColor: colors.bg.card, borderRadius: 12,
      padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
    },
    modelModalTitle: {
      fontSize: 16 * scale, fontWeight: '700', color: colors.text.primary,
      textAlign: 'center', marginBottom: 16,
    },
    modelOption: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 12, paddingHorizontal: 12, borderRadius: 8,
      backgroundColor: colors.bg.primary, marginBottom: 6,
    },
    modelOptionActive: {
      backgroundColor: colors.brand.primary + '12',
      borderWidth: 1, borderColor: colors.brand.primary + '40',
    },
    modelOptionText: {
      fontSize: 14 * scale, color: colors.text.primary,
    },
    modelOptionTextActive: {
      color: colors.brand.primary, fontWeight: '600',
    },
    modelModalClose: {
      marginTop: 12, paddingVertical: 10, borderRadius: 8,
      backgroundColor: colors.bg.primary, alignItems: 'center',
    },
    modelModalCloseText: {
      fontSize: 14 * scale, color: colors.text.secondary, fontWeight: '500',
    },
  });
}
