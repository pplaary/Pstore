/**
 * 轻量级 Toast 提示工具
 *
 * 跨平台 Toast 实现：Android 使用原生 ToastAndroid，iOS 使用 Animated 自定义组件。
 * 替代 Alert.alert 用于非阻塞的成功/失败提示。
 */

import { Platform, ToastAndroid, Alert } from 'react-native';

/**
 * 显示短时 Toast 提示。
 * Android：原生 ToastAndroid.show()
 * iOS：降级为 Alert.alert（后续可替换为自定义 Animated 组件）
 *
 * @param message 提示文本
 * @param duration 持续时间（Android: SHORT/LONG; iOS: 仅映射为 Alert 显示）
 */
export function showToast(
  message: string,
  duration: 'SHORT' | 'LONG' = 'SHORT',
): void {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid[duration]);
  } else {
    // iOS 降级方案：Alert
    Alert.alert('', message, [{ text: '确定' }], { cancelable: true });
  }
}
