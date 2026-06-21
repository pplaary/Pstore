import React, { useState, useCallback, useEffect, useRef } from 'react';
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

// 状态选项
const STATUS_OPTIONS: { value: ProductStatus; label: string }[] = [
  { value: IN_SHOP, label: '在售' },
  { value: OUT_OF_STOCK, label: '缺货' },
  { value: TO_BE_PURCHASED, label: '待采' },
];

// 状态色标（用于选中态）
const STATUS_COLORS: Record<string, string> = {
  IN_SHOP: '#16A34A',
  OUT_OF_STOCK: '#DC2626',
  TO_BE_PURCHASED: '#EA580C',
};

export function ProductEditScreen({ navigation, route }: ProductEditScreenProps) {
  const { db } = useStore();
  const existingId = route.params?.id;
  const nameRef = useRef<TextInput>(null);
  const priceRef = useRef<TextInput>(null);

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
  // 新增模式且从扫码页来：预填 barcode
  useEffect(() => {
    if (!existingId) {
      const fromBarcode = route.params?.barcode;
      if (fromBarcode) {
        setBarcode(fromBarcode);
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
          placeholderTextColor="#94A3B8"
          value={name}
          onChangeText={setName}
          autoFocus={!isEdit}
          returnKeyType="next"
          onSubmitEditing={() => {
            priceRef.current?.focus();
          }}
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
          placeholderTextColor="#94A3B8"
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          returnKeyType="next"
        />
      </View>

      {/* 规格 */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>规格</Text>
        <TextInput
          style={styles.input}
          placeholder="例如：500ml"
          placeholderTextColor="#94A3B8"
          value={spec}
          onChangeText={setSpec}
          returnKeyType="next"
        />
      </View>

      {/* 条码 */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>条码</Text>
        <TextInput
          style={styles.input}
          placeholder="扫描或手动输入"
          placeholderTextColor="#94A3B8"
          value={barcode}
          onChangeText={setBarcode}
          returnKeyType="next"
          autoCapitalize="none"
        />
      </View>

      {/* 别名 */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>别名</Text>
        <TextInput
          style={styles.input}
          placeholder="逗号分隔多个别名，如：百事,可乐"
          placeholderTextColor="#94A3B8"
          value={aliases}
          onChangeText={setAliases}
          returnKeyType="next"
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
                    backgroundColor: STATUS_COLORS[opt.value],
                    borderColor: STATUS_COLORS[opt.value],
                  },
                ]}
                onPress={() => setStatus(opt.value)}
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
      >
        <Text style={styles.saveButtonText}>{saving ? '保存中...' : '保存'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  field: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  required: {
    color: '#DC2626',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1E293B',
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  categoryChipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  statusChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  statusChipTextActive: {
    color: '#FFFFFF',
  },
  saveButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
