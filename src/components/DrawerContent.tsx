/**
 * 抽屉导航内容组件
 *
 * 菜单项按 spec §4.4 设计：
 * - 管理模式入口：全员可见（需 PIN）
 * - 管理模式中：显示商品管理、待处理条码、重复检测、导出
 * - 全员：同步配置、深色模式、关怀模式、设置
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
  TextInput,
  Alert,
} from 'react-native';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { useModeStore } from '../store/mode';
import { useCartStore } from '../store/cart';
import { usePinStore } from '../store/pin';

export default function DrawerContent(props: any) {
  const { isManagement, enterManagement, exitManagement } = useModeStore();
  const { items, total, clearCart } = useCartStore();
  const { pinHash, isPinSet, verifyPin, setPin } = usePinStore();
  const [pinInput, setPinInput] = useState('');
  const [pinModalVisible, setPinModalVisible] = useState(false);

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
            onPress={() => props.navigation.navigate('PendingItems')}
          >
            <Text style={styles.menuItemText}>📋 待处理条码</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => props.navigation.navigate('ProductList', { filter: 'deleted' })}
          >
            <Text style={styles.menuItemText}>🗑 已删除商品</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => props.navigation.navigate('DuplicateList')}
          >
            <Text style={styles.menuItemText}>🔍 重复检测</Text>
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
          style={[styles.modeButton, isManagement && styles.modeButtonActive]}
          onPress={handleModeToggle}
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
              placeholderTextColor="#94A3B8"
              value={pinInput}
              onChangeText={setPinInput}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            <View style={styles.pinActions}>
              <TouchableOpacity
                style={styles.pinCancelBtn}
                onPress={() => {
                  setPinModalVisible(false);
                  setPinInput('');
                }}
              >
                <Text style={styles.pinCancelBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.pinConfirmBtn}
                onPress={handlePinAction}
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

const styles = StyleSheet.create({
  cartSummary: {
    margin: 16,
    padding: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
  },
  cartSummaryTitle: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
  cartSummaryText: { fontSize: 12, color: '#64748B', marginTop: 2 },
  cartSummaryTotal: {
    fontSize: 18, fontWeight: '700', color: '#DC2626', marginTop: 4,
  },
  section: { marginTop: 8 },
  sectionTitle: {
    fontSize: 12, fontWeight: '600', color: '#94A3B8',
    marginHorizontal: 16, marginBottom: 4, textTransform: 'uppercase',
  },
  menuItem: { paddingVertical: 12, paddingHorizontal: 16 },
  menuItemText: { fontSize: 15, color: '#1E293B' },
  settingRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  settingLabel: { fontSize: 15, color: '#1E293B' },
  modeButton: {
    margin: 16,
    padding: 12,
    backgroundColor: '#2563EB',
    borderRadius: 8,
    alignItems: 'center',
  },
  modeButtonActive: { backgroundColor: '#10B981' },
  modeButtonText: { fontSize: 14, color: '#FFFFFF', fontWeight: '600' },
  clearCartBtn: {
    margin: 16,
    padding: 12,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    alignItems: 'center',
  },
  clearCartText: { fontSize: 14, color: '#DC2626', fontWeight: '600' },
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
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 24,
  },
  pinTitle: {
    fontSize: 18, fontWeight: '700', color: '#1E293B',
    textAlign: 'center', marginBottom: 8,
  },
  pinHint: {
    fontSize: 14, color: '#64748B',
    textAlign: 'center', marginBottom: 20,
  },
  pinInput: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    textAlign: 'center',
    letterSpacing: 8,
    color: '#1E293B',
    marginBottom: 20,
  },
  pinActions: { flexDirection: 'row', gap: 12 },
  pinCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  pinCancelBtnText: { fontSize: 14, color: '#64748B', fontWeight: '600' },
  pinConfirmBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2563EB',
    alignItems: 'center',
  },
  pinConfirmBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
});
