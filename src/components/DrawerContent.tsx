/**
 * 抽屉导航内容组件 — 现代化设计
 *
 * 设计特征：
 * - 品牌标识头部区域
 * - 分组菜单项，清晰图标+文字
 * - 购物车概览卡片
 * - 管理模式入口
 * - 使用语义化间距和圆角令牌
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
} from 'react-native';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';
import { useModeStore } from '../store/mode';
import { useCartStore } from '../store/cart';
import { usePinStore } from '../store/pin';
import { useTheme, type Theme } from '../theme/ThemeContext';
import { useStore } from '../context/store';
import { exportProductsCSV, type ExportScope } from '../services/backup/exportCSV';
import { exportProducts } from '../db/search';

export default function DrawerContent(props: DrawerContentComponentProps) {
  const { theme } = useTheme();
  const { isManagement, enterManagement, exitManagement } = useModeStore();
  const { items, total, clearCart } = useCartStore();
  const { pinHash, isPinSet, verifyPin, setPin } = usePinStore();
  const { db } = useStore();
  const [pinInput, setPinInput] = useState('');
  const [pinModalVisible, setPinModalVisible] = useState(false);

  const styles = useMemo(() => createStyles(theme), [theme]);
  const { colors, spacing, radii, scale } = theme;

  const handleExport = useCallback(() => {
    Alert.alert('选择导出范围', '请选择要导出的商品范围', [
      { text: '全部商品', onPress: () => exportAndSave('all') },
      { text: '在售商品', onPress: () => exportAndSave('in_stock') },
      { text: '待采商品', onPress: () => exportAndSave('to_be_purchased') },
      { text: '取消', style: 'cancel' },
    ]);
  }, [db]);

  const exportAndSave = useCallback(async (scope: ExportScope) => {
    try {
      const products = await exportProducts(db);
      const result = await exportProductsCSV(products, scope);
      if (!result.ok) {
        Alert.alert('导出失败', result.error ?? '未知错误');
      }
    } catch (e) {
      Alert.alert('导出失败', e instanceof Error ? e.message : '未知错误');
    }
  }, [db]);

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  const handleModeToggle = useCallback(() => {
    if (isManagement) {
      exitManagement();
      props.navigation.closeDrawer();
    } else {
      setPinModalVisible(true);
    }
  }, [isManagement, exitManagement]);

  const handlePinAction = useCallback(async () => {
    const trimmed = pinInput.trim();
    if (!trimmed) return;
    if (isPinSet) {
      const ok = await verifyPin(trimmed);
      if (ok) {
        enterManagement();
        setPinModalVisible(false);
        setPinInput('');
        props.navigation.closeDrawer();
      } else {
        Alert.alert('验证失败', 'PIN 密码错误，请重试');
      }
    } else {
      if (trimmed.length < 4) {
        Alert.alert('提示', 'PIN 密码至少 4 位');
        return;
      }
      await setPin(trimmed);
      enterManagement();
      setPinModalVisible(false);
      setPinInput('');
      props.navigation.closeDrawer();
    }
  }, [pinInput, isPinSet, verifyPin, setPin, enterManagement, props]);

  return (
    <DrawerContentScrollView {...props} style={styles.container}>
      {/* 品牌标识头部 */}
      <View style={styles.brandHeader}>
        <View style={styles.brandIcon}>
          <Ionicons name="cube" size={28 * scale} color={colors.text.inverse} />
        </View>
        <Text style={styles.brandTitle}>PStore</Text>
        <Text style={styles.brandSubtitle}>AI 智能物品管理</Text>
      </View>

      {/* 购物车概览 */}
      {items.length > 0 && (
        <View style={styles.cartSummary}>
          <View style={styles.cartSummaryRow}>
            <Ionicons name="cart" size={18 * scale} color={colors.brand.primary} />
            <Text style={styles.cartSummaryTitle}>购物车</Text>
          </View>
          <Text style={styles.cartSummaryText}>
            {items.length} 种商品，共 {totalQty} 件
          </Text>
          <Text style={styles.cartSummaryTotal}>¥{total.toFixed(2)}</Text>
        </View>
      )}

      {/* 管理模式菜单 */}
      {isManagement && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>管理</Text>
          <DrawerMenuItem
            icon="archive"
            label="商品管理"
            onPress={() => props.navigation.navigate('ProductList')}
            colors={colors}
            scale={scale}
          />
          <DrawerMenuItem
            icon="clipboard"
            label="待处理条码"
            onPress={() => props.navigation.navigate('PendingItems')}
            colors={colors}
            scale={scale}
          />
          <DrawerMenuItem
            icon="trash"
            label="已删除商品"
            onPress={() => props.navigation.navigate('ProductList', { filter: 'deleted' })}
            colors={colors}
            scale={scale}
          />
          <DrawerMenuItem
            icon="git-compare"
            label="重复检测"
            onPress={() => props.navigation.navigate('DuplicateList')}
            colors={colors}
            scale={scale}
          />
          <DrawerMenuItem
            icon="pricetags"
            label="散装标签管理"
            onPress={() => props.navigation.navigate('LooseGoodsManage')}
            colors={colors}
            scale={scale}
          />
          <DrawerMenuItem
            icon="download"
            label="商品数据导出"
            onPress={handleExport}
            colors={colors}
            scale={scale}
          />
        </View>
      )}

      {/* 通用功能 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>功能</Text>
        <DrawerMenuItem
          icon="sync"
          label="同步配置"
          onPress={() => props.navigation.navigate('Config')}
          colors={colors}
          scale={scale}
        />
      </View>

      {/* 设置 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>设置</Text>
        <DrawerMenuItem
          icon="settings"
          label="设置"
          onPress={() => props.navigation.navigate('Config')}
          colors={colors}
          scale={scale}
          showChevron
        />
      </View>

      {/* 管理模式入口 */}
      <TouchableOpacity
        style={[styles.modeButton, isManagement && styles.modeButtonActive]}
        onPress={handleModeToggle}
        accessibilityLabel={isManagement ? '退出管理模式' : '进入管理模式'}
        accessibilityRole="button"
      >
        <Ionicons
          name={isManagement ? 'lock-open' : 'lock-closed'}
          size={16 * scale}
          color={colors.text.inverse}
          style={{ marginRight: spacing.sm }}
        />
        <Text style={styles.modeButtonText}>
          {isManagement ? '已进入管理模式（点击退出）' : '进入管理模式'}
        </Text>
      </TouchableOpacity>

      {/* 清空购物车 */}
      {items.length > 0 && (
        <TouchableOpacity
          style={styles.clearCartBtn}
          onPress={clearCart}
          accessibilityLabel="清空购物车"
          accessibilityRole="button"
        >
          <Ionicons name="trash-outline" size={16 * scale} color={colors.brand.danger} style={{ marginRight: spacing.sm }} />
          <Text style={styles.clearCartText}>清空购物车</Text>
        </TouchableOpacity>
      )}

      {/* 底部间距 */}
      <View style={{ height: spacing.xxxl }} />

      {/* PIN 验证弹窗 */}
      {pinModalVisible && (
        <View style={styles.pinOverlay}>
          <View style={styles.pinModal}>
            <Text style={styles.pinTitle}>
              {isPinSet ? '输入 PIN 密码' : '设置 PIN 密码'}
            </Text>
            <Text style={styles.pinHint}>
              {isPinSet ? '请输入 PIN 进入管理模式' : '请设置 4 位 PIN 密码'}
            </Text>
            <TextInput
              style={styles.pinInput}
              placeholder={isPinSet ? '输入 PIN' : '设置 PIN'}
              placeholderTextColor={colors.text.tertiary}
              value={pinInput}
              onChangeText={setPinInput}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              accessibilityLabel="输入PIN"
            />
            <View style={styles.pinActions}>
              <TouchableOpacity
                style={styles.pinCancelBtn}
                onPress={() => { setPinModalVisible(false); setPinInput(''); }}
                accessibilityLabel="取消PIN输入"
                accessibilityRole="button"
              >
                <Text style={styles.pinCancelBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.pinConfirmBtn}
                onPress={handlePinAction}
                accessibilityLabel="确认PIN"
                accessibilityRole="button"
              >
                <Text style={styles.pinConfirmBtnText}>确认</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </DrawerContentScrollView>
  );
}

// ─── 菜单项子组件 ────────────────────────────────────────────

function DrawerMenuItem({
  icon,
  label,
  onPress,
  colors,
  scale,
  showChevron,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  colors: Theme['colors'];
  scale: number;
  showChevron?: boolean;
}) {
  return (
    <TouchableOpacity
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12 * scale,
        paddingHorizontal: 16 * scale,
        minHeight: 44 * scale,
      }}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="menuitem"
    >
      <Ionicons name={icon} size={20 * scale} color={colors.text.secondary} style={{ marginRight: 12 * scale }} />
      <Text style={{ flex: 1, fontSize: 15 * scale, color: colors.text.primary }}>{label}</Text>
      {showChevron && (
        <Ionicons name="chevron-forward" size={16 * scale} color={colors.text.tertiary} />
      )}
    </TouchableOpacity>
  );
}

// ─── 样式 ────────────────────────────────────────────────────

function createStyles(theme: Theme) {
  const { colors, spacing, radii, scale, shadows } = theme;
  return StyleSheet.create({
    container: {
      backgroundColor: colors.surface.s1,
    },

    // 品牌头部
    brandHeader: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xxl,
      paddingBottom: spacing.lg,
      backgroundColor: colors.brand.primary,
      marginBottom: spacing.sm,
    },
    brandIcon: {
      width: 48 * scale,
      height: 48 * scale,
      borderRadius: radii.lg,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    brandTitle: {
      fontSize: 22 * scale,
      fontWeight: '800',
      color: colors.text.inverse,
      letterSpacing: -0.5,
    },
    brandSubtitle: {
      fontSize: 13 * scale,
      color: 'rgba(255,255,255,0.75)',
      marginTop: spacing.xs,
    },

    // 购物车概览
    cartSummary: {
      margin: spacing.lg,
      padding: spacing.md,
      backgroundColor: colors.brand.primaryMuted,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.brand.primary + '20',
    },
    cartSummaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.xs,
    },
    cartSummaryTitle: {
      fontSize: 14 * scale,
      fontWeight: '600',
      color: colors.brand.primary,
      marginLeft: spacing.sm,
    },
    cartSummaryText: {
      fontSize: 12 * scale,
      color: colors.text.secondary,
      marginTop: 2 * scale,
    },
    cartSummaryTotal: {
      fontSize: 20 * scale,
      fontWeight: '800',
      color: colors.brand.danger,
      marginTop: spacing.xs,
    },

    // 分组
    section: {
      marginTop: spacing.sm,
    },
    sectionTitle: {
      fontSize: 11 * scale,
      fontWeight: '700',
      color: colors.text.tertiary,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.xs,
      marginTop: spacing.sm,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },

    // 管理模式按钮
    modeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      margin: spacing.lg,
      padding: spacing.md,
      backgroundColor: colors.brand.primary,
      borderRadius: radii.md,
      ...shadows.sm,
    },
    modeButtonActive: {
      backgroundColor: colors.brand.success,
    },
    modeButtonText: {
      fontSize: 14 * scale,
      color: colors.text.inverse,
      fontWeight: '600',
    },

    // 清空购物车
    clearCartBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      margin: spacing.lg,
      padding: spacing.md,
      backgroundColor: colors.brand.dangerMuted,
      borderRadius: radii.md,
    },
    clearCartText: {
      fontSize: 14 * scale,
      color: colors.brand.danger,
      fontWeight: '600',
    },

    // PIN 弹窗
    pinOverlay: {
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    pinModal: {
      width: '80%',
      backgroundColor: colors.surface.s2,
      borderRadius: radii.lg,
      padding: spacing.xxl,
    },
    pinTitle: {
      fontSize: 18 * scale,
      fontWeight: '700',
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    pinHint: {
      fontSize: 14 * scale,
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: spacing.xl,
    },
    pinInput: {
      backgroundColor: colors.surface.s0,
      borderRadius: radii.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      fontSize: 18 * scale,
      textAlign: 'center',
      letterSpacing: 8 * scale,
      color: colors.text.primary,
      marginBottom: spacing.xl,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    pinActions: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    pinCancelBtn: {
      flex: 1,
      paddingVertical: spacing.sm + 2,
      borderRadius: radii.md,
      backgroundColor: colors.surface.s0,
      alignItems: 'center',
    },
    pinCancelBtnText: {
      fontSize: 14 * scale,
      color: colors.text.secondary,
      fontWeight: '600',
    },
    pinConfirmBtn: {
      flex: 1,
      paddingVertical: spacing.sm + 2,
      borderRadius: radii.md,
      backgroundColor: colors.brand.primary,
      alignItems: 'center',
    },
    pinConfirmBtnText: {
      color: colors.text.inverse,
      fontSize: 14 * scale,
      fontWeight: '600',
    },
  });
}