import React, { useState, useCallback, useLayoutEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useModeStore } from '../store/mode';
import { useStore } from '../context/store';
import { useSyncConfigStore } from '../store/syncConfig';
import { searchProducts } from '../db/search';
import { aiQuery } from '../services/n1';
import type { AiQueryResult } from '../services/n1';
import { useTheme } from '../theme/ThemeContext';
import { CATEGORIES } from '../db/types';
import type { Product, ProductStatus } from '../db/types';
import type { ProductListScreenCompositeProps } from '../navigation/types';
import { showToast } from '../utils/toast';

export function ProductListScreen({ navigation, route }: ProductListScreenCompositeProps) {
  const { db, products, refreshProducts } = useStore();
  const { theme } = useTheme();
  const { colors, scale } = theme;
  const styles = useMemo(() => createStyles(colors, scale), [colors, scale]);
  const filter = route.params?.filter;
  const isManagement = useModeStore(s => s.isManagement);
  const syncConfigServerUrl = useSyncConfigStore((s) => s.serverUrl);
  const isNLSearchAvailable = !!syncConfigServerUrl;

  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);

  // ========== NL 搜索模式状态 ==========
  const [isNLSearch, setIsNLSearch] = useState(false);
  const [isNLLoading, setIsNLLoading] = useState(false);
  const [nlResult, setNlResult] = useState<AiQueryResult | null>(null);

  const statusColors: Record<string, string> = {
    IN_SHOP: colors.brand.inShop,
    OUT_OF_STOCK: colors.brand.outOfStock,
    TO_BE_PURCHASED: colors.brand.toBePurchased,
  };

  // 右上角 "+" 按钮（仅管理模式/未过滤已删除时显示）
  useLayoutEffect(() => {
    if (filter === 'deleted' || !isManagement) {
      navigation.setOptions({ headerRight: undefined });
    } else {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => navigation.navigate('ProductEdit', {})}
            accessibilityLabel="添加新商品"
            accessibilityRole="button"
          >
            <Text style={styles.headerButtonText}>+</Text>
          </TouchableOpacity>
        ),
      });
    }
  }, [navigation, filter]);

  // 执行搜索/过滤
  const doSearch = useCallback(async () => {
    try {
      const options: any = {
        category: selectedCategory ?? undefined,
        sortBy: 'relevance',
      };
      if (filter === 'deleted') {
        options.includeDeleted = true;
      }
      const result = await searchProducts(db, query.trim(), options);
      setFilteredProducts(result);
    } catch (e) {
      console.error('ProductListScreen: 搜索失败', e);
      setFilteredProducts([]);
    }
  }, [db, query, selectedCategory, filter]);

  // ========== NL 搜索 ==========
  const doNLSearch = useCallback(async (question: string) => {
    if (!question.trim() || !syncConfigServerUrl) return;
    setIsNLLoading(true);
    try {
      const res = await aiQuery(syncConfigServerUrl, question);
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
      console.error('ProductListScreen: NL 搜索失败', e);
      setFilteredProducts([]);
      setNlResult(null);
      showToast('AI 搜索失败，请稍后重试');
    } finally {
      setIsNLLoading(false);
    }
  }, [db, syncConfigServerUrl]);

  // 搜索词或分类变化时实时搜索
  React.useEffect(() => {
    if (isNLSearch) {
      doNLSearch(query);
    } else {
      doSearch();
    }
  }, [doSearch, doNLSearch, isNLSearch]);

  // 页面聚焦时刷新全局商品列表
  useFocusEffect(
    useCallback(() => {
      refreshProducts();
    }, [refreshProducts]),
  );

  // 切换分类
  const handleCategoryPress = (cat: string) => {
    if (selectedCategory === cat) {
      setSelectedCategory(null);
    } else {
      setSelectedCategory(cat);
    }
  };

  // 渲染单个商品行
  const renderItem = ({ item }: { item: Product }) => {
    const statusLabels: Record<string, string> = {
      IN_SHOP: '在售',
      OUT_OF_STOCK: '缺货',
      TO_BE_PURCHASED: '待采',
    };
    return (
      <TouchableOpacity
        style={styles.productItem}
        onPress={() => navigation.navigate('ProductDetail', { id: item.id })}
        accessibilityLabel={`${item.name}，价格${item.price.toFixed(2)}元，${item.spec ? `规格${item.spec}，` : ''}状态${statusLabels[item.status]}`}
        accessibilityRole="button"
      >
        <View style={styles.productLeft}>
          <View style={styles.productNameRow}>
            <Text style={styles.productName} numberOfLines={1}>
              {item.name}
            </Text>
            {item.pinyin ? (
              <Text style={styles.productPinyin}>{item.pinyin}</Text>
            ) : null}
          </View>
          {item.spec ? (
            <Text style={styles.productSpec} numberOfLines={1}>
              {item.spec}
            </Text>
          ) : null}
        </View>
        <View style={styles.productRight}>
          <Text style={styles.productPrice}>¥{item.price.toFixed(2)}</Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusColors[item.status] || colors.text.hint },
            ]}
          >
            <Text style={styles.statusText}>
              {statusLabels[item.status] || item.status}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const isEmpty = !query.trim() && !selectedCategory
    ? filteredProducts.length === 0
    : filteredProducts.length === 0;

  return (
    <View style={styles.container}>
      {/* 搜索栏 */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>&#x1F50D;</Text>
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
            style={styles.clearButton}
            onPress={() => setQuery('')}
            accessibilityLabel="清除搜索"
            accessibilityRole="button"
          >
            <Text style={styles.clearButtonText}>✕</Text>
          </TouchableOpacity>
        )}
        {isNLLoading && (
          <Text style={styles.nlLoadingText}>AI...</Text>
        )}
      </View>

      {/* 分类筛选条 */}
      <View style={styles.categoryBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryContent}
        >
          {CATEGORIES.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => handleCategoryPress(cat)}
                accessibilityLabel={`分类：${cat}${active ? '，已选中' : ''}`}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    active && styles.categoryChipTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 列表 */}
      {isEmpty ? (
        <View style={styles.emptyContainer}>
          {isNLSearch ? (
            <>
              <Text style={styles.emptyIcon}>&#x1F50E;</Text>
              <Text style={styles.emptyText}>AI 搜索未找到匹配商品</Text>
              {nlResult?.answer && (
                <Text style={styles.emptySubText}>{nlResult.answer}</Text>
              )}
            </>
          ) : (
            <>
              <Text style={styles.emptyIcon}>&#x1F50E;</Text>
              <Text style={styles.emptyText}>未找到商品</Text>
              <Text style={styles.emptySubText}>
                {query.trim()
                  ? `没有与「${query.trim()}」匹配的商品`
                  : '请添加商品或调整筛选条件'}
              </Text>
              {!isNLSearch && isNLSearchAvailable && (
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
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* 底部扫码按钮 */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.scanButton}
          onPress={() => (navigation as any).navigate('ScanBarcode')}
          accessibilityLabel="扫码识别"
          accessibilityRole="button"
        >
          <Text style={styles.scanButtonIcon}>&#x1F4F7;</Text>
          <Text style={styles.scanButtonText}>扫码识别</Text>
        </TouchableOpacity>
      </View>

      {/* 管理模式 FAB */}
      {isManagement && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('ProductEdit' as any)}
          activeOpacity={0.8}
          accessibilityLabel="添加新商品"
          accessibilityRole="button"
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ==================== 样式 ====================

function createStyles(colors: ReturnType<typeof useTheme>['theme']['colors'], scale: number) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg.primary,
    },
    // 头部按钮
    headerButton: {
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    headerButtonText: {
      fontSize: 28 * scale,
      fontWeight: '300',
      color: colors.text.inverse,
      lineHeight: 32 * scale,
    },
    // 搜索栏
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.bg.card,
      marginHorizontal: 12,
      marginTop: 12,
      marginBottom: 8,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 44,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    searchIcon: {
      fontSize: 16 * scale,
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 15 * scale,
      color: colors.text.primary,
      padding: 0,
    },
    clearButton: {
      padding: 4,
      marginLeft: 4,
    },
    clearButtonText: {
      fontSize: 14 * scale,
      color: colors.text.hint,
    },
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
    // 分类筛选条
    categoryBar: {
      marginBottom: 8,
    },
    categoryContent: {
      paddingHorizontal: 12,
      gap: 8,
    },
    categoryChip: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    categoryChipActive: {
      backgroundColor: colors.brand.primary,
      borderColor: colors.brand.primary,
    },
    categoryChipText: {
      fontSize: 13 * scale,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    categoryChipTextActive: {
      color: colors.text.inverse,
    },
    // 列表
    listContent: {
      paddingHorizontal: 12,
      paddingBottom: 80,
    },
    productItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.bg.card,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginBottom: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 2,
      elevation: 1,
    },
    productLeft: {
      flex: 1,
      marginRight: 12,
    },
    productNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    productName: {
      fontSize: 16 * scale,
      fontWeight: '600',
      color: colors.text.primary,
      maxWidth: '70%',
    },
    productPinyin: {
      fontSize: 12 * scale,
      color: colors.text.hint,
      marginLeft: 6,
      fontWeight: '500',
    },
    productSpec: {
      fontSize: 13 * scale,
      color: colors.text.secondary,
      marginTop: 4,
    },
    productRight: {
      alignItems: 'flex-end',
    },
    productPrice: {
      fontSize: 16 * scale,
      fontWeight: '700',
      color: colors.brand.danger,
      marginBottom: 4,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
    },
    statusText: {
      fontSize: 11 * scale,
      color: '#FFFFFF',
      fontWeight: '600',
    },
    // 空状态
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingBottom: 60,
    },
    emptyIcon: {
      fontSize: 40 * scale,
      marginBottom: 12,
    },
    emptyText: {
      fontSize: 17 * scale,
      fontWeight: '600',
      color: colors.text.secondary,
      marginBottom: 6,
    },
    emptySubText: {
      fontSize: 14 * scale,
      color: colors.text.hint,
    },
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
    // 底部扫码
    bottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 12,
      paddingBottom: 24,
      paddingTop: 10,
      backgroundColor: colors.bg.primary,
    },
    scanButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.brand.primary,
      borderRadius: 12,
      paddingVertical: 14,
      shadowColor: colors.brand.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 4,
    },
    scanButtonIcon: {
      fontSize: 18 * scale,
      marginRight: 8,
    },
    scanButtonText: {
      fontSize: 16 * scale,
      fontWeight: '600',
      color: colors.text.inverse,
    },
    // 管理模式 FAB
    fab: {
      position: 'absolute',
      bottom: 24,
      right: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.brand.primary,
      justifyContent: 'center',
      alignItems: 'center',
      elevation: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
    },
    fabText: {
      color: '#FFFFFF',
      fontSize: 28,
      fontWeight: '300',
      lineHeight: 30,
    },
  });
}
