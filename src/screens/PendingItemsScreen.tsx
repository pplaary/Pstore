import React, { useState, useCallback, useMemo } from 'react';
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
import { getAll, deleteById, convertToProduct } from '../db/pending';
import { useTheme } from '../theme/ThemeContext';
import type { PendingItem } from '../db/types';

export function PendingItemsScreen({ navigation }: any) {
  const { db } = useStore();
  const { theme } = useTheme();
  const { colors, scale } = theme;
  const styles = useMemo(() => createStyles(colors, scale), [colors, scale]);
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
    async (item: PendingItem) => {
      try {
        const barcode = await convertToProduct(db, item.id);
        navigation.navigate('ProductEdit', { barcode });
      } catch (e) {
        console.error('PendingItemsScreen: 转换失败', e);
      }
    },
    [db, navigation],
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

// ==================== 样式 ====================

function createStyles(colors: ReturnType<typeof useTheme>['theme']['colors'], scale: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg.primary },
    listContent: { padding: 12 },
    itemRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: colors.bg.card, borderRadius: 10, padding: 16, marginBottom: 8,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
    },
    itemInfo: { flex: 1, marginRight: 12 },
    barcodeText: { fontSize: 15 * scale, fontWeight: '600', color: colors.text.primary },
    timeText: { fontSize: 12 * scale, color: colors.text.secondary, marginTop: 4 },
    itemActions: { flexDirection: 'row', gap: 8 },
    convertBtn: {
      backgroundColor: colors.brand.primary, borderRadius: 6,
      paddingHorizontal: 12, paddingVertical: 6,
    },
    convertBtnText: { color: colors.text.inverse, fontSize: 13 * scale, fontWeight: '600' },
    deleteBtn: {
      backgroundColor: colors.bg.primary, borderRadius: 6,
      paddingHorizontal: 12, paddingVertical: 6,
    },
    deleteBtnText: { color: colors.brand.danger, fontSize: 13 * scale, fontWeight: '600' },
    emptyContainer: {
      flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32,
    },
    emptyText: { fontSize: 16 * scale, color: colors.text.hint, marginBottom: 8 },
    emptyHint: { fontSize: 14 * scale, color: colors.text.secondary, textAlign: 'center' },
  });
}
