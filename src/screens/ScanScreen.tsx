import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { RootStackParamList } from '../navigation/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type ScanScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'ScanBarcode'
>;

export function ScanScreen(_props: ScanScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>扫码页 (Commit 5)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholder: { fontSize: 16, color: '#94A3B8' },
});
