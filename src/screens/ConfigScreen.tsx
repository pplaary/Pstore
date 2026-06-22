/**
 * 配置中心页面
 *
 * N1 服务配置 + WebDAV 配置 + AI 配置（占位）
 * WebDAV 配置仅在管理模式下可编辑；普通模式下只读展示。
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Switch,
} from 'react-native';
import { useNetworkDetection } from '../hooks/useNetworkDetection';
import { useSyncConfigStore } from '../store/syncConfig';
import { useModeStore } from '../store/mode';
import { performSync } from '../services/sync';
import { clearAllProducts, resetDatabase } from '../services/backup/clear';
import { showToast } from '../utils/toast';
import type { RootStackScreenProps } from '../navigation/types';
import { useStore } from '../context/store';
import { WebDAVConfig } from '../components/WebDAVConfig';
import { useTheme } from '../theme/ThemeContext';

type Props = RootStackScreenProps<'Config'>;

export function ConfigScreen(_props: Props) {
  const { theme, setMode: setThemeMode } = useTheme();
  const { colors, scale } = theme;
  const styles = useMemo(() => createStyles(colors, scale), [colors, scale]);
  const serverUrl = useSyncConfigStore((s) => s.serverUrl);
  const setServerUrl = useSyncConfigStore((s) => s.setServerUrl);
  const isManagement = useModeStore((s) => s.isManagement);
  const { db } = useStore();
  const [inputUrl, setInputUrl] = useState(serverUrl ?? '');
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const networkStatus = useNetworkDetection(inputUrl.trim() || null);

  // ─── 主题 ────────────────────────────────────────────────
  const isSystemMode = theme.storedMode === 'system';
  const currentMode = theme.mode;

  const handleSystemToggle = useCallback(async (val: boolean) => {
    await setThemeMode(val ? 'system' : 'light');
  }, [setThemeMode]);

  const handleModeSelect = useCallback(async (mode: 'light' | 'dark' | 'care') => {
    await setThemeMode(mode);
  }, [setThemeMode]);

  // N1 地址测试连接
  const handleTestConnection = useCallback(async () => {
    const url = inputUrl.trim();
    if (!url) {
      Alert.alert('提示', '请输入 N1 服务地址');
      return;
    }

    setChecking(true);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${url}/api/health`, { signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) {
        Alert.alert('连接成功', `N1 服务可访问: ${url}`);
        setServerUrl(url);
      } else {
        Alert.alert('连接失败', `HTTP ${res.status}`);
      }
    } catch {
      Alert.alert('连接失败', '无法连接到 N1 服务，请检查地址和网络');
    } finally {
      setChecking(false);
    }
  }, [inputUrl, setServerUrl]);

  // 立即同步
  const handleSync = useCallback(async () => {
    const url = inputUrl.trim();
    if (!url) {
      Alert.alert('提示', '请先配置 N1 服务地址');
      return;
    }

    setSyncing(true);
    try {
      await performSync(db, useSyncConfigStore.getState(), url);
      Alert.alert('同步完成', '数据同步成功');
    } catch (e) {
      Alert.alert('同步失败', String(e));
    } finally {
      setSyncing(false);
    }
  }, [inputUrl, db]);

  // ─── 数据管理 ────────────────────────────────────────────

  const handleClearProducts = useCallback(async () => {
    Alert.alert(
      '清空商品',
      '此操作将所有商品标记为已删除（软删除），数据仍可通过 WebDAV 备份恢复。确定继续？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          style: 'destructive',
          onPress: async () => {
            const result = await clearAllProducts(db);
            if (result.ok) {
              showToast(result.message, 'LONG');
            } else {
              Alert.alert('清空失败', result.message);
            }
          },
        },
      ],
    );
  }, [db]);

  const handleResetDatabase = useCallback(async () => {
    Alert.alert(
      '重置数据库',
      '此操作将删除全部数据（商品、价格历史、待扫清单等），且不可恢复。建议先导出备份。确定继续？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '重置',
          style: 'destructive',
          onPress: async () => {
            const result = await resetDatabase(db);
            if (result.ok) {
              showToast(result.message, 'LONG');
            } else {
              Alert.alert('重置失败', result.message);
            }
          },
        },
      ],
    );
  }, [db]);

  return (
    <ScrollView style={styles.container}>
      {/* 主题 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>外观</Text>

        {/* 跟随系统 */}
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>跟随系统</Text>
          <Switch value={isSystemMode} onValueChange={handleSystemToggle} />
        </View>

        {/* 手动选择（跟随系统时半透明） */}
        <View style={[styles.modeRow, isSystemMode && styles.modeRowDisabled]}>
          {([
            { mode: 'light' as const, label: '☀️ 浅色', icon: '☀️' },
            { mode: 'dark'  as const, label: '🌙 深色', icon: '🌙' },
            { mode: 'care'  as const, label: '👴 关怀', icon: '👴' },
          ]).map(({ mode, label }) => (
            <TouchableOpacity
              key={mode}
              style={[
                styles.modeChip,
                currentMode === mode && { backgroundColor: colors.brand.primary + '15', borderColor: colors.brand.primary },
              ]}
              onPress={() => handleModeSelect(mode)}
              disabled={isSystemMode}
            >
              <Text style={[
                styles.modeChipText,
                currentMode === mode && { color: colors.brand.primary, fontWeight: '600' },
              ]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 关怀模式提示 */}
        {currentMode === 'care' && (
          <Text style={styles.careHint}>
            关怀模式已开启：字号放大、高对比度、44dp 触摸区域
          </Text>
        )}
      </View>

      {/* N1 服务地址 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>N1 服务地址</Text>
        <TextInput
          style={styles.input}
          placeholder="http://192.168.x.x:3141"
          placeholderTextColor={colors.text.hint}
          value={inputUrl}
          onChangeText={setInputUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.testButton]}
            onPress={handleTestConnection}
            disabled={checking}
          >
            <Text style={styles.buttonText}>{checking ? '检测中...' : '测试连接'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.syncButton]}
            onPress={handleSync}
            disabled={syncing}
          >
            <Text style={styles.buttonText}>{syncing ? '同步中...' : '立即同步'}</Text>
          </TouchableOpacity>
        </View>
        {!inputUrl.trim() ? (
          <View style={styles.statusRow}>
            <Text style={styles.statusText}>未配置 N1 地址</Text>
          </View>
        ) : (
          <View style={styles.statusRow}>
            <Text style={[styles.statusDot, { backgroundColor: networkStatus ? '#16A34A' : '#94A3B8' }]} />
            <Text style={[styles.statusText, { color: networkStatus ? '#16A34A' : '#94A3B8' }]}>
              {networkStatus ? '已连接' : '不可达'}
            </Text>
          </View>
        )}
      </View>

      {/* WebDAV 配置 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>WebDAV 配置</Text>
        <WebDAVConfig editable={isManagement} />
      </View>

      {/* AI 配置（占位） */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI 配置</Text>
        <Text style={styles.hint}>N1 在线时自动拉取，此处可手动覆盖</Text>
        <TextInput
          style={styles.input}
          placeholder="API 地址"
          placeholderTextColor={colors.text.hint}
          editable={false}
        />
        <TextInput
          style={styles.input}
          placeholder="API Key"
          placeholderTextColor={colors.text.hint}
          editable={false}
          secureTextEntry
        />
      </View>
      {/* 数据管理 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>数据管理</Text>
        <Text style={styles.hint}>清空商品或完全重置数据库</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.dangerButton]}
            onPress={handleClearProducts}
          >
            <Text style={styles.buttonText}>清空商品</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.dangerButton]}
            onPress={handleResetDatabase}
          >
            <Text style={styles.buttonText}>重置数据库</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

// ==================== 样式 ====================

function createStyles(colors: ReturnType<typeof useTheme>['theme']['colors'], scale: number) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg.primary,
    },
    section: {
      backgroundColor: colors.bg.card,
      marginHorizontal: 16,
      marginTop: 16,
      padding: 16,
      borderRadius: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    settingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
    },
    settingLabel: {
      fontSize: 15 * scale,
      color: colors.text.primary,
      fontWeight: '500',
    },
    modeRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 10,
    },
    modeRowDisabled: {
      opacity: 0.4,
    },
    modeChip: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.border.default,
      backgroundColor: colors.bg.primary,
      alignItems: 'center',
    },
    modeChipText: {
      fontSize: 14 * scale,
      color: colors.text.secondary,
    },
    careHint: {
      fontSize: 12 * scale,
      color: colors.brand.warning,
      marginTop: 10,
      lineHeight: 18 * scale,
    },
    sectionTitle: {
      fontSize: 16 * scale,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 12,
    },
    input: {
      backgroundColor: colors.bg.input,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14 * scale,
      color: colors.text.primary,
      marginBottom: 8,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 4,
    },
    button: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      alignItems: 'center',
    },
    testButton: {
      backgroundColor: colors.brand.primary,
    },
    syncButton: {
      backgroundColor: colors.brand.success,
    },
    dangerButton: {
      backgroundColor: colors.brand.danger,
    },
    buttonText: {
      color: colors.text.inverse,
      fontSize: 14 * scale,
      fontWeight: '600',
    },
    hint: {
      fontSize: 12 * scale,
      color: colors.text.hint,
      marginTop: 4,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
      gap: 6,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    statusText: {
      fontSize: 13 * scale,
      fontWeight: '500',
    },
  });
}
