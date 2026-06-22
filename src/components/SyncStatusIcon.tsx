/**
 * 同步状态图标组件
 *
 * 显示 N1 云服务或 WebDAV 备份连接状态。
 * 优先级：N1 可达 > WebDAV 已配置 > 本地模式。
 *
 * 使用 useFocusEffect 确保每次屏幕获取焦点时重新检测 WebDAV 凭据状态。
 */

import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect } from '@react-navigation/native';
import { useSyncConfigStore } from '../store/syncConfig';
import { useNetworkDetection } from '../hooks/useNetworkDetection';

export function SyncStatusIcon() {
  const serverUrl = useSyncConfigStore((s) => s.serverUrl);
  const isConnected = useNetworkDetection(serverUrl);
  const [webdavConfigured, setWebdavConfigured] = useState(false);

  // 每次屏幕获取焦点时重新读取 WebDAV 凭据状态
  useFocusEffect(
    useCallback(() => {
      SecureStore.getItemAsync('pstore_webdav_url').then((url) => {
        setWebdavConfigured(!!url);
      });
    }, []),
  );

  // N1 已配置且可达
  const isN1Reachable = serverUrl !== null && isConnected;

  let iconName: keyof typeof Ionicons.glyphMap = 'cloud-offline';
  let label = '本地模式';
  let color = '#94A3B8';

  if (isN1Reachable) {
    iconName = 'cloud-done';
    label = '已连接';
    color = '#16A34A';
  } else if (webdavConfigured) {
    iconName = 'cloud';
    label = 'WebDAV';
    color = '#2563EB';
  }

  return (
    <TouchableOpacity style={styles.container} activeOpacity={0.7}>
      <Ionicons name={iconName} size={20} color={color} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
});
