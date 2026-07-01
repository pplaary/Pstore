/**
 * AI 识别结果确认卡片 — 设计稿对齐
 *
 * 布局：图片左 | 商品信息右
 *       底部：数量控件 [- 1 +]  |  [忽略] [加购]
 *
 * 60 秒过期后变灰显示（视觉提示，不阻断交互）。
 */

import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

// ==================== 组件 ====================

export function ProductConfirmCard({
  product,
  quantity: initialQty,
  confidence,
  expired,
  onAddToCart,
  onIgnore,
}: ProductConfirmCardProps): JSX.Element {
  const { theme } = useTheme();
  const { colors, scale } = theme;
  const [qty, setQty] = useState(initialQty);

  const styles = useMemo(() => createStyles(colors, scale), [colors, scale]);

  return (
    <View
      style={[styles.card, expired && styles.cardExpired]}
      accessible
    >
      {/* 商品信息行：图片 + 信息 */}
      <View style={styles.infoRow}>
        {/* 商品图片 */}
        {product.imageUri ? (
          <View style={styles.imageWrap}>
            <Image source={{ uri: product.imageUri }} style={styles.image} />
          </View>
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="cube-outline" size={28 * scale} color={colors.text.tertiary} />
          </View>
        )}

        {/* 商品信息 */}
        <View style={styles.infoText}>
          <Text style={styles.name} numberOfLines={1}>{product.name}</Text>
          {product.spec ? (
            <Text style={styles.spec} numberOfLines={1}>{product.spec}</Text>
          ) : null}
          <Text style={styles.price}>¥{product.price.toFixed(2)}</Text>
        </View>
      </View>

      {/* 底部操作行：数量控件 + 操作按钮 */}
      <View style={styles.actionRow}>
        {/* 数量控件 */}
        <View style={styles.qtyControl}>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => setQty(Math.max(1, qty - 1))}
            disabled={qty <= 1}
            accessibilityLabel="减少数量"
            accessibilityRole="button"
          >
            <Ionicons name="remove" size={16 * scale} color={qty <= 1 ? colors.text.tertiary : colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.qtyText}>{qty}</Text>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => setQty(qty + 1)}
            accessibilityLabel="增加数量"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={16 * scale} color={colors.text.primary} />
          </TouchableOpacity>
        </View>

        {/* 操作按钮 */}
        <View style={styles.btnGroup}>
          <TouchableOpacity
            style={styles.ignoreBtn}
            onPress={onIgnore}
            accessibilityLabel="忽略此商品"
            accessibilityRole="button"
          >
            <Text style={styles.ignoreBtnText}>忽略</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => onAddToCart(product, qty)}
            accessibilityLabel={`加购${qty > 1 ? qty + '个' : ''}${product.name}`}
            accessibilityRole="button"
          >
            <Text style={styles.addBtnText}>加购</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ==================== 样式 ====================

function createStyles(colors: ThemeColors, scale: number) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface.s1,
      borderRadius: 12 * scale,
      padding: 14 * scale,
      marginHorizontal: 16 * scale,
      marginVertical: 6 * scale,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    cardExpired: {
      opacity: 0.4,
    },

    // 商品信息行
    infoRow: {
      flexDirection: 'row',
      marginBottom: 12 * scale,
    },
    imageWrap: {
      width: 72 * scale,
      height: 72 * scale,
      borderRadius: 10 * scale,
      overflow: 'hidden',
      marginRight: 12 * scale,
      backgroundColor: colors.surface.s0,
    },
    image: {
      width: 72 * scale,
      height: 72 * scale,
    },
    imagePlaceholder: {
      width: 72 * scale,
      height: 72 * scale,
      borderRadius: 10 * scale,
      backgroundColor: colors.surface.s0,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12 * scale,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    infoText: {
      flex: 1,
      justifyContent: 'center',
    },
    name: {
      fontSize: 16 * scale,
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: 4 * scale,
    },
    spec: {
      fontSize: 13 * scale,
      color: colors.text.secondary,
      marginBottom: 4 * scale,
    },
    price: {
      fontSize: 16 * scale,
      fontWeight: '700',
      color: colors.text.primary,
    },

    // 底部操作行
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },

    // 数量控件
    qtyControl: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2 * scale,
    },
    qtyBtn: {
      width: 30 * scale,
      height: 30 * scale,
      borderRadius: 15 * scale,
      borderWidth: 1,
      borderColor: colors.border.default,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface.s0,
    },
    qtyText: {
      fontSize: 15 * scale,
      fontWeight: '600',
      color: colors.text.primary,
      minWidth: 28 * scale,
      textAlign: 'center',
    },

    // 操作按钮组
    btnGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8 * scale,
    },
    ignoreBtn: {
      paddingHorizontal: 16 * scale,
      paddingVertical: 8 * scale,
    },
    ignoreBtnText: {
      fontSize: 14 * scale,
      fontWeight: '500',
      color: colors.text.tertiary,
    },
    addBtn: {
      backgroundColor: colors.brand.primary,
      borderRadius: 6 * scale,
      paddingHorizontal: 20 * scale,
      paddingVertical: 8 * scale,
      minWidth: 64 * scale,
      alignItems: 'center',
    },
    addBtnText: {
      fontSize: 14 * scale,
      fontWeight: '600',
      color: colors.text.inverse,
    },
  });
}