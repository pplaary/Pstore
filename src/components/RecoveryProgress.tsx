/**
 * 恢复进度遮罩组件
 *
 * 崩溃自动恢复时的启动加载遮罩。App 正常启动时 visible=false 不展示。
 */

import React, { useMemo } from 'react';
import { View, Text, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

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
  const { theme } = useTheme();
  const { colors, scale } = theme;
  const meta = SOURCE_META[source] ?? SOURCE_META.empty;
  const styles = useMemo(() => createStyles(colors, scale), [colors, scale]);

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

function createStyles(colors: ReturnType<typeof useTheme>['theme']['colors'], scale: number) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    card: {
      backgroundColor: colors.surface.s1,
      borderRadius: 16 * scale,
      padding: 32 * scale,
      alignItems: 'center',
      marginHorizontal: 32 * scale,
      minWidth: 240,
    },
    message: {
      fontSize: 16 * scale,
      color: colors.text.primary,
      marginTop: 16 * scale,
      textAlign: 'center',
    },
    spinner: {
      marginTop: 20 * scale,
    },
  });
}
