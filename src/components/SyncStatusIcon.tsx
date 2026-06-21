/**
 * 同步状态图标组件
 *
 * 显示 N1 云服务连接状态。
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSyncConfigStore } from '../../store/syncConfig';
import { useNetworkDetection } from '../../hooks/useNetworkDetection';

export function SyncStatusIcon() {
  const serverUrl = useSyncConfigStore((s) => s.serverUrl);
  const isConnected = useNetworkDetection(serverUrl);

  // WebDAV 模式
  const isWebDav =
    serverUrl !== null && (serverUrl.startsWith('dav://') || serverUrl.startsWith('webdav://'));

  const isN1 = serverUrl !== null && !isWebDav;

  let iconName: keyof typeof Ionicons.glyphMap = 'cloud-offline';
  let label = '本地模式';
  let color = '#94A3B8';

  if (isWebDav) {
    iconName = 'cloud';
    label = 'WebDAV';
    color = '#2563EB';
  } else if (isN1 && isConnected) {
    iconName = 'cloud-done';
    label = '已连接';
    color = '#16A34A';
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
