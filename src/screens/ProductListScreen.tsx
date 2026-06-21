import React, { useState, useCallback, useLayoutEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useStore } from '../context/store';
import { searchProducts } from '../db/search';
import { CATEGORIES } from '../db/types';
import type { Product } from '../db/types';
import type { ProductListScreenProps } from '../navigation/types';

const STATUS_COLORS: Record<string, string> = {
  IN_SHOP: '#16A34A',
  OUT_OF_STOCK: '#DC2626',
  TO_BE_PURCHASED: '#EA580C',
};

const STATUS_LABELS: Record<string, string> = {
  IN_SHOP: '在售',
  OUT_OF_STOCK: '缺货',
  TO_BE_PURCHASED: '待采',
};

export function ProductListScreen({ navigation }: ProductListScreenProps) {
  const { db, products, refreshProducts } = useStore();

  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);

  // 右上角 "+" 按钮
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.navigate('ProductEdit', {})}
        >
          <Text style={styles.headerButtonText}>+</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  // 执行搜索/过滤
  const doSearch = useCallback(async () => {
    try {
      const result = await searchProducts(db, query.trim(), {
        category: selectedCategory ?? undefined,
        sortBy: 'relevance',
      });
      setFilteredProducts(result);
    } catch (e) {
      console.error('ProductListScreen: 搜索失败', e);
      setFilteredProducts([]);
    }
  }, [db, query, selectedCategory]);

  // 搜索词或分类变化时实时搜索
  React.useEffect(() => {
    doSearch();
  }, [doSearch]);

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
  const renderItem = ({ item }: { item: Product }) => (
    <TouchableOpacity
      style={styles.productItem}
      onPress={() => navigation.navigate('ProductDetail', { id: item.id })}
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
            { backgroundColor: STATUS_COLORS[item.status] || '#94A3B8' },
          ]}
        >
          <Text style={styles.statusText}>
            {STATUS_LABELS[item.status] || item.status}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

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
          placeholder="搜索商品名称、拼音或条码"
          placeholderTextColor="#94A3B8"
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => setQuery('')}
          >
            <Text style={styles.clearButtonText}>✕</Text>
          </TouchableOpacity>
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
          <Text style={styles.emptyIcon}>&#x1F50E;</Text>
          <Text style={styles.emptyText}>未找到商品</Text>
          <Text style={styles.emptySubText}>
            {query.trim()
              ? `没有与「${query.trim()}」匹配的商品`
              : '请添加商品或调整筛选条件'}
          </Text>
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
          onPress={() => navigation.navigate('ScanBarcode')}
        >
          <Text style={styles.scanButtonIcon}>&#x1F4F7;</Text>
          <Text style={styles.scanButtonText}>扫码识别</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  // 头部按钮
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  headerButtonText: {
    fontSize: 28,
    fontWeight: '300',
    color: '#FFFFFF',
    lineHeight: 32,
  },
  // 搜索栏
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
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
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1E293B',
    padding: 0,
  },
  clearButton: {
    padding: 4,
    marginLeft: 4,
  },
  clearButtonText: {
    fontSize: 14,
    color: '#94A3B8',
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  categoryChipText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
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
    backgroundColor: '#FFFFFF',
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
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    maxWidth: '70%',
  },
  productPinyin: {
    fontSize: 12,
    color: '#94A3B8',
    marginLeft: 6,
    fontWeight: '500',
  },
  productSpec: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
  },
  productRight: {
    alignItems: 'flex-end',
  },
  productPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#DC2626',
    marginBottom: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
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
    fontSize: 40,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 6,
  },
  emptySubText: {
    fontSize: 14,
    color: '#94A3B8',
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
    backgroundColor: '#F1F5F9',
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  scanButtonIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  scanButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
