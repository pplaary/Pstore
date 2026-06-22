/**
 * PIN 弹窗组件
 *
 * - 4-6 位数字输入
 * - "确认" / "取消" 按钮
 * - 错误提示红字 "PIN 错误，请重试"
 * - 验证通过 → mode.enterManagement()
 */

import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Keyboard,
} from 'react-native';
import { useModeStore } from '../store/mode';
import { usePinStore } from '../store/pin';
import { useTheme } from '../theme/ThemeContext';

interface PinModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function PinModal({ visible, onClose, onSuccess }: PinModalProps) {
  const { theme } = useTheme();
  const { colors, scale } = theme;
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const { isPinSet, setPin: storeSetPin, verifyPin } = usePinStore();
  const { enterManagement } = useModeStore();

  const styles = useMemo(() => createStyles(colors, scale), [colors, scale]);

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
            placeholderTextColor={colors.text.hint}
            onSubmitEditing={handleConfirm}
            accessibilityLabel="输入PIN"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} accessibilityLabel="取消PIN输入" accessibilityRole="button">
              <Text style={styles.cancelBtnText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, verifying && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={verifying}
              accessibilityLabel="确认PIN"
              accessibilityRole="button"
            >
              <Text style={styles.confirmBtnText}>{verifying ? '验证中...' : '确认'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['theme']['colors'], scale: number) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    container: {
      width: '80%',
      backgroundColor: colors.bg.card,
      borderRadius: 16 * scale,
      padding: 24 * scale,
      alignItems: 'center',
    },
    title: {
      fontSize: 20 * scale,
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: 8 * scale,
    },
    subtitle: {
      fontSize: 14 * scale,
      color: colors.text.secondary,
      marginBottom: 20 * scale,
      textAlign: 'center',
    },
    input: {
      width: '100%',
      height: 48 * scale,
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: 10 * scale,
      paddingHorizontal: 16 * scale,
      fontSize: 24 * scale,
      textAlign: 'center',
      letterSpacing: 8 * scale,
      color: colors.text.primary,
    },
    error: {
      color: colors.brand.danger,
      fontSize: 13 * scale,
      marginTop: 8 * scale,
      marginBottom: 4 * scale,
    },
    buttonRow: {
      flexDirection: 'row',
      width: '100%',
      gap: 12 * scale,
      marginTop: 20 * scale,
    },
    cancelBtn: {
      flex: 1,
      paddingVertical: 12 * scale,
      borderRadius: 10 * scale,
      backgroundColor: colors.bg.primary,
      alignItems: 'center',
    },
    cancelBtnText: {
      fontSize: 15 * scale,
      color: colors.text.secondary,
      fontWeight: '600',
    },
    confirmBtn: {
      flex: 1,
      paddingVertical: 12 * scale,
      borderRadius: 10 * scale,
      backgroundColor: colors.brand.primary,
      alignItems: 'center',
    },
    confirmBtnDisabled: {
      opacity: 0.6,
    },
    confirmBtnText: {
      fontSize: 15 * scale,
      color: colors.text.inverse,
      fontWeight: '600',
    },
  });
}
