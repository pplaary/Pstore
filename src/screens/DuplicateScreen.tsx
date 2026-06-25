import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
} from 'react-native';
import { useStore } from '../context/store';
import { useModeStore } from '../store/mode';
import { getAllMergeCandidates, mergeProducts, markNotDuplicate } from '../db/duplicate';
import { useTheme } from '../theme/ThemeContext';
import type { MergeCandidate } from '../db/types';

type ConfirmState = {
  candidate: MergeCandidate;
  keepChoice: 'A' | 'B';
} | null;

export function DuplicateScreen({ navigation }: any) {
  const { db } = useStore();
  const { theme } = useTheme();
  const { colors, scale } = theme;
  const styles = useMemo(() => createStyles(colors, scale), [colors, scale]);
  const [candidates, setCandidates] = useState<MergeCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAllMergeCandidates(db);
      setCandidates(result);
    } catch (e) {
      console.error('DuplicateScreen: 加载失败', e);
    } finally {
      setLoading(false);
    }
  }, [db]);

  React.useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  // 条码一致：自动合并（静默）
  const handleAutoMerge = useCallback(
    async (candidate: MergeCandidate) => {
      try {
        // 选择 updatedAt 较新的作为 keep
        const aTime = new Date(candidate.productA.updatedAt).getTime();
        const bTime = new Date(candidate.productB.updatedAt).getTime();
        const keep = aTime >= bTime ? candidate.productA : candidate.productB;
        const merge = aTime >= bTime ? candidate.productB : candidate.productA;

        await mergeProducts(db, keep.id, merge.id);
        await loadCandidates();
        Alert.alert('已自动合并', `「${keep.name}」已保留，「${merge.name}」已合并`);
      } catch (e) {
        console.error('DuplicateScreen: 自动合并失败', e);
        Alert.alert('错误', '合并失败，请重试');
      }
    },
    [db, loadCandidates],
  );

  // 名称相似：弹窗确认
  const handleConfirmMerge = useCallback(
    async (candidate: MergeCandidate) => {
      setConfirmState({ candidate, keepChoice: 'A' });
    },
    [],
  );

  const doMerge = useCallback(async () => {
    if (!confirmState) return;

    try {
      const { candidate, keepChoice } = confirmState;
      const keep = keepChoice === 'A' ? candidate.productA : candidate.productB;
      const merge = keepChoice === 'A' ? candidate.productB : candidate.productA;

      await mergeProducts(db, keep.id, merge.id);
      setConfirmState(null);
      await loadCandidates();
    } catch (e) {
      console.error('DuplicateScreen: 合并失败', e);
      Alert.alert('错误', '合并失败，请重试');
    }
  }, [confirmState, db, loadCandidates]);

  const handleConfirmNotDuplicate = useCallback(
    async (candidate: MergeCandidate) => {
      // 持久化到 ignored_duplicates 表
      try {
        await markNotDuplicate(db, candidate.productA.id, candidate.productB.id);
        // 从列表中移除（仅在 DB 写入成功后）
        setCandidates((prev) =>
          prev.filter(
            (c) =>
              !(
                (c.productA.id === candidate.productA.id &&
                  c.productB.id === candidate.productB.id) ||
                (c.productA.id === candidate.productB.id &&
                  c.productB.id === candidate.productA.id)
              ),
          ),
        );
      } catch (e) {
        console.error('DuplicateScreen: 标记非重复失败', e);
      }
    },
    [db],
  );

  const barcodeCandidates = candidates.filter((c) => c.reason === 'barcode');
  const nameCandidates = candidates.filter((c) => c.reason === 'name_similarity');

  const renderBarcodeItem = ({ item }: { item: MergeCandidate }) => (
    <View style={styles.itemRow}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemTitle}>条码一致</Text>
        <Text style={styles.itemSubtitle}>
          「{item.productA.name}」与「{item.productB.name}」
        </Text>
      </View>
      <TouchableOpacity
        style={styles.autoMergeBtn}
        onPress={() => handleAutoMerge(item)}
        accessibilityLabel="自动合并重复商品"
        accessibilityRole="button"
      >
        <Text style={styles.autoMergeBtnText}>自动合并</Text>
      </TouchableOpacity>
    </View>
  );

  const renderNameItem = ({ item }: { item: MergeCandidate }) => (
    <View style={styles.itemRow}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemTitle}>
          名称相似 {(item.similarity! * 100).toFixed(0)}%
        </Text>
        <Text style={styles.itemSubtitle}>
          「{item.productA.name}」vs「{item.productB.name}」
        </Text>
      </View>
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.mergeBtn}
          onPress={() => handleConfirmMerge(item)}
          accessibilityLabel="合并商品"
          accessibilityRole="button"
        >
          <Text style={styles.mergeBtnText}>合并</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.notDupBtn}
          onPress={() => handleConfirmNotDuplicate(item)}
          accessibilityLabel="标记为非重复"
          accessibilityRole="button"
        >
          <Text style={styles.notDupBtnText}>非重复</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>检测中...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {candidates.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>未发现重复商品</Text>
        </View>
      ) : (
        <FlatList
          data={candidates}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) =>
            item.reason === 'barcode'
              ? renderBarcodeItem({ item })
              : renderNameItem({ item })
          }
          ListHeaderComponent={
            <>
              {barcodeCandidates.length > 0 && (
                <Text style={styles.sectionTitle}>
                  条码一致（{barcodeCandidates.length} 组）
                </Text>
              )}
              {nameCandidates.length > 0 && (
                <Text style={styles.sectionTitle}>
                  名称相似（{nameCandidates.length} 组）
                </Text>
              )}
            </>
          }
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* 合并确认弹窗 */}
      <Modal visible={!!confirmState} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.confirmSheet}>
            <Text style={styles.confirmTitle}>确认合并</Text>
            <Text style={styles.confirmText}>
              保留哪件商品的信息？
            </Text>
            <View style={styles.choiceRow}>
              <TouchableOpacity
                style={[
                  styles.choiceBtn,
                  confirmState?.keepChoice === 'A' && styles.choiceBtnActive,
                ]}
                onPress={() =>
                  setConfirmState((s) =>
                    s ? { ...s, keepChoice: 'A' } : null,
                  )
                }
              >
                <Text style={styles.choiceName}>
                  {confirmState?.candidate.productA.name}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.choiceBtn,
                  confirmState?.keepChoice === 'B' && styles.choiceBtnActive,
                ]}
                onPress={() =>
                  setConfirmState((s) =>
                    s ? { ...s, keepChoice: 'B' } : null,
                  )
                }
              >
                <Text style={styles.choiceName}>
                  {confirmState?.candidate.productB.name}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setConfirmState(null)}
                accessibilityLabel="取消合并"
                accessibilityRole="button"
              >
                <Text style={styles.cancelBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmMergeBtn}
                onPress={doMerge}
                accessibilityLabel="确认合并"
                accessibilityRole="button"
              >
                <Text style={styles.confirmMergeBtnText}>确认合并</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ==================== Styles ====================

function createStyles(colors: ReturnType<typeof useTheme>['theme']['colors'], scale: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg.primary },
    listContent: { padding: 12 },
    centerContainer: {
      flex: 1, justifyContent: 'center', alignItems: 'center',
    },
    loadingText: { fontSize: 16 * scale, color: colors.text.secondary },
    sectionTitle: {
      fontSize: 13 * scale, fontWeight: '600', color: colors.text.secondary,
      marginHorizontal: 4, marginTop: 8, marginBottom: 4,
      textTransform: 'uppercase',
    },
    itemRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: colors.bg.card, borderRadius: 10, padding: 14, marginBottom: 8,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
    },
    itemInfo: { flex: 1, marginRight: 12 },
    itemTitle: { fontSize: 14 * scale, fontWeight: '600', color: colors.text.primary },
    itemSubtitle: { fontSize: 13 * scale, color: colors.text.secondary, marginTop: 2 },
    actionRow: { flexDirection: 'row', gap: 8 },
    autoMergeBtn: {
      backgroundColor: colors.brand.success, borderRadius: 6,
      paddingHorizontal: 12, paddingVertical: 6,
    },
    autoMergeBtnText: { color: colors.text.inverse, fontSize: 13 * scale, fontWeight: '600' },
    mergeBtn: {
      backgroundColor: colors.brand.primary, borderRadius: 6,
      paddingHorizontal: 12, paddingVertical: 6,
    },
    mergeBtnText: { color: colors.text.inverse, fontSize: 13 * scale, fontWeight: '600' },
    notDupBtn: {
      backgroundColor: colors.bg.primary, borderRadius: 6,
      paddingHorizontal: 12, paddingVertical: 6,
    },
    notDupBtnText: { color: colors.text.secondary, fontSize: 13 * scale, fontWeight: '600' },
    emptyContainer: {
      flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32,
    },
    emptyText: { fontSize: 16 * scale, color: colors.text.hint },
    // 确认弹窗
    modalOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center', alignItems: 'center',
    },
    confirmSheet: {
      width: '85%', backgroundColor: colors.bg.card, borderRadius: 12, padding: 20,
    },
    confirmTitle: {
      fontSize: 17 * scale, fontWeight: '700', color: colors.text.primary, marginBottom: 8,
    },
    confirmText: {
      fontSize: 14 * scale, color: colors.text.secondary, marginBottom: 16,
    },
    choiceRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    choiceBtn: {
      flex: 1, padding: 12, borderRadius: 8,
      backgroundColor: colors.bg.primary, alignItems: 'center',
      borderWidth: 2, borderColor: 'transparent',
    },
    choiceBtnActive: {
      borderColor: colors.brand.primary, backgroundColor: colors.brand.primary + '20',
    },
    choiceName: { fontSize: 14 * scale, fontWeight: '600', color: colors.text.primary },
    confirmActions: { flexDirection: 'row', gap: 12 },
    cancelBtn: {
      flex: 1, paddingVertical: 10, borderRadius: 8,
      backgroundColor: colors.bg.primary, alignItems: 'center',
    },
    cancelBtnText: { fontSize: 14 * scale, color: colors.text.secondary, fontWeight: '600' },
    confirmMergeBtn: {
      flex: 1, paddingVertical: 10, borderRadius: 8,
      backgroundColor: colors.brand.primary, alignItems: 'center',
    },
    confirmMergeBtnText: { color: colors.text.inverse, fontSize: 14 * scale, fontWeight: '600' },
  });
}
