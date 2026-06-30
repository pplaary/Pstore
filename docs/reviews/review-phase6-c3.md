# Phase 6-3 AI 引擎/UI 审校报告

> 审校基准: `spec-v4.md` §7（AI 引擎）、§7.4（保护机制）
> 审校范围: `src/screens/HomeScreen.tsx`、`src/components/NetworkIndicator.tsx`、`src/components/ProductConfirmCard.tsx`、`src/components/SyncStatusIcon.tsx`
> 审校日期: 2026-06-22

---

## 审校摘要

| 级别 | 数量 | 说明 |
|------|------|------|
| P0 | 6 | 功能缺陷或运行时风险，必须修复 |
| P1 | 0 | — |

---

## P0（功能缺陷/运行时风险）

### P0-1. HomeScreen Product 类型从错误模块导入

**影响文件**: `src/screens/HomeScreen.tsx` L49

**问题**: `import type { Product, ProductStatus, AIResponse } from '../services/ai'`  
`src/services/ai.ts` 只导出 `AITextConfig`、`AIResponse`、`AIMessage`，不导出 `Product`/`ProductStatus`。  
`Product` 和 `ProductStatus` 定义在 `src/db/types.ts`。

**影响**: TypeScript 编译时类型不匹配（`AIResponse` 能解析，`Product`/`ProductStatus` 找不到定义）。

**修复**: 拆分为两个 import：
```ts
import type { AIResponse } from '../services/ai';
import type { Product, ProductStatus } from '../db/types';
```

---

### P0-2. NetworkIndicator 缺失 Text 导入

**影响文件**: `src/components/NetworkIndicator.tsx` L48

**问题**: 使用了 `<Text>` 组件（延迟文字），但 import 只有 `{ View, StyleSheet }`，未导入 `Text`。

**影响**: 运行时 ReferenceError: Text is not defined。

**修复**: `import { View, Text, StyleSheet } from 'react-native'`

---

### P0-3. NetworkIndicator 双重渲染

**影响文件**: `src/components/SyncStatusIcon.tsx` L60 + `src/screens/HomeScreen.tsx` L189

**问题**: `NetworkIndicator` 在两个地方被渲染：
1. `SyncStatusIcon` 内部：`{aiMode === 'chat' && aiReachable && <NetworkIndicator />}`
2. `HomeScreen` headerRight：`{isChatMode && <NetworkIndicator />}`

**影响**: 聊天模式下屏幕上出现两个独立的网络延迟指示器，视觉冗余且各自独立轮询状态。

**修复**: 移除 `HomeScreen` headerRight 中的 `<NetworkIndicator />`，保留 `SyncStatusIcon` 内部的实例。

---

### P0-4. ProductConfirmCard 缺少商品缩略图

**影响文件**: `src/components/ProductConfirmCard.tsx`

**问题**: 确认卡片只显示文字信息（名称/规格/价格），未展示商品图片。

**影响**: 用户无法通过视觉确认 AI 识别的商品是否正确，加购前缺少视觉校验环节。

**修复**: 在 infoRow 中添加缩略图区域（`product.imageUri`），圆形裁剪 48×48，无图时显示占位符。

---

### P0-5. 加购后缺少 Toast 反馈

**影响文件**: `src/screens/HomeScreen.tsx`

**问题**: `handleDraftAddToCart`（L375）和 `handleAddToCart`（L196）执行加购后无任何用户反馈。

**影响**: 用户无法确认加购是否成功，体验不完整。

**修复**: 使用 `showToast` 在加购成功后弹出提示（如 `"已加入购物车：¥xx"`）。

---

### P0-6. 预拦截后缓存 key 与 RAG 输入未统一

**影响文件**: `src/screens/HomeScreen.tsx` L280-309

**问题**:
```ts
const { text: processedText, replaced } = interceptChineseNumerals(rawInput);
// ...
const cached = aiCacheRef.current?.get(displayText);   // 用 processedText
// ...
const rag = await buildRAGContext(db, rawInput);         // 用 rawInput
```

缓存 key 是 `processedText`（中文数字已替换），但 RAG 查询用的是 `rawInput`（未替换）。
若用户输入「两瓶可乐」，缓存 key 为「2瓶可乐」，但 RAG 查不到匹配（数据库存的是阿拉伯数字）。

**影响**: 预拦截有效时缓存命中但 RAG 结果不匹配，或反之，导致 AI 回复不准确。

**修复**: RAG 查询和 buildMessages 中的 userInput 统一使用 `processedText`。

---

## 逐文件审校明细

### src/screens/HomeScreen.tsx

| 检查项 | 预期 | 实际 | 结果 |
|--------|------|------|------|
| Product 类型来源 | `../db/types` | `../services/ai` | P0-1 |
| NetworkIndicator 单例 | headerRight 仅一个实例 | SyncStatusIcon + headerRight 各一个 | P0-3 |
| 加购 Toast | 成功提示 | 无反馈 | P0-5 |
| 缓存/RAG 输入统一 | processedText | 缓存=processedText, RAG=rawInput | P0-6 |

### src/components/NetworkIndicator.tsx

| 检查项 | 预期 | 实际 | 结果 |
|--------|------|------|------|
| Text 导入 | 导入 Text | 未导入 | P0-2 |

### src/components/ProductConfirmCard.tsx

| 检查项 | 预期 | 实际 | 结果 |
|--------|------|------|------|
| 商品缩略图 | 显示 imageUri | 仅文字 | P0-4 |

### src/components/SyncStatusIcon.tsx

| 检查项 | 预期 | 实际 | 结果 |
|--------|------|------|------|
| NetworkIndicator 实例 | 唯一 | 与 HomeScreen headerRight 重复 | P0-3（关联） |

---

## 修复计划

1. 拆分 `../services/ai` 为 `AIResponse` + `../db/types` 的 `Product/ProductStatus`
2. NetworkIndicator：补 `Text` 导入 + 移除 HomeScreen headerRight 中的冗余实例
3. ProductConfirmCard：添加缩略图区域（48×48 圆形，fallback 占位符）
4. HomeScreen：`handleDraftAddToCart` 和 `handleAddToCart` 加 `showToast`
5. HomeScreen：RAG 查询和 buildMessages 统一使用 `processedText`
