/**
 * PendingItemsScreen — 待处理条码列表（管理模式）
 *
 * spec §5.3 / §8.1
 * - 展示所有未处理的 PendingItem
 * - [转为商品] 按钮 → 跳转 ProductEdit 预填条码
 * - 左滑删除
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useStore } from '../context/store';
import { useModeStore } from '../store/mode';
import { getAll, deleteById } from '../db/pending';
import type { PendingItem } from '../db/types';

export function PendingItemsScreen({ navigation }: any) {
  const { db } = useStore();
  const { isManagement } = useModeStore();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadItems = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await getAll(db);
      setItems(result);
    } catch (e) {
      console.error('PendingItemsScreen: 加载失败', e);
    } finally {
      setRefreshing(false);
    }
  }, [db]);

  // 进入时加载
  React.useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleConvert = useCallback(
    (item: PendingItem) => {
      navigation.navigate('ProductEdit', { barcode: item.barcode });
    },
    [navigation],
  );

  const handleDelete = useCallback(
    async (item: PendingItem) => {
      Alert.alert(
        '确认删除',
        `删除条码 ${item.barcode} 的记录？`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '删除',
            style: 'destructive',
            onPress: async () => {
              await deleteById(db, item.id);
              loadItems();
            },
          },
        ],
      );
    },
    [db, loadItems],
  );

  const renderItem = ({ item }: { item: PendingItem }) => (
    <View style={styles.itemRow}>
      <View style={styles.itemInfo}>
        <Text style={styles.barcodeText}>{item.barcode}</Text>
        <Text style={styles.timeText}>
          扫描时间: {new Date(item.scannedAt).toLocaleString('zh-CN')}
        </Text>
      </View>
      <View style={styles.itemActions}>
        <TouchableOpacity
          style={styles.convertBtn}
          onPress={() => handleConvert(item)}
        >
          <Text style={styles.convertBtnText}>转为商品</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDelete(item)}
        >
          <Text style={styles.deleteBtnText}>删除</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>暂无待处理条码</Text>
          <Text style={styles.emptyHint}>
            扫码未知条码后会自动记录在此
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  listContent: { padding: 12 },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFFFFF', borderRadius: 10, padding: 16, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  itemInfo: { flex: 1, marginRight: 12 },
  barcodeText: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  timeText: { fontSize: 12, color: '#64748B', marginTop: 4 },
  itemActions: { flexDirection: 'row', gap: 8 },
  convertBtn: {
    backgroundColor: '#2563EB', borderRadius: 6,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  convertBtnText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  deleteBtn: {
    backgroundColor: '#F1F5F9', borderRadius: 6,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  deleteBtnText: { color: '#DC2626', fontSize: 13, fontWeight: '600' },
  emptyContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  emptyText: { fontSize: 16, color: '#94A3B8', marginBottom: 8 },
  emptyHint: { fontSize: 14, color: '#64748B', textAlign: 'center' },
});
