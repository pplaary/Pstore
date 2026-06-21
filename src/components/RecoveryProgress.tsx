/**
 * 恢复进度遮罩组件
 *
 * 崩溃自动恢复时的启动加载遮罩。App 正常启动时 visible=false 不展示。
 */

import React from 'react';
import { View, Text, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface RecoveryProgressProps {
  visible: boolean;
  source: 'N1' | 'WEBDAV' | 'empty';
  message: string;
}

const SOURCE_META: Record<
  string,
  { icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  N1: { icon: 'cloud-done', color: '#16A34A' },
  WEBDAV: { icon: 'folder-open', color: '#2563EB' },
  empty: { icon: 'cube', color: '#94A3B8' },
};

export function RecoveryProgress({ visible, source, message }: RecoveryProgressProps) {
  const meta = SOURCE_META[source] ?? SOURCE_META.empty;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Ionicons name={meta.icon} size={40} color={meta.color} />
          <Text style={styles.message}>{message}</Text>
          <ActivityIndicator style={styles.spinner} color="#2563EB" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginHorizontal: 32,
    minWidth: 240,
  },
  message: {
    fontSize: 16,
    color: '#1E293B',
    marginTop: 16,
    textAlign: 'center',
  },
  spinner: {
    marginTop: 20,
  },
});
