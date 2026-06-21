/**
 * 配置中心页面
 *
 * N1 服务配置 + WebDAV 配置（占位）+ AI 配置（占位）
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { useNetworkDetection } from '../../hooks/useNetworkDetection';
import { useSyncConfigStore } from '../../store/syncConfig';
import { performSync } from '../../services/sync';
import type { DrawerScreenProps } from '../../navigation/types';

type Props = DrawerScreenProps<'Config'>;

export function ConfigScreen(_props: Props) {
  const serverUrl = useSyncConfigStore((s) => s.serverUrl);
  const setServerUrl = useSyncConfigStore((s) => s.setServerUrl);
  const [inputUrl, setInputUrl] = useState(serverUrl ?? '');
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);

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
      // performSync 需要 db 实例，这里通过 store 间接使用
      // 实际 db 获取由 App.tsx 的 StoreProvider 提供
      Alert.alert('提示', '同步功能需要数据库实例（在 App 层调用）');
    } catch (e) {
      Alert.alert('同步失败', String(e));
    } finally {
      setSyncing(false);
    }
  }, [inputUrl]);

  return (
    <ScrollView style={styles.container}>
      {/* N1 服务地址 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>N1 服务地址</Text>
        <TextInput
          style={styles.input}
          placeholder="http://192.168.x.x:3141"
          placeholderTextColor="#94A3B8"
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
        <SyncStatusPreview url={inputUrl.trim() || null} />
      </View>

      {/* WebDAV 配置（占位） */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>WebDAV 配置</Text>
        <TextInput
          style={styles.input}
          placeholder="WebDAV URL（Phase 5 实现）"
          placeholderTextColor="#94A3B8"
          editable={false}
        />
        <Text style={styles.hint}>Phase 5 实现</Text>
      </View>

      {/* AI 配置（占位） */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI 配置</Text>
        <Text style={styles.hint}>N1 在线时自动拉取，此处可手动覆盖</Text>
        <TextInput
          style={styles.input}
          placeholder="API 地址"
          placeholderTextColor="#94A3B8"
          editable={false}
        />
        <TextInput
          style={styles.input}
          placeholder="API Key"
          placeholderTextColor="#94A3B8"
          editable={false}
          secureTextEntry
        />
      </View>
    </ScrollView>
  );
}

// ==================== 子组件：状态预览 ====================

function SyncStatusPreview({ url }: { url: string | null }) {
  const isConnected = useNetworkDetection(url);

  if (!url) {
    return (
      <View style={styles.statusRow}>
        <Text style={styles.statusText}>未配置 N1 地址</Text>
      </View>
    );
  }

  const statusColor = isConnected ? '#16A34A' : '#94A3B8';
  const statusText = isConnected ? '已连接' : '不可达';

  return (
    <View style={styles.statusRow}>
      <Text style={[styles.statusDot, { backgroundColor: statusColor }]} />
      <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
    </View>
  );
}

// ==================== 样式 ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  section: {
    backgroundColor: '#FFF',
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1E293B',
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
    backgroundColor: '#2563EB',
  },
  syncButton: {
    backgroundColor: '#16A34A',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    color: '#94A3B8',
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
    fontSize: 13,
    fontWeight: '500',
  },
});
