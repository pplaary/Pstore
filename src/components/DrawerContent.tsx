/**
 * 抽屉导航内容组件
 *
 * 菜单项按 spec §4.4 设计：
 * - 管理模式入口：全员可见（需 PIN）
 * - 管理模式中：显示商品管理、待处理条码、重复检测、导出
 * - 全员：同步配置、深色模式、关怀模式、设置
 */

import React, { useState, useCallback, useMemo } from 'react';
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
import { useTheme } from '../theme/ThemeContext';

export default function DrawerContent(props: any) {
  const { theme } = useTheme();
  const { colors, scale } = theme;
  const { isManagement, enterManagement, exitManagement } = useModeStore();
  const { items, total, clearCart } = useCartStore();
  const { pinHash, isPinSet, verifyPin, setPin } = usePinStore();
  const [pinInput, setPinInput] = useState('');
  const [pinModalVisible, setPinModalVisible] = useState(false);

  const styles = useMemo(() => createStyles(colors, scale), [colors, scale]);

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
          onPress={() => props.navigation.navigate('Config')}
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
              placeholderTextColor={colors.text.hint}
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

function createStyles(colors: ReturnType<typeof useTheme>['theme']['colors'], scale: number) {
  return StyleSheet.create({
    cartSummary: {
      margin: 16 * scale,
      padding: 12 * scale,
      backgroundColor: colors.bg.primary,
      borderRadius: 8 * scale,
    },
    cartSummaryTitle: { fontSize: 14 * scale, fontWeight: '600', color: colors.text.primary },
    cartSummaryText: { fontSize: 12 * scale, color: colors.text.secondary, marginTop: 2 * scale },
    cartSummaryTotal: {
      fontSize: 18 * scale, fontWeight: '700', color: colors.brand.danger, marginTop: 4 * scale,
    },
    section: { marginTop: 8 * scale },
    sectionTitle: {
      fontSize: 12 * scale, fontWeight: '600', color: colors.text.hint,
      marginHorizontal: 16 * scale, marginBottom: 4 * scale, textTransform: 'uppercase',
    },
    menuItem: { paddingVertical: 12 * scale, paddingHorizontal: 16 * scale },
    menuItemText: { fontSize: 15 * scale, color: colors.text.primary },
    settingRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 16 * scale, paddingVertical: 10 * scale,
    },
    settingLabel: { fontSize: 15 * scale, color: colors.text.primary },
    modeButton: {
      margin: 16 * scale,
      padding: 12 * scale,
      backgroundColor: colors.brand.primary,
      borderRadius: 8 * scale,
      alignItems: 'center',
    },
    modeButtonActive: { backgroundColor: colors.brand.success },
    modeButtonText: { fontSize: 14 * scale, color: colors.text.inverse, fontWeight: '600' },
    clearCartBtn: {
      margin: 16 * scale,
      padding: 12 * scale,
      backgroundColor: colors.bg.primary,
      borderRadius: 8 * scale,
      alignItems: 'center',
    },
    clearCartText: { fontSize: 14 * scale, color: colors.brand.danger, fontWeight: '600' },
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
      backgroundColor: colors.bg.card,
      borderRadius: 12 * scale,
      padding: 24 * scale,
    },
    pinTitle: {
      fontSize: 18 * scale, fontWeight: '700', color: colors.text.primary,
      textAlign: 'center', marginBottom: 8 * scale,
    },
    pinHint: {
      fontSize: 14 * scale, color: colors.text.secondary,
      textAlign: 'center', marginBottom: 20 * scale,
    },
    pinInput: {
      backgroundColor: colors.bg.primary,
      borderRadius: 8 * scale,
      paddingHorizontal: 16 * scale,
      paddingVertical: 12 * scale,
      fontSize: 18 * scale,
      textAlign: 'center',
      letterSpacing: 8 * scale,
      color: colors.text.primary,
      marginBottom: 20 * scale,
    },
    pinActions: { flexDirection: 'row', gap: 12 * scale },
    pinCancelBtn: {
      flex: 1,
      paddingVertical: 10 * scale,
      borderRadius: 8 * scale,
      backgroundColor: colors.bg.primary,
      alignItems: 'center',
    },
    pinCancelBtnText: { fontSize: 14 * scale, color: colors.text.secondary, fontWeight: '600' },
    pinConfirmBtn: {
      flex: 1,
      paddingVertical: 10 * scale,
      borderRadius: 8 * scale,
      backgroundColor: colors.brand.primary,
      alignItems: 'center',
    },
    pinConfirmBtnText: { color: colors.text.inverse, fontSize: 14 * scale, fontWeight: '600' },
  });
}
