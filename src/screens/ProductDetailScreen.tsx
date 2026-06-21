import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useStore } from '../context/store';
import { getProductById } from '../db/product';
import { getPriceHistory } from '../db/product';
import { softDeleteProduct } from '../db/product';
import type { Product } from '../db/types';
import type { ProductDetailScreenProps } from '../navigation/types';

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

export function ProductDetailScreen({ navigation, route }: ProductDetailScreenProps) {
  const { db } = useStore();
  const productId = route.params?.id;

  const handleEdit = useCallback(() => {
    if (productId) {
      navigation.navigate('ProductEdit', { id: productId });
    }
  }, [navigation, productId]);

  const handleDelete = useCallback(async () => {
    if (!productId) return;
    try {
      await softDeleteProduct(db, productId);
      navigation.goBack();
    } catch (e) {
      console.error('ProductDetailScreen: 软删除失败', e);
      Alert.alert('删除失败', e instanceof Error ? e.message : '未知错误');
    }
  }, [db, navigation, productId]);

  if (!productId) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>商品不存在或已被删除</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <DetailContent db={db} productId={productId} />
      <View style={styles.bottomBar}>
        <TouchableOpacity style={[styles.actionButton, styles.editButton]} onPress={handleEdit}>
          <Text style={styles.actionButtonText}>编辑</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={handleDelete}>
          <Text style={[styles.actionButtonText, styles.deleteButtonText]}>软删除</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ==================== 子组件 ====================

function DetailContent({ db, productId }: { db: ReturnType<typeof useStore>['db']; productId: string }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [history, setHistory] = useState<{ id: string; oldPrice: number; newPrice: number; changedAt: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      getProductById(db, productId).then((p) => {
        if (cancelled) return;
        setProduct(p);
        return getPriceHistory(db, productId);
      }).then((h) => {
        if (cancelled) return;
        setHistory(h);
        setLoading(false);
      }).catch(() => {
        if (!cancelled) setLoading(false);
      });
      return () => { cancelled = true; };
    }, [db, productId]),
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>加载中...</Text>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>该商品不存在或已被删除</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {/* 商品信息 */}
      <View style={styles.card}>
        <Text style={styles.productName}>{product.name}</Text>
        <View style={styles.infoContent}>
          {product.pinyin && <InfoRow label="拼音" value={product.pinyin} />}
          <InfoRow label="价格" value={`¥${product.price.toFixed(2)}`} highlight />
          {product.spec && <InfoRow label="规格" value={product.spec} />}
          {product.barcode && <InfoRow label="条码" value={product.barcode} />}
          {product.category && <InfoRow label="分类" value={product.category} />}
          <View style={styles.statusRow}>
            <Text style={styles.infoLabel}>状态</Text>
            <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[product.status] || '#94A3B8' }]}>
              <Text style={styles.statusText}>{STATUS_LABELS[product.status] || product.status}</Text>
            </View>
          </View>
          <InfoRow label="更新时间" value={product.updatedAt} sub />
          <InfoRow label="创建时间" value={product.createdAt} sub />
        </View>
      </View>

      {/* 价格历史 */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>价格历史</Text>
        {history.length === 0 ? (
          <Text style={styles.emptyText}>暂无价格变更记录</Text>
        ) : (
          history.map((h) => (
            <View key={h.id} style={styles.historyItem}>
              <View style={styles.historyPriceRow}>
                <Text style={styles.historyOldPrice}>¥{h.oldPrice.toFixed(2)}</Text>
                <Text style={styles.historyArrow}>→</Text>
                <Text style={styles.historyNewPrice}>¥{h.newPrice.toFixed(2)}</Text>
              </View>
              <Text style={styles.historyDate}>{h.changedAt}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function InfoRow({ label, value, highlight, sub }: { label: string; value: string; highlight?: boolean; sub?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, sub && styles.infoLabelSub]}>{label}</Text>
      <Text style={[styles.infoValue, highlight && styles.infoValueHighlight]}>{value}</Text>
    </View>
  );
}

// ==================== 样式 ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 80,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  productName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12,
  },
  infoContent: {
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  infoLabelSub: {
    fontSize: 12,
    color: '#94A3B8',
  },
  infoValue: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '600',
  },
  infoValueHighlight: {
    fontSize: 18,
    color: '#DC2626',
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: '#94A3B8',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 12,
  },
  historyItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  historyPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyOldPrice: {
    fontSize: 14,
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  historyArrow: {
    fontSize: 14,
    color: '#CBD5E1',
  },
  historyNewPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#DC2626',
  },
  historyDate: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 24,
    paddingTop: 10,
    backgroundColor: '#F1F5F9',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: {
    backgroundColor: '#2563EB',
  },
  deleteButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DC2626',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  deleteButtonText: {
    color: '#DC2626',
  },
});
