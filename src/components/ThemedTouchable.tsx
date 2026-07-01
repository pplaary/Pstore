/**
 * ThemedTouchable — 主题感知的可触控包装组件
 *
 * 在 Care 模式下自动应用 minTouchTarget（48dp）约束，
 * 确保所有可交互元素满足无障碍最小触控尺寸。
 */

import React from 'react';
import { TouchableOpacity, type TouchableOpacityProps, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

type Props = TouchableOpacityProps & {
  /** 是否应用最小触控约束，默认为 true */
  enforceMinTouch?: boolean;
};

export function ThemedTouchable({ style, enforceMinTouch = true, ...props }: Props) {
  const { theme } = useTheme();

  const combinedStyle: StyleProp<ViewStyle> =
    enforceMinTouch && theme.minTouchTarget > 0
      ? [
          {
            minWidth: theme.minTouchTarget,
            minHeight: theme.minTouchTarget,
            justifyContent: 'center' as const,
            alignItems: 'center' as const,
          } as ViewStyle,
          style as ViewStyle,
        ]
      : style;

  return <TouchableOpacity style={combinedStyle} {...props} />;
}