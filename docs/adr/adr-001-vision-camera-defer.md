# ADR-001: react-native-vision-camera 迁移延期

**日期**: 2026-07-01

## 背景

spec-v4 原计划将扫码模块从 `expo-camera` 迁移到 `react-native-vision-camera`（配合 MLKit 原生扫码引擎），但此迁移涉及：
- 原生模块重新链接
- Expo 插件配置
- 扫码逻辑重写

## 决策

**不迁移，保持在 expo-camera**。

## 理由

1. expo-camera 当前扫码功能稳定，满足单店单人场景
2. vision-camera 迁移需额外原生配置和测试，当前无业务收益
3. 优先修复 P0/P1 问题，迁移作为低优先级优化

## 状态

⏱ 延期（开放、低优先级，后续分阶段评估）