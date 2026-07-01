/**
 * AI 识别结果确认卡片
 *
 * 展示 AI 识别的商品信息，提供 [加购] / [忽略] 操作。
 * 60 秒过期后变灰显示（视觉提示，不阻断交互）。
 *
 * spec-v4.5 §7.4：草稿卡 60 秒过期变灰，仍可点击确认。
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useTheme, type ThemeColors } from '../theme/ThemeContext';
import type { Product } from '../db/types';

// ==================== 类型 ====================

export interface ProductConfirmCardProps {
  /** 商品信息 */
  product: Product;
  /** 识别数量 */
  quantity: number;
  /** 置信度 (0-1) */
  confidence: number;
  /** 是否已过期（60s） */
  expired: boolean;
  /** 加购回调 */
  onAddToCart: (product: Product, quantity: number) => void;
  /** 忽略回调 */
  onIgnore: () => void;
}

// ==================== 置信度颜色 ====================

const CONFIDENCE_COLORS = {
  high: '#16A34A',
  mid: '#F59E0B',
  low: '#EF4444',
};

// ==================== 辅助函数 ====================

function getConfidenceMeta(confidence: number): { color: string; bg: string; label: string } {
  if (confidence >= 0.8) {
    return { color: CONFIDENCE_COLORS.high, bg: '#DCFCE7', label: '高置信度' };
  }
  if (confidence >= 0.5) {
    return { color: CONFIDENCE_COLORS.mid, bg: '#FEF3C7', label: '中置信度' };
  }
  return { color: CONFIDENCE_COLORS.low, bg: '#FEE2E2', label: '低置信度' };
}

// ==================== 组件 ====================

export function ProductConfirmCard({
  product,
  quantity,
  confidence,
  expired,
  onAddToCart,
  onIgnore,
}: ProductConfirmCardProps): JSX.Element {
  const { theme } = useTheme();
  const { colors, scale } = theme;
  const confidenceMeta = getConfidenceMeta(confidence);
  const displayName = quantity > 1 ? `${product.name} ×${quantity}` : product.name;

  const styles = useMemo(() => createStyles(colors, scale), [colors, scale]);

  return (
    <View
      style={[
        styles.card,
        expired ? styles.cardExpired : styles.cardNormal,
      ]}
      accessible
    >
      {/* 商品信息区 */}
      <View style={styles.infoRow}>
        {/* 缩略图 */}
        {product.imageUri ? (
          <View style={styles.thumbnailWrapper}>
            <Image source={{ uri: product.imageUri }} style={styles.thumbnail} accessible accessibilityLabel="商品图片" />
          </View>
        ) : (
          <View style={styles.thumbnailPlaceholder} accessible accessibilityLabel="商品占位图">
            <Text style={styles.thumbnailPlaceholderText}>📦</Text>
          </View>
        )}
        <View style={styles.infoText}>
          <Text style={[styles.name, expired && styles.nameExpired]} numberOfLines={1}>
            {displayName}
          </Text>
          {product.spec ? (
            <Text style={[styles.spec, expired && styles.specExpired]} numberOfLines={1}>
              {product.spec}
            </Text>
          ) : null}
          <Text style={[styles.price, expired && styles.priceExpired]}>
            ¥{product.price.toFixed(2)}
          </Text>
        </View>
        {/* 置信度标签 */}
        <View style={[styles.confidenceBadge, { backgroundColor: confidenceMeta.bg }]}>
          <Text style={[styles.confidenceText, { color: confidenceMeta.color }]}>
            {confidenceMeta.label}
          </Text>
        </View>
      </View>

      {/* 过期提示 */}
      {expired && (
        <Text style={styles.expiredHint}>已超时，请确认后再操作</Text>
      )}

      {/* 操作按钮 */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => onAddToCart(product, quantity)}
          accessibilityLabel={`加购${quantity > 1 ? quantity + '个' : ''}${product.name}`}
          accessibilityRole="button"
        >
          <Text style={styles.addBtnText}>加购</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.ignoreBtn}
          onPress={onIgnore}
          accessibilityLabel="忽略此商品"
          accessibilityRole="button"
        >
          <Text style={styles.ignoreBtnText}>忽略</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ==================== 样式 ====================

function createStyles(colors: ThemeColors, scale: number) {
  return StyleSheet.create({
    // 卡片容器
    card: {
      borderRadius: 10 * scale,
      padding: 14 * scale,
      marginVertical: 6 * scale,
    },
    cardNormal: {
      backgroundColor: colors.surface.s1,
      borderWidth: 2,
      borderColor: colors.brand.primary,
    },
    cardExpired: {
      backgroundColor: colors.surface.s0,
      borderWidth: 2,
      borderColor: colors.text.tertiary,
      opacity: 0.5,
    },
    // 商品信息行
    infoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 10 * scale,
    },
    thumbnailWrapper: {
      width: 48,
      height: 48,
      borderRadius: 24,
      overflow: 'hidden',
      marginRight: 10,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    thumbnail: {
      width: 48,
      height: 48,
    },
    thumbnailPlaceholder: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.surface.s0,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    thumbnailPlaceholderText: {
      fontSize: 20 * scale,
    },
    infoText: {
      flex: 1,
      marginRight: 10,
    },
    name: {
      fontSize: 15 * scale,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 2,
    },
    nameExpired: {
      color: colors.text.secondary,
    },
    spec: {
      fontSize: 13 * scale,
      color: colors.text.secondary,
      marginBottom: 4,
    },
    specExpired: {
      color: colors.text.secondary,
    },
    price: {
      fontSize: 16 * scale,
      fontWeight: '700',
      color: colors.brand.danger,
    },
    priceExpired: {
      color: colors.text.secondary,
    },
    // 置信度标签
    confidenceBadge: {
      paddingHorizontal: 8 * scale,
      paddingVertical: 4 * scale,
      borderRadius: 6 * scale,
    },
    confidenceText: {
      fontSize: 12 * scale,
      fontWeight: '600',
    },
    // 过期提示
    expiredHint: {
      fontSize: 11 * scale,
      color: CONFIDENCE_COLORS.mid,
      marginBottom: 8 * scale,
    },
    // 按钮行
    buttonRow: {
      flexDirection: 'row',
      gap: 10 * scale,
    },
    addBtn: {
      flex: 1,
      backgroundColor: colors.brand.primary,
      borderRadius: 8 * scale,
      paddingVertical: 10 * scale,
      alignItems: 'center',
    },
    addBtnText: {
      fontSize: 14 * scale,
      fontWeight: '600',
      color: colors.text.inverse,
    },
    ignoreBtn: {
      flex: 1,
      paddingVertical: 10 * scale,
      alignItems: 'center',
    },
    ignoreBtnText: {
      fontSize: 14 * scale,
      fontWeight: '600',
      color: colors.text.tertiary,
    },
  });
}
