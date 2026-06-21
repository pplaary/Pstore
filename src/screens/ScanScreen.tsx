import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Keyboard } from 'react-native';
import type { ScanScreenProps } from '../navigation/types';

export function ScanScreen({ navigation }: ScanScreenProps) {
  const [barcode, setBarcode] = useState('');
  const inputRef = useRef<TextInput>(null);

  const handleScan = useCallback(async () => {
    const trimmed = barcode.trim();
    if (!trimmed) {
      Alert.alert('提示', '请输入或扫描条码');
      return;
    }
    navigation.navigate('ProductEdit', { barcode: trimmed });
  }, [barcode, navigation]);

  const handleManualSubmit = useCallback(() => {
    Keyboard.dismiss();
    handleScan();
  }, [handleScan]);

  const handleClear = useCallback(() => {
    setBarcode('');
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* 条码输入 */}
        <View style={styles.scanArea}>
          <Text style={styles.scanIcon}>&#x1F4F7;</Text>
          <Text style={styles.scanTitle}>扫描条码</Text>
          <Text style={styles.scanSubtitle}>
            请将商品条码对准扫码框，或手动输入条码
          </Text>
        </View>

        {/* 手动输入区域 */}
        <View style={styles.inputArea}>
          <Text style={styles.inputLabel}>条码</Text>
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="手动输入条码"
              placeholderTextColor="#94A3B8"
              value={barcode}
              onChangeText={setBarcode}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="number-pad"
              returnKeyType="search"
              onSubmitEditing={handleManualSubmit}
            />
            {barcode.length > 0 && (
              <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
                <Text style={styles.clearButtonText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* 确认按钮 */}
        <TouchableOpacity
          style={[styles.confirmButton, !barcode.trim() && styles.confirmButtonDisabled]}
          onPress={handleManualSubmit}
          disabled={!barcode.trim()}
        >
          <Text style={styles.confirmButtonText}>确认并添加商品</Text>
        </TouchableOpacity>

        {/* 返回按钮 */}
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.cancelButtonText}>取消</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  scanArea: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  scanIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  scanTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 8,
  },
  scanSubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
  },
  inputArea: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1E293B',
  },
  clearButton: {
    padding: 8,
    marginLeft: 4,
  },
  clearButtonText: {
    fontSize: 14,
    color: '#94A3B8',
  },
  confirmButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelButtonText: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '500',
  },
});
