/**
 * 散装标签管理 Screen
 *
 * 管理模式中管理 loose_goods_labels 表：新增/删除/拖拽排序标签。
 * 仅在 isManagement 模式下可访问。
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  StyleSheet,
  Alert,
  Keyboard,
} from 'react-native';
import { useStore } from '../context/store';
import { useModeStore } from '../store/mode';
import { getAllLabels, addLabel, updateLabel, deleteLabel, reorderLabels } from '../db/looseGoods';
import { useTheme } from '../theme/ThemeContext';
import type { LooseGoodsManageScreenProps } from '../navigation/types';
import type { LooseGoodsLabel } from '../db/types';

export function LooseGoodsManageScreen({ navigation }: LooseGoodsManageScreenProps) {
  const { db } = useStore();
  const { theme } = useTheme();
  const { colors, scale } = theme;
  const styles = useMemo(() => createStyles(colors, scale), [colors, scale]);

  const [labels, setLabels] = useState<LooseGoodsLabel[]>([]);
  const [newLabelText, setNewLabelText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // 加载标签列表
  const loadLabels = useCallback(async () => {
    const all = await getAllLabels(db);
    setLabels(all);
  }, [db]);

  useEffect(() => {
    loadLabels();
  }, [loadLabels]);

  // 新增标签
  const handleAdd = useCallback(async () => {
    const trimmed = newLabelText.trim();
    if (!trimmed) return;

    try {
      await addLabel(db, trimmed);
      setNewLabelText('');
      Keyboard.dismiss();
      await loadLabels();
    } catch (e) {
      Alert.alert('添加失败', String(e));
    }
  }, [newLabelText, db, loadLabels]);

  // 删除标签
  const handleDelete = useCallback(
    async (label: LooseGoodsLabel) => {
      Alert.alert(
        '确认删除',
        `删除标签「${label.label}」？`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '删除',
            style: 'destructive',
            onPress: async () => {
              await deleteLabel(db, label.id);
              await loadLabels();
            },
          },
        ],
      );
    },
    [db, loadLabels],
  );

  // 开始编辑
  const startEdit = useCallback((label: LooseGoodsLabel) => {
    setEditingId(label.id);
    setEditText(label.label);
  }, []);

  // 保存编辑
  const saveEdit = useCallback(async () => {
    if (!editingId) return;
    const trimmed = editText.trim();
    if (!trimmed) {
      setEditingId(null);
      setEditText('');
      return;
    }

    try {
      await updateLabel(db, editingId, { label: trimmed });
      setEditingId(null);
      setEditText('');
      await loadLabels();
    } catch (e) {
      Alert.alert('保存失败', String(e));
    }
  }, [editingId, editText, db, loadLabels]);

  // 拖拽排序：简单实现为上下移动按钮
  const moveUp = useCallback(
    async (index: number) => {
      if (index <= 0) return;
      const ordered = [...labels];
      [ordered[index - 1], ordered[index]] = [ordered[index], ordered[index - 1]];
      await reorderLabels(db, ordered.map((l) => l.id));
      await loadLabels();
    },
    [labels, db, loadLabels],
  );

  const moveDown = useCallback(
    async (index: number) => {
      if (index >= labels.length - 1) return;
      const ordered = [...labels];
      [ordered[index], ordered[index + 1]] = [ordered[index + 1], ordered[index]];
      await reorderLabels(db, ordered.map((l) => l.id));
      await loadLabels();
    },
    [labels, db, loadLabels],
  );

  // 渲染标签项
  const renderItem = ({ item, index }: { item: LooseGoodsLabel; index: number }) => {
    const isEditing = editingId === item.id;

    return (
      <View style={styles.itemRow}>
        <View style={styles.dragButtons}>
          <TouchableOpacity
            style={[styles.dragBtn, index === 0 && styles.dragBtnDisabled]}
            onPress={() => moveUp(index)}
            disabled={index === 0}
            accessibilityLabel="标签上移"
            accessibilityRole="button"
          >
            <Text style={styles.dragBtnText}>↑</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dragBtn, index === labels.length - 1 && styles.dragBtnDisabled]}
            onPress={() => moveDown(index)}
            disabled={index === labels.length - 1}
            accessibilityLabel="标签下移"
            accessibilityRole="button"
          >
            <Text style={styles.dragBtnText}>↓</Text>
          </TouchableOpacity>
        </View>

        {isEditing ? (
          <TextInput
            style={styles.editInput}
            value={editText}
            onChangeText={setEditText}
            autoFocus
            onSubmitEditing={saveEdit}
            onBlur={saveEdit}
          />
        ) : (
          <Text style={styles.labelText}>{item.label}</Text>
        )}

        <View style={styles.itemActions}>
          {isEditing ? (
            <TouchableOpacity style={styles.actionBtn} onPress={saveEdit} accessibilityLabel="保存编辑">
              <Text style={styles.actionBtnText}>保存</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.actionBtn} onPress={() => startEdit(item)} accessibilityLabel="编辑标签">
              <Text style={styles.actionBtnText}>编辑</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnDanger]}
            onPress={() => handleDelete(item)}
            accessibilityLabel="删除标签"
            accessibilityRole="button"
          >
            <Text style={[styles.actionBtnText, styles.actionBtnDangerText]}>删除</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* 新增标签 */}
      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          placeholder="输入新标签名称"
          placeholderTextColor={colors.text.hint}
          value={newLabelText}
          onChangeText={setNewLabelText}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
          accessibilityLabel="新标签名称"
        />
        <TouchableOpacity
          style={[styles.addBtn, !newLabelText.trim() && styles.addBtnDisabled]}
          onPress={handleAdd}
          disabled={!newLabelText.trim()}
          accessibilityLabel="添加标签"
          accessibilityRole="button"
        >
          <Text style={styles.addBtnText}>+ 添加</Text>
        </TouchableOpacity>
      </View>

      {/* 标签列表 */}
      {labels.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>暂无散装标签</Text>
          <Text style={styles.emptyHint}>在上方输入添加常用标签</Text>
        </View>
      ) : (
        <FlatList
          data={labels}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

// ==================== 样式 ====================

function createStyles(colors: ReturnType<typeof useTheme>['theme']['colors'], scale: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg.primary },

    addRow: {
      flexDirection: 'row', alignItems: 'center',
      marginHorizontal: 12, marginTop: 12, marginBottom: 8,
      gap: 8,
    },
    addInput: {
      flex: 1,
      backgroundColor: colors.bg.card,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15 * scale,
      color: colors.text.primary,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    addBtn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: colors.brand.primary,
      borderRadius: 8,
      alignItems: 'center',
    },
    addBtnDisabled: { opacity: 0.5 },
    addBtnText: { fontSize: 14 * scale, color: colors.text.inverse, fontWeight: '600' },

    listContent: { paddingHorizontal: 12, paddingBottom: 16 },

    itemRow: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.bg.card,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 12,
      marginBottom: 8,
    },
    dragButtons: { flexDirection: 'row', gap: 4, marginRight: 8 },
    dragBtn: {
      width: 28, height: 28, borderRadius: 6,
      backgroundColor: colors.bg.primary,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: colors.border.default,
    },
    dragBtnDisabled: { opacity: 0.3 },
    dragBtnText: { fontSize: 14 * scale, color: colors.text.secondary, fontWeight: '600' },
    labelText: { flex: 1, fontSize: 15 * scale, color: colors.text.primary },
    editInput: {
      flex: 1,
      backgroundColor: colors.bg.primary,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      fontSize: 15 * scale,
      color: colors.text.primary,
      borderWidth: 1,
      borderColor: colors.brand.primary,
    },
    itemActions: { flexDirection: 'row', gap: 6, marginLeft: 8 },
    actionBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    actionBtnText: { fontSize: 13 * scale, color: colors.text.secondary },
    actionBtnDanger: {
      backgroundColor: colors.brand.danger + '15',
      borderColor: colors.brand.danger + '40',
    },
    actionBtnDangerText: { color: colors.brand.danger },

    emptyContainer: {
      flex: 1,
      alignItems: 'center', justifyContent: 'center',
      paddingTop: 80,
    },
    emptyText: { fontSize: 16 * scale, color: colors.text.secondary },
    emptyHint: { fontSize: 13 * scale, color: colors.text.hint, marginTop: 8 },
  });
}
