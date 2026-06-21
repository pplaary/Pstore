/**
 * PIN 弹窗组件
 *
 * - 4-6 位数字输入
 * - "确认" / "取消" 按钮
 * - 错误提示红字 "PIN 错误，请重试"
 * - 验证通过 → mode.enterManagement()
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Keyboard,
} from 'react-native';
import { useModeStore } from './mode';
import { usePinStore } from './pin';

interface PinModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function PinModal({ visible, onClose, onSuccess }: PinModalProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const { isPinSet, setPin: storeSetPin, verifyPin } = usePinStore();
  const { enterManagement } = useModeStore();

  React.useEffect(() => {
    if (visible) {
      setPin('');
      setError('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible]);

  const handleConfirm = async () => {
    Keyboard.dismiss();
    setError('');

    if (pin.length < 4 || pin.length > 6) {
      setError('PIN 需为 4-6 位数字');
      return;
    }

    setVerifying(true);
    try {
      if (!isPinSet) {
        await storeSetPin(pin);
        enterManagement();
        onSuccess();
      } else {
        const valid = await verifyPin(pin);
        if (valid) {
          enterManagement();
          onSuccess();
        } else {
          setError('PIN 错误，请重试');
          setPin('');
        }
      }
    } catch {
      setError('验证失败，请重试');
    } finally {
      setVerifying(false);
    }
  };

  const handleClose = () => {
    setPin('');
    setError('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>{isPinSet ? '请输入 PIN' : '请设置 PIN'}</Text>
          <Text style={styles.subtitle}>
            {isPinSet ? '输入 PIN 进入管理模式' : '设置 4-6 位 PIN 保护管理模式'}
          </Text>

          <TextInput
            ref={inputRef}
            style={styles.input}
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            maxLength={6}
            secureTextEntry
            placeholder="••••"
            placeholderTextColor="#94A3B8"
            onSubmitEditing={handleConfirm}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
              <Text style={styles.cancelBtnText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, verifying && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={verifying}
            >
              <Text style={styles.confirmBtnText}>{verifying ? '验证中...' : '确认'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    height: 48,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 8,
    color: '#1E293B',
  },
  error: {
    color: '#DC2626',
    fontSize: 13,
    marginTop: 8,
    marginBottom: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  confirmBtnText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
