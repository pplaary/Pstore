import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Keyboard,
} from 'react-native';
import { useStore } from '../context/store';
import { addProduct, updateProduct } from '../db/product';
import type { ProductEditScreenProps } from '../navigation/types';
import { CATEGORIES, IN_SHOP, OUT_OF_STOCK, TO_BE_PURCHASED } from '../db/types';
import type { ProductStatus } from '../db/types';
import { useTheme } from '../theme/ThemeContext';

// 状态选项
const STATUS_OPTIONS: { value: ProductStatus; label: string }[] = [
  { value: IN_SHOP, label: '在售' },
  { value: OUT_OF_STOCK, label: '缺货' },
  { value: TO_BE_PURCHASED, label: '待采' },
];

// 状态色标（用于选中态）
function getStatusColors(colors: ReturnType<typeof useTheme>['theme']['colors']): Record<string, string> {
  return {
    IN_SHOP: colors.brand.success,
    OUT_OF_STOCK: colors.brand.danger,
    TO_BE_PURCHASED: colors.brand.warning,
  };
}

export function ProductEditScreen({ navigation, route }: ProductEditScreenProps) {
  const { theme } = useTheme();
  const { colors, scale } = theme;
  const statusColors = getStatusColors(colors);
  const { db } = useStore();
  const existingId = route.params?.id;
  const nameRef = useRef<TextInput>(null);
  const priceRef = useRef<TextInput>(null);

  const styles = useMemo(() => createStyles(colors, scale), [colors, scale]);

  // 表单状态
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [spec, setSpec] = useState('');
  const [barcode, setBarcode] = useState('');
  const [aliases, setAliases] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [status, setStatus] = useState<ProductStatus>(IN_SHOP);
  const [saving, setSaving] = useState(false);

  // 编辑模式：加载现有商品
  // 新增模式且从扫码/识别页来：预填 barcode / name / spec
  useEffect(() => {
    if (!existingId) {
      const fromBarcode = route.params?.barcode;
      const fromName = route.params?.name;
      const fromSpec = route.params?.spec;
      if (fromBarcode) {
        setBarcode(fromBarcode);
      }
      if (fromName) {
        setName(fromName);
      }
      if (fromSpec) {
        setSpec(fromSpec);
      }
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { getProductById } = await import('../db/product');
      const product = await getProductById(db, existingId);
      if (cancelled || !product) return;
      setName(product.name);
      setPrice(String(product.price));
      setSpec(product.spec ?? '');
      setBarcode(product.barcode ?? '');
      setAliases(product.aliases ?? '');
      setCategory((product.category as string) ?? CATEGORIES[0]);
      setStatus(product.status);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [existingId, db, route.params?.barcode]);

  // 保存
  const handleSave = useCallback(async () => {
    // 校验：名称非空
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('验证失败', '商品名称不能为空');
      return;
    }
    // 校验：价格 > 0
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      Alert.alert('验证失败', '价格必须大于 0');
      return;
    }

    setSaving(true);
    try {
      const data = {
        name: trimmedName,
        price: priceNum,
        spec: spec.trim() || undefined,
        barcode: barcode.trim() || undefined,
        aliases: aliases.trim() || undefined,
        category,
        status,
      };

      if (existingId) {
        await updateProduct(db, existingId, data);
      } else {
        await addProduct(db, data);
      }
      navigation.goBack();
    } catch (e) {
      console.error('ProductEditScreen: 保存失败', e);
      Alert.alert('保存失败', e instanceof Error ? e.message : '未知错误');
    } finally {
      setSaving(false);
    }
  }, [name, price, spec, barcode, aliases, category, status, existingId, db, navigation]);

  const isEdit = Boolean(existingId);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 名称（必填） */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>
          商品名称 <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          ref={nameRef}
          style={styles.input}
          placeholder="例如：百事可乐"
          placeholderTextColor={colors.text.hint}
          value={name}
          onChangeText={setName}
          autoFocus={!isEdit}
          returnKeyType="next"
          onSubmitEditing={() => {
            priceRef.current?.focus();
          }}
          accessibilityLabel="商品名称"
        />
      </View>

      {/* 别名 */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>别名</Text>
        <TextInput
          style={styles.input}
          placeholder="逗号分隔多个别名，如：百事,可乐"
          placeholderTextColor={colors.text.hint}
          value={aliases}
          onChangeText={setAliases}
          returnKeyType="next"
          accessibilityLabel="别名"
        />
      </View>

      {/* 价格（必填） */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>
          价格 (¥) <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          ref={priceRef}
          style={styles.input}
          placeholder="0.00"
          placeholderTextColor={colors.text.hint}
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          returnKeyType="next"
          accessibilityLabel="价格"
        />
      </View>

      {/* 规格 */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>规格</Text>
        <TextInput
          style={styles.input}
          placeholder="例如：500ml"
          placeholderTextColor={colors.text.hint}
          value={spec}
          onChangeText={setSpec}
          returnKeyType="next"
          accessibilityLabel="规格"
        />
      </View>

      {/* 条码 */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>条码</Text>
        <TextInput
          style={styles.input}
          placeholder="扫描或手动输入"
          placeholderTextColor={colors.text.hint}
          value={barcode}
          onChangeText={setBarcode}
          returnKeyType="next"
          autoCapitalize="none"
          accessibilityLabel="条码"
        />
      </View>

      {/* 分类 */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>分类</Text>
        <View style={styles.categoryRow}>
          {CATEGORIES.map((cat) => {
            const active = category === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => setCategory(cat)}
                accessibilityLabel={`分类：${cat}${active ? '，已选中' : ''}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
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
        </View>
      </View>

      {/* 状态 */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>状态</Text>
        <View style={styles.statusRow}>
          {STATUS_OPTIONS.map((opt) => {
            const active = status === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.statusChip,
                  active && {
                    backgroundColor: statusColors[opt.value],
                    borderColor: statusColors[opt.value],
                  },
                ]}
                onPress={() => setStatus(opt.value)}
                accessibilityLabel={`状态：${opt.label}${active ? '，已选中' : ''}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    active && styles.statusChipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 保存按钮 */}
      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
        accessibilityLabel={saving ? '保存中' : '保存商品'}
        accessibilityRole="button"
        accessibilityState={{ busy: saving }}
      >
        <Text style={styles.saveButtonText}>{saving ? '保存中...' : '保存'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['theme']['colors'], scale: number) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg.primary,
    },
    content: {
      padding: 16 * scale,
      paddingBottom: 32 * scale,
    },
    field: {
      marginBottom: 16 * scale,
    },
    fieldLabel: {
      fontSize: 14 * scale,
      fontWeight: '600',
      color: colors.text.secondary,
      marginBottom: 6 * scale,
    },
    required: {
      color: colors.brand.danger,
    },
    input: {
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: 8 * scale,
      paddingHorizontal: 12 * scale,
      paddingVertical: 10 * scale,
      fontSize: 15 * scale,
      color: colors.text.primary,
    },
    categoryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6 * scale,
    },
    categoryChip: {
      paddingHorizontal: 10 * scale,
      paddingVertical: 5 * scale,
      borderRadius: 14 * scale,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    categoryChipActive: {
      backgroundColor: colors.brand.primary,
      borderColor: colors.brand.primary,
    },
    categoryChipText: {
      fontSize: 12 * scale,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    categoryChipTextActive: {
      color: colors.text.inverse,
    },
    statusRow: {
      flexDirection: 'row',
      gap: 8 * scale,
    },
    statusChip: {
      flex: 1,
      paddingVertical: 10 * scale,
      borderRadius: 8 * scale,
      backgroundColor: colors.bg.card,
      borderWidth: 1,
      borderColor: colors.border.default,
      alignItems: 'center',
    },
    statusChipText: {
      fontSize: 13 * scale,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    statusChipTextActive: {
      color: colors.text.inverse,
    },
    saveButton: {
      backgroundColor: colors.brand.primary,
      borderRadius: 10 * scale,
      paddingVertical: 14 * scale,
      alignItems: 'center',
      marginTop: 8 * scale,
    },
    saveButtonDisabled: {
      opacity: 0.6,
    },
    saveButtonText: {
      fontSize: 16 * scale,
      fontWeight: '600',
      color: colors.text.inverse,
    },
  });
}
