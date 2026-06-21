/**
 * 主界面 (HomeScreen)
 *
 * 包含：
 * 1. 搜索栏 + 商品列表（复用 ProductListScreen 核心逻辑）
 * 2. 购物车折叠栏（底部固定）
 * 3. 底部输入栏（语音 + 搜索框 + 相机）
 * 4. 连击标题进入管理模式（5 次/5 秒）
 */

import React, { useState, useCallback, useLayoutEffect, useRef } from 'react';
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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useStore } from '../context/store';
import { useCartStore } from '../store/cart';
import { useModeStore } from '../store/mode';
import { searchProducts } from '../db/search';
import { updateProduct, softDeleteProduct } from '../db/product';
import { PinModal } from '../components/PinModal';
import type { Product, ProductStatus } from '../db/types';
import type { HomeScreenProps } from '../navigation/types';

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

export function HomeScreen({ navigation }: HomeScreenProps) {
  const { db, refreshProducts } = useStore();
  const { items, total, addToCart, removeFromCart, removeItem, clearCart } = useCartStore();
  const { isManagement, exitManagement } = useModeStore();
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [cartExpanded, setCartExpanded] = useState(false);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [pinVisible, setPinVisible] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusMenuId, setStatusMenuId] = useState<string | null>(null);
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 搜索
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

  React.useEffect(() => {
    doSearch();
  }, [doSearch]);

  useFocusEffect(
    useCallback(() => {
      refreshProducts();
    }, [refreshProducts]),
  );

  // 连击标题进入/退出管理模式
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

  // 顶部栏
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => navigation.openDrawer()}
          style={styles.headerMenuBtn}
        >
          <Text style={styles.headerMenuText}>☰</Text>
        </TouchableOpacity>
      ),
      headerTitle: () => (
        <TouchableOpacity onPress={handleTitlePress} activeOpacity={0.6}>
          <Text style={styles.headerTitle}>
            {isManagement ? 'PStore [管理]' : 'PStore'}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, isManagement, handleTitlePress]);

  const handleAddToCart = useCallback((product: Product) => {
    addToCart(product.id, product.name, product.price);
  }, [addToCart]);

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
    // 长按弹出操作菜单
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

  // 渲染商品
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
      >
        {batchMode && (
          <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
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
            >
              <Text style={styles.addCartBtnText}>+</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const isEmpty = !query.trim() && !selectedCategory
    ? filteredProducts.length === 0
    : filteredProducts.length === 0;

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <View style={styles.container}>
      {/* 搜索栏 */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
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
          <TouchableOpacity style={styles.clearBtn} onPress={() => setQuery('')}>
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 商品列表 */}
      {isEmpty ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>未找到商品</Text>
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

      {/* 购物车折叠栏 */}
      {items.length > 0 && (
        <View style={styles.cartBar}>
          <TouchableOpacity
            style={styles.cartCollapsed}
            onPress={() => setCartExpanded(!cartExpanded)}
          >
            <Text style={styles.cartIcon}>🛒</Text>
            <Text style={styles.cartCount}>×{totalQty}</Text>
            <Text style={styles.cartTotal}>¥{total.toFixed(2)}</Text>
            <TouchableOpacity
              style={styles.checkoutBtn}
              onPress={() => setCheckoutVisible(true)}
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
                    <TouchableOpacity onPress={() => removeFromCart(item.productId)}>
                      <Text style={styles.cartQtyBtn}>⊖</Text>
                    </TouchableOpacity>
                    <Text style={styles.cartQty}>{item.quantity}</Text>
                    <TouchableOpacity onPress={() => addToCart(item.productId, item.name, item.price)}>
                      <Text style={styles.cartQtyBtn}>⊕</Text>
                    </TouchableOpacity>
                    <Text style={styles.cartSubtotal}>¥{(item.price * item.quantity).toFixed(2)}</Text>
                    <TouchableOpacity onPress={() => removeItem(item.productId)}>
                      <Text style={styles.cartRemove}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
              <View style={styles.cartActions}>
                <TouchableOpacity style={styles.clearBtnLarge} onPress={clearCart}>
                  <Text style={styles.clearBtnLargeText}>清空</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.checkoutBtnLarge} onPress={() => { setCheckoutVisible(true); setCartExpanded(false); }}>
                  <Text style={styles.checkoutBtnLargeText}>结账</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      {/* 结账弹窗 */}
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
            >
              <Text style={styles.modalCloseBtnText}>关闭并清空</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* PIN 弹窗 */}
      <PinModal
        visible={pinVisible}
        onClose={() => setPinVisible(false)}
        onSuccess={() => setPinVisible(false)}
      />

      {/* 管理模式 FAB 按钮 */}
      {isManagement && !batchMode && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('ProductEdit', {})}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      {/* 扫码按钮（全员可见） */}
      {!batchMode && (
        <TouchableOpacity
          style={[styles.fab, styles.fabScan, isManagement && styles.fabScanWithMgmt]}
          onPress={() => navigation.navigate('ScanBarcode', { mode: 'scan' })}
        >
          <Text style={styles.fabScanText}>📷</Text>
        </TouchableOpacity>
      )}

      {/* 批量管理工具栏 */}
      {batchMode && (
        <View style={styles.batchToolbar}>
          <Text style={styles.batchToolbarText}>已选 {selectedIds.size} 项</Text>
          <View style={styles.batchToolbarRow}>
            <TouchableOpacity style={styles.batchBtn} onPress={selectAll}>
              <Text style={styles.batchBtnText}>全选</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.batchBtn} onPress={deselectAll}>
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
            >
              <Text style={styles.batchBtnText}>改状态</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.batchBtn, styles.batchBtnDanger]} onPress={handleBatchDelete}>
              <Text style={[styles.batchBtnText, styles.batchBtnDangerText]}>删除</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.batchBtn, styles.batchBtnExit]} onPress={() => { setBatchMode(false); setSelectedIds(new Set()); }}>
              <Text style={styles.batchBtnExitText}>退出</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  headerMenuBtn: { paddingHorizontal: 12, paddingVertical: 4 },
  headerMenuText: { fontSize: 22, color: '#2563EB' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#1E293B' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', marginHorizontal: 12, marginTop: 8, marginBottom: 8,
    borderRadius: 10, paddingHorizontal: 12, height: 44,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#1E293B', padding: 0 },
  clearBtn: { padding: 4, marginLeft: 4 },
  clearBtnText: { fontSize: 14, color: '#94A3B8' },
  listContent: { paddingHorizontal: 12, paddingBottom: 100 },
  productItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14,
    marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  productLeft: { flex: 1, marginRight: 12 },
  productName: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  productSpec: { fontSize: 13, color: '#64748B', marginTop: 2 },
  productRight: { alignItems: 'flex-end' },
  productPrice: { fontSize: 15, fontWeight: '700', color: '#DC2626', marginBottom: 4 },
  addCartBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center',
  },
  addCartBtnText: { fontSize: 16, color: '#FFF', fontWeight: '700' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 80 },
  emptyText: { fontSize: 16, color: '#94A3B8' },
  cartBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E2E8F0',
  },
  cartCollapsed: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  cartIcon: { fontSize: 20, marginRight: 8 },
  cartCount: { fontSize: 14, fontWeight: '600', color: '#1E293B', marginRight: 12 },
  cartTotal: { flex: 1, fontSize: 16, fontWeight: '700', color: '#DC2626' },
  checkoutBtn: {
    backgroundColor: '#2563EB', borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 6,
  },
  checkoutBtnText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  cartExpanded: { borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingBottom: 8 },
  cartList: { maxHeight: 200, paddingHorizontal: 16 },
  cartItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  cartItemName: { flex: 1, fontSize: 14, color: '#1E293B' },
  cartItemPrice: { fontSize: 13, color: '#64748B', marginRight: 8 },
  cartQtyBtn: { fontSize: 18, color: '#2563EB', marginHorizontal: 6 },
  cartQty: { fontSize: 14, fontWeight: '600', color: '#1E293B', minWidth: 20, textAlign: 'center' },
  cartSubtotal: { fontSize: 14, fontWeight: '700', color: '#DC2626', marginRight: 8 },
  cartRemove: { fontSize: 12, color: '#94A3B8' },
  cartActions: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  clearBtnLarge: {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    backgroundColor: '#FEF2F2', alignItems: 'center',
  },
  clearBtnLargeText: { fontSize: 14, color: '#DC2626', fontWeight: '600' },
  checkoutBtnLarge: {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    backgroundColor: '#2563EB', alignItems: 'center',
  },
  checkoutBtnLargeText: { fontSize: 14, color: '#FFF', fontWeight: '600' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalContent: {
    width: '85%', maxHeight: '70%',
    backgroundColor: '#FFF', borderRadius: 12, padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 16 },
  modalItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  modalItemName: { flex: 1, fontSize: 14, color: '#1E293B' },
  modalItemQty: { fontSize: 13, color: '#64748B', marginRight: 12 },
  modalItemTotal: { fontSize: 14, fontWeight: '600', color: '#DC2626' },
  modalGrandTotal: {
    fontSize: 18, fontWeight: '700', color: '#DC2626',
    textAlign: 'right', marginTop: 16, marginBottom: 16,
  },
  modalCloseBtn: {
    backgroundColor: '#2563EB', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  modalCloseBtnText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  checkbox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: '#CBD5E1',
    marginRight: 8, alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#2563EB', borderColor: '#2563EB',
  },
  checkboxMark: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  productItemSelected: {
    backgroundColor: '#EFF6FF',
  },
  fab: {
    position: 'absolute',
    bottom: 80, right: 16,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#2563EB',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#2563EB', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  fabText: { fontSize: 28, color: '#FFF', fontWeight: '300' },
  fabScan: {
    backgroundColor: '#10B981', bottom: 148, right: 16,
    shadowColor: '#10B981',
  },
  fabScanWithMgmt: { bottom: 216 },
  fabScanText: { fontSize: 22 },
  batchToolbar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#1E293B', paddingHorizontal: 12, paddingVertical: 8,
  },
  batchToolbarText: {
    fontSize: 12, color: '#94A3B8', marginBottom: 6,
  },
  batchToolbarRow: {
    flexDirection: 'row', gap: 6,
  },
  batchBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 6,
    backgroundColor: '#334155', alignItems: 'center',
  },
  batchBtnText: { fontSize: 12, color: '#FFF', fontWeight: '600' },
  batchBtnDanger: { backgroundColor: '#DC2626' },
  batchBtnDangerText: { color: '#FFF' },
  batchBtnExit: { backgroundColor: '#475569' },
  batchBtnExitText: { color: '#FFF' },
});
