/**
 * AI 识别结果确认卡片
 *
 * 展示 AI 识别的商品信息，提供 [加购] / [忽略] 操作。
 * 60 秒过期后变灰显示（视觉提示，不阻断交互）。
 *
 * spec-v4.5 §7.4：草稿卡 60 秒过期变灰，仍可点击确认。
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
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

// ==================== 色彩常量 ====================

const COLORS = {
  normalBg: '#FFFFFF',
  normalBorder: '#2563EB',
  expiredBg: '#F1F5F9',
  expiredBorder: '#94A3B8',
  confidenceHigh: '#16A34A',
  confidenceMid: '#F59E0B',
  confidenceLow: '#EF4444',
  confidenceBgHigh: '#DCFCE7',
  confidenceBgMid: '#FEF3C7',
  confidenceBgLow: '#FEE2E2',
  primaryBtn: '#2563EB',
  primaryBtnText: '#FFFFFF',
  ignoreText: '#94A3B8',
  textPrimary: '#1E293B',
  textSecondary: '#64748B',
  specText: '#64748B',
};

// ==================== 辅助函数 ====================

/**
 * 根据置信度返回颜色和标签。
 */
function getConfidenceMeta(confidence: number): { color: string; bg: string; label: string } {
  if (confidence >= 0.8) {
    return { color: COLORS.confidenceHigh, bg: COLORS.confidenceBgHigh, label: '高置信度' };
  }
  if (confidence >= 0.5) {
    return { color: COLORS.confidenceMid, bg: COLORS.confidenceBgMid, label: '中置信度' };
  }
  return { color: COLORS.confidenceLow, bg: COLORS.confidenceBgLow, label: '低置信度' };
}

// ==================== 组件 ====================

/**
 * AI 识别结果确认卡片。
 */
export function ProductConfirmCard({
  product,
  quantity,
  confidence,
  expired,
  onAddToCart,
  onIgnore,
}: ProductConfirmCardProps): JSX.Element {
  const confidenceMeta = getConfidenceMeta(confidence);
  const displayName = quantity > 1 ? `${product.name} ×${quantity}` : product.name;

  return (
    <View
      style={[
        styles.card,
        expired ? styles.cardExpired : styles.cardNormal,
      ]}
    >
      {/* 商品信息区 */}
      <View style={styles.infoRow}>
        {/* 缩略图 */}
        {product.imageUri ? (
          <View style={styles.thumbnailWrapper}>
            <Image source={{ uri: product.imageUri }} style={styles.thumbnail} />
          </View>
        ) : (
          <View style={styles.thumbnailPlaceholder}>
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
        >
          <Text style={styles.addBtnText}>加购</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.ignoreBtn}
          onPress={onIgnore}
        >
          <Text style={styles.ignoreBtnText}>忽略</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ==================== 样式 ====================

const styles = StyleSheet.create({
  // 卡片容器
  card: {
    borderRadius: 10,
    padding: 14,
    marginVertical: 6,
  },
  cardNormal: {
    backgroundColor: COLORS.normalBg,
    borderWidth: 2,
    borderColor: COLORS.normalBorder,
  },
  cardExpired: {
    backgroundColor: COLORS.expiredBg,
    borderWidth: 2,
    borderColor: COLORS.expiredBorder,
    opacity: 0.5,
  },
  // 商品信息行
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  thumbnailWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  thumbnail: {
    width: 48,
    height: 48,
  },
  thumbnailPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  thumbnailPlaceholderText: {
    fontSize: 20,
  },
  infoText: {
    flex: 1,
    marginRight: 10,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  nameExpired: {
    color: COLORS.textSecondary,
  },
  spec: {
    fontSize: 13,
    color: COLORS.specText,
    marginBottom: 4,
  },
  specExpired: {
    color: COLORS.textSecondary,
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: '#DC2626',
  },
  priceExpired: {
    color: COLORS.textSecondary,
  },
  // 置信度标签
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  confidenceText: {
    fontSize: 12,
    fontWeight: '600',
  },
  // 过期提示
  expiredHint: {
    fontSize: 11,
    color: COLORS.confidenceMid,
    marginBottom: 8,
  },
  // 按钮行
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  addBtn: {
    flex: 1,
    backgroundColor: COLORS.primaryBtn,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primaryBtnText,
  },
  ignoreBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  ignoreBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.ignoreText,
  },
});
