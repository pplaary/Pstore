/**
 * 抽屉导航内容组件
 *
 * 菜单项按 spec §4.4 设计：
 * - 管理模式入口：全员可见
 * - 管理模式中：显示商品管理、商品数据导出
 * - 全员：同步配置、深色模式、关怀模式、设置
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { useModeStore } from '../store/mode';
import { useCartStore } from '../store/cart';

export default function DrawerContent(props: any) {
  const { isManagement } = useModeStore();
  const { items, total, clearCart } = useCartStore();

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <DrawerContentScrollView {...props}>
      {/* 购物车概览 */}
      {items.length > 0 && (
        <View style={styles.cartSummary}>
          <Text style={styles.cartSummaryTitle}>🛒 购物车</Text>
          <Text style={styles.cartSummaryText}>
            {items.length} 种商品，共 {totalQty} 件
          </Text>
          <Text style={styles.cartSummaryTotal}>¥{total.toFixed(2)}</Text>
        </View>
      )}

      {/* 管理模式菜单项 */}
      {isManagement && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>管理</Text>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => props.navigation.navigate('ProductList')}
          >
            <Text style={styles.menuItemText}>📦 商品管理</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => alert('商品数据导出功能开发中')}
          >
            <Text style={styles.menuItemText}>📤 商品数据导出</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 通用功能 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>功能</Text>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => alert('同步配置功能开发中')}
        >
          <Text style={styles.menuItemText}>🔄 同步配置</Text>
        </TouchableOpacity>
      </View>

      {/* 设置 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>设置</Text>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>🌙 深色模式</Text>
          <Switch value={false} disabled />
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>👴 关怀模式</Text>
          <Switch value={false} disabled />
        </View>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => alert('设置页开发中')}
        >
          <Text style={styles.menuItemText}>⚙️ 设置</Text>
        </TouchableOpacity>
      </View>

      {/* 管理模式入口 */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.modeButton}
          onPress={() => {
            if (isManagement) {
              toggleManagement();
              props.navigation.closeDrawer();
            } else {
              // 进入管理模式需要 PIN（Commit 3 实现）
              alert('请连击标题 5 次进入管理模式');
              props.navigation.closeDrawer();
            }
          }}
        >
          <Text style={styles.modeButtonText}>
            {isManagement ? '✓ 已进入管理模式（点击退出）' : '🔒 进入管理模式'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 清空购物车 */}
      {items.length > 0 && (
        <TouchableOpacity style={styles.clearCartBtn} onPress={clearCart}>
          <Text style={styles.clearCartText}>🗑 清空购物车</Text>
        </TouchableOpacity>
      )}
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  cartSummary: {
    margin: 16,
    padding: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
  },
  cartSummaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  cartSummaryText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  cartSummaryTotal: {
    fontSize: 18,
    fontWeight: '700',
    color: '#DC2626',
    marginTop: 4,
  },
  section: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    marginHorizontal: 16,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontSize: 15,
    color: '#1E293B',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  settingLabel: {
    fontSize: 15,
    color: '#1E293B',
  },
  modeButton: {
    margin: 16,
    padding: 12,
    backgroundColor: '#2563EB',
    borderRadius: 8,
    alignItems: 'center',
  },
  modeButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  clearCartBtn: {
    margin: 16,
    padding: 12,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    alignItems: 'center',
  },
  clearCartText: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '600',
  },
});
