import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
  Keyboard,
} from 'react-native';
import { useStore } from '../context/store';
import { addProduct, updateProduct } from '../db/product';
import type { ProductEditScreenProps } from '../navigation/types';
import { CATEGORIES, IN_SHOP, OUT_OF_STOCK, TO_BE_PURCHASED } from '../db/types';
import type { ProductStatus } from '../db/types';
import { useTheme } from '../theme/ThemeContext';
import { aiParse, aiParseImage, type AiParseResult } from '../services/n1';
import { useSyncConfigStore } from '../store/syncConfig';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

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
    OUT_OF_STOCK: colors.text.tertiary,
    TO_BE_PURCHASED: colors.brand.warning,
  };
}

export function ProductEditScreen({ navigation, route }: ProductEditScreenProps) {
  const { theme } = useTheme();
  const { colors, scale } = theme;
  const statusColors = getStatusColors(colors);
  const { db } = useStore();
  const serverUrl = useSyncConfigStore((s) => s.serverUrl);
  const aiDisabled = !serverUrl;
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
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [status, setStatus] = useState<ProductStatus>(IN_SHOP);
  const [saving, setSaving] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);

  // AI 文字解析状态
  const [aiText, setAiText] = useState('');
  const [aiVisible, setAiVisible] = useState(false);
  const [aiTextLoading, setAiTextLoading] = useState(false);
  const [aiImageLoading, setAiImageLoading] = useState(false);

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
      setImageUri(product.imageUri ?? null);
    };
    load();
    return () => {
      cancelled = true;
      setAiText('');
      setAiVisible(false);
      setAiTextLoading(false);
      setAiImageLoading(false);
    };
  }, [existingId, db, route.params?.barcode]);

  // 选择图片
  const pickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length > 0) {
      setImageUri(result.assets[0].uri);
    }
  }, []);

  // 将 AI 解析结果写入表单状态（稳定函数，其他 handler 依赖它）
  const applyAiResult = useCallback((data: AiParseResult) => {
    if (data.name) setName(data.name);
    if (data.price) {
      const num = data.price.replace(/[^0-9.]/g, '');
      if (num) setPrice(num);
    }
    if (data.barcode) setBarcode(data.barcode);
    // spec 由 location + description 合并
    const specParts = [data.location, data.description].filter(Boolean);
    if (specParts.length > 0) setSpec(specParts.join(' - '));
    // category 匹配 CATEGORIES
    if (data.category) {
      const matched = CATEGORIES.find(
        (c) =>
          c === data.category ||
          c.includes(data.category!) ||
          data.category!.includes(c),
      );
      if (matched) setCategory(matched);
    }
  }, []);

  // AI 文字解析：将描述性文本回填到表单
  const handleAiParse = useCallback(async () => {
    const text = aiText.trim();
    if (!text) return;

    const serverUrl = useSyncConfigStore.getState().serverUrl;
    if (!serverUrl) {
      Alert.alert('提示', '请先在设置中配置 N1 服务器地址');
      return;
    }

    setAiTextLoading(true);
    try {
      const result = await aiParse(serverUrl, text);
      if (result.error || !result.data) {
        Alert.alert(
          'AI 解析失败',
          result.error || '未能识别出商品信息，请重试或手动填写',
        );
        return;
      }

      const data = result.data;
      // 预览识别结果
      const preview = [
        data.name && `名称：${data.name}`,
        data.price && `价格：${data.price}`,
        data.category && `分类：${data.category}`,
        data.location && `位置：${data.location}`,
        data.description && `描述：${data.description}`,
      ].filter(Boolean).join('\n');

      Alert.alert(
        'AI 识别结果',
        preview || '未识别到关键信息',
        [
          { text: '取消', style: 'cancel' },
          {
            text: '填入表单',
            onPress: () => applyAiResult(data),
          },
        ],
      );
    } catch (e) {
      console.error('ProductEditScreen: AI 文字解析失败', e);
      Alert.alert('网络错误', 'AI 服务暂不可用，请手动填写');
    } finally {
      setAiTextLoading(false);
    }
  }, [aiText, applyAiResult, serverUrl]);

  // AI 图片识别
  const handleAiImageParse = useCallback(async () => {
    if (!imageUri) return;

    const serverUrl = useSyncConfigStore.getState().serverUrl;
    if (!serverUrl) {
      Alert.alert('提示', '请先在设置中配置 N1 服务器地址');
      return;
    }

    setAiImageLoading(true);
    try {
      // 读取图片文件为 base64
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // 构造 Data URL
      const ext = imageUri.split('.').pop()?.toLowerCase() || 'jpeg';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      const imageDataUrl = `data:${mimeType};base64,${base64}`;

      const result = await aiParseImage(serverUrl, imageDataUrl);
      if (result.error || !result.data) {
        Alert.alert(
          'AI 图片识别失败',
          result.error || '无法识别图片中的商品信息',
        );
        return;
      }

      const data = result.data;
      const preview = [
        data.name && `名称：${data.name}`,
        data.price && `价格：${data.price}`,
        data.category && `分类：${data.category}`,
        data.barcode && `条码：${data.barcode}`,
      ].filter(Boolean).join('\n');

      Alert.alert(
        'AI 图片识别结果',
        preview || '未识别到关键信息',
        [
          { text: '取消', style: 'cancel' },
          {
            text: '填入表单',
            onPress: () => applyAiResult(data),
          },
        ],
      );
    } catch (e) {
      console.error('ProductEditScreen: AI 图片识别失败', e);
      Alert.alert('网络错误', 'AI 服务暂不可用，请手动填写');
    } finally {
      setAiImageLoading(false);
    }
  }, [imageUri, applyAiResult, serverUrl]);

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
        imageUri: imageUri || undefined,
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
  }, [name, price, spec, imageUri, barcode, aliases, category, status, existingId, db, navigation]);

  const isEdit = Boolean(existingId);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* AI 文字解析 */}
      {aiDisabled ? (
        <View style={[styles.aiToggle, { borderColor: colors.border.strong }]}>
          <Text style={[styles.aiToggleText, { color: colors.text.tertiary }]}>
            请先在设置中配置 N1 服务器地址
          </Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.aiToggle, { borderColor: colors.border.strong }]}
          onPress={() => setAiVisible(!aiVisible)}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={[styles.aiToggleText, { color: colors.text.primary }]}>
            尝试用 AI 快速录入
          </Text>
          <Text style={[styles.aiToggleArrow, { color: colors.text.tertiary }]}>
            {aiVisible ? '收起 ▲' : '展开 ▲'}
          </Text>
        </TouchableOpacity>
      )}

      {aiVisible && (
        <View
          style={[
            styles.aiInputContainer,
            { backgroundColor: colors.surface.s1, borderColor: colors.border.subtle },
          ]}
        >
          <TextInput
            style={[styles.aiInput, { color: colors.text.primary, backgroundColor: colors.input }]}
            placeholder="描述这个商品，AI 帮你填写（如：黑色蓝牙耳机 299元 蓝牙 降噪 第五代）"
            placeholderTextColor={colors.text.tertiary}
            value={aiText}
            onChangeText={setAiText}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={[
              styles.aiSubmit,
              { backgroundColor: colors.brand.primary },
            ]}
            onPress={handleAiParse}
            disabled={aiTextLoading || !aiText.trim()}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={[styles.aiSubmitText, { color: colors.text.inverse }]}>
              {aiTextLoading ? '解析中...' : 'AI 解析'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 名称（必填） */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>
          商品名称 <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          ref={nameRef}
          style={styles.input}
          placeholder="例如：百事可乐"
          placeholderTextColor={colors.text.tertiary}
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
          placeholderTextColor={colors.text.tertiary}
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
          placeholderTextColor={colors.text.tertiary}
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
          placeholderTextColor={colors.text.tertiary}
          value={spec}
          onChangeText={setSpec}
          returnKeyType="next"
          accessibilityLabel="规格"
        />
      </View>

      {/* 图片 */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>图片（点击更换）</Text>
        <TouchableOpacity
          style={styles.imagePicker}
          onPress={pickImage}
          accessibilityLabel="选择商品图片"
          accessibilityRole="button"
        >
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.imagePreview} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.imagePlaceholderText}>点击选择图片</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* AI 图片识别按钮 */}
        {imageUri && (
          <TouchableOpacity
            style={[styles.aiImageBtn, { borderColor: colors.border.strong }]}
            onPress={handleAiImageParse}
            disabled={aiImageLoading}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={[styles.aiImageBtnText, { color: colors.brand.primary }]}>
              {aiImageLoading ? 'AI 识别中...' : 'AI 识别此图片'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 条码 */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>条码</Text>
        <TextInput
          style={styles.input}
          placeholder="扫描或手动输入"
          placeholderTextColor={colors.text.tertiary}
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
      backgroundColor: colors.surface.s0,
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
      backgroundColor: colors.surface.s1,
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: 8 * scale,
      paddingHorizontal: 12 * scale,
      paddingVertical: 10 * scale,
      fontSize: 15 * scale,
      color: colors.text.primary,
    },
    imagePicker: {
      borderRadius: 8 * scale,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    imagePreview: {
      width: '100%',
      aspectRatio: 1,
      resizeMode: 'cover',
    },
    imagePlaceholder: {
      width: '100%',
      aspectRatio: 1,
      backgroundColor: colors.surface.s1,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border.default,
      borderStyle: 'dashed',
      borderRadius: 8 * scale,
    },
    imagePlaceholderText: {
      fontSize: 14 * scale,
      color: colors.text.tertiary,
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
      backgroundColor: colors.surface.s1,
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
      backgroundColor: colors.surface.s1,
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
    // AI 文字解析样式
    aiToggle: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10 * scale,
      paddingHorizontal: 14 * scale,
      borderRadius: 8,
      borderWidth: 1,
      marginBottom: 16 * scale,
    },
    aiToggleText: {
      fontSize: 14 * scale,
      flex: 1,
    },
    aiToggleArrow: {
      fontSize: 12 * scale,
    },
    aiInputContainer: {
      borderWidth: 1,
      borderRadius: 8,
      padding: 12 * scale,
      marginBottom: 16 * scale,
    },
    aiInput: {
      borderRadius: 6,
      padding: 10 * scale,
      fontSize: 14 * scale,
      minHeight: 80 * scale,
      marginBottom: 10 * scale,
    },
    aiSubmit: {
      borderRadius: 6,
      paddingVertical: 10 * scale,
      paddingHorizontal: 20 * scale,
      alignItems: 'center',
      alignSelf: 'flex-end',
    },
    aiSubmitText: {
      fontSize: 14 * scale,
      fontWeight: '600',
    },
    // AI 图片识别样式
    aiImageBtn: {
      borderWidth: 1,
      borderRadius: 6,
      paddingVertical: 8 * scale,
      paddingHorizontal: 14 * scale,
      alignSelf: 'flex-start',
      marginTop: 8 * scale,
    },
    aiImageBtnText: {
      fontSize: 13 * scale,
      fontWeight: '500',
    },
  });
}
