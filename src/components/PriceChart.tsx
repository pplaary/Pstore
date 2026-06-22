/**
 * 价格历史折线图（纯 React Native View 实现）
 *
 * - 不引入第三方图表库
 * - 纯绝对定位：圆点（width:8/h:8/borderRadius:4）+ 旋转连线 + 网格线 + X/Y 标签
 * - 需要至少 2 条历史记录才渲染
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { PriceHistory } from '../db/types';

// ==================== Props ====================

interface PriceChartProps {
  history: PriceHistory[];
  width?: number;
  height?: number;
}

// ==================== 组件 ====================

export function PriceChart({ history, width, height }: PriceChartProps) {
  const { theme } = useTheme();
  const { colors, scale } = theme;

  const chartWidth = width ?? Dimensions.get('window').width - 48;
  const chartHeight = height ?? 160;

  if (history.length < 2) return null;

  const padL = 44;
  const padR = 12;
  const padT = 8;
  const padB = 32;
  const plotW = chartWidth - padL - padR;
  const plotH = chartHeight - padT - padB;

  // 价格范围（10% padding）
  const prices = history.map((h) => h.newPrice);
  let lo = Math.min(...prices);
  let hi = Math.max(...prices);
  if (lo === hi) {
    lo = Math.max(0, lo * 0.9);
    hi = hi * 1.1;
  }
  const span = hi - lo || 1;
  const loP = lo - span * 0.1;
  const hiP = hi + span * 0.1;
  const fullRange = hiP - loP;

  // 每个数据点坐标（相对于 plotArea 左上角）
  const pts = history.map((h, i) => ({
    x: (i / (history.length - 1)) * plotW,
    y: plotH - ((h.newPrice - loP) / fullRange) * plotH,
    price: h.newPrice,
    date: h.changedAt.slice(5, 10),
  }));

  // 网格线 Y 位置
  const gridYs = [0, plotH / 2, plotH];

  // X 标签步长（最多 8 个）
  const labelStep = history.length <= 8 ? 1 : Math.ceil(history.length / 8);

  const s = useMemo(() => createStyles(colors, scale), [colors, scale]);

  return (
    <View style={[s.container, { width: chartWidth, height: chartHeight }]}>
      {/* Y 轴价格标签 */}
      <View style={[s.yLabels, { top: padT, height: plotH }]}>
        <Text style={[s.yText, { color: colors.text.hint }]}>¥{hiP.toFixed(0)}</Text>
        <Text style={[s.yText, { color: colors.text.hint }]}>¥{((hiP + loP) / 2).toFixed(0)}</Text>
        <Text style={[s.yText, { color: colors.text.hint }]}>¥{loP.toFixed(0)}</Text>
      </View>

      {/* 绘图区域 */}
      <View style={[s.plot, { width: plotW, height: plotH, marginLeft: padL, marginTop: padT }]}>
        {/* 水平网格线 */}
        {gridYs.map((y, i) => (
          <View key={`g${i}`} style={[s.gridLine, { top: y, width: plotW }]} />
        ))}

        {/* 折线 + 圆点 + X 标签 */}
        {pts.map((pt, i) => (
          <React.Fragment key={`pt${i}`}>
            {/* 连线 */}
            {i > 0 && (
              <Connector
                x1={pts[i - 1].x}
                y1={pts[i - 1].y}
                x2={pt.x}
                y2={pt.y}
                color={colors.brand.primary}
              />
            )}
            {/* 圆点 */}
            <View
              style={[
                s.dot,
                {
                  left: pt.x - 4,
                  top: pt.y - 4,
                  backgroundColor: colors.brand.primary,
                },
              ]}
            />
            {/* X 轴日期 */}
            {i % labelStep === 0 && (
              <Text
                style={[s.xLabel, { left: pt.x - 12, top: plotH + 4, color: colors.text.hint }]}
                numberOfLines={1}
              >
                {pt.date}
              </Text>
            )}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

// ==================== 连线（旋转 View） ====================

function Connector({
  x1,
  y1,
  x2,
  y2,
  color,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  return (
    <View
      style={{
        position: 'absolute',
        left: x1,
        top: y1,
        width: len,
        height: 1.5,
        borderRadius: 0.75,
        backgroundColor: color,
        opacity: 0.5,
        transform: [{ rotate: `${angle}deg` }],
        transformOrigin: '0 50%',
      }}
    />
  );
}

// ==================== 样式 ====================

function createStyles(colors: ReturnType<typeof useTheme>['theme']['colors'], scale: number) {
  return StyleSheet.create({
    container: {
      position: 'relative',
    },
    yLabels: {
      position: 'absolute',
      left: 0,
      width: 40,
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      paddingRight: 4,
    },
    yText: {
      fontSize: 10 * scale,
    },
    plot: {
      position: 'relative',
    },
    gridLine: {
      position: 'absolute',
      left: 0,
      height: 1,
      backgroundColor: colors.border.light,
    },
    dot: {
      position: 'absolute',
      width: 8,
      height: 8,
      borderRadius: 4,
      shadowColor: '#00000030',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.15,
      shadowRadius: 2,
      elevation: 2,
    },
    xLabel: {
      position: 'absolute',
      width: 24,
      fontSize: 10 * scale,
      textAlign: 'center',
    },
  });
}
