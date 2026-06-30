# Phase 6 开发计划：AI 引擎

> 基于 spec-v4.5 §7（AI 引擎）、§7.4（保护机制与纠错）、§14.2（错误处理中 AI 部分）、architecture-mvp §5 L1 输入层
> 基准 commit: Phase 5 完成后的 HEAD
> 工作流: 按 commit 顺序执行 → 每个 commit 完成后 `git commit` → 进入下一个

---

## 提交信息格式

```
phase6-<n>: <简短描述>
```

---

## 文件清单

| Commit | 新建 | 修改 |
|--------|------|------|
| C1 AI 服务层 | `src/services/ai.ts`, `src/store/aiConfig.ts` | — |
| C2 AI 对话引擎 | `src/services/ai/chat.ts`, `src/services/ai/rag.ts`, `src/services/ai/cache.ts` | — |
| C3 UI 集成 | `src/components/AIChatBubble.tsx`, `src/components/ProductConfirmCard.tsx`, `src/components/NetworkIndicator.tsx` | `src/screens/HomeScreen.tsx`, `src/components/SyncStatusIcon.tsx` |
| C4 测试 | `src/__tests__/ai.test.ts`, `src/__tests__/ai-chat.test.ts`, `src/__tests__/ai-ui.test.ts` | — |

---

## 实现要点

### 通用约束（所有 commit 遵守）

1. spec-v4.5 §7（AI 引擎）、§7.4（保护机制）、§14.2（错误处理）是唯一权威，代码必须逐字对齐
2. AI 引擎是**可选增强通道**，不是运行前提。无 AI 配置或 API 不可达时自动降级为搜索模式，主流程不阻塞
3. AI API 调用复用 `vision.ts` 既有的 OpenAI 兼容格式 + AbortController 超时模式，超时不重复请求
4. AI Key 本地加密缓存（`expo-secure-store`），N1 短暂故障时可临时直连 AI
5. AI 回复格式无法解析时，降级为本地 FTS5 搜索，不重复请求 AI
6. AI 草稿卡 60 秒过期变灰，仍可点击确认——过期是视觉提示，不阻断交互
7. 相同输入 5 分钟内复用缓存，不重复调用 AI API
8. 中文数字预拦截在 AI 调用前完成（两瓶→2、半打→6），减少无效 API 调用
9. 错误处理遵循 §14.2：AI 超时/不可达静默降级至搜索模式；返回格式异常降级至 FTS5 搜索
10. AI 上下文最大保留最近 10 轮对话（每轮 = 用户输入 + AI 回复），搜索模式不适用此限制

---

## Commit 1: AI 服务层

### 1.1 `src/services/ai.ts` — AI API 客户端

```typescript
/** AI 文本模型配置 */
export interface AITextConfig {
  apiUrl: string;
  apiKey: string;
  textModel: string;
}

/** AI 结构化回复 */
export interface AIResponse {
  action: 'addToCart' | 'search' | 'ambiguous' | 'notFound';
  productId?: string;
  quantity: number;
  message: string;
  confidence: number;
}

/** AI 消息格式 */
export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const TIMEOUT_MS = 10_000; // spec §14.2: AI API 超时 10s
```

**导出函数**：

```typescript
/**
 * 构造 System Prompt。
 *
 * 注入上下文：购物车快照 + 当前模式（普通/管理）
 * 拼接 spec §7.2 的核心指令块。
 */
export function buildSystemPrompt(context: {
  cartSnapshot: string;
  mode: 'NORMAL' | 'ADMIN';
  productSummary: string;  // RAG Top 20 提取后的商品摘要
}): string

/**
 * 调用 AI 文本模型（OpenAI 兼容格式）。
 *
 * 超时 10s，失败返回 null。
 * 超时/网络错误 → 返回 null，由上层降级为 FTS5 搜索。
 */
export async function callAI(
  config: AITextConfig,
  messages: AIMessage[],
): Promise<string | null>

/**
 * 解析 AI 回复 JSON。
 *
 * 提取 { action, productId, quantity, message, confidence }。
 * 解析失败或缺少必填字段 → 返回 null。
 * productId 存在时进行本地校验（查 product 表确认 ID 存在且未删除）。
 */
export async function parseAIResponse(
  db: SQLiteDatabase,
  raw: string,
): Promise<AIResponse | null>

/**
 * 中文数字预拦截。
 *
 * 在用户输入中识别中文数字并替换为阿拉伯数字。
 * 两/二→2、三→3、...、十→10、半→0.5、打→12。
 * 返回处理后的文本和是否做过替换。
 */
export function interceptChineseNumerals(
  input: string,
): { text: string; replaced: boolean }
```

**实现细节**：

- `buildSystemPrompt` 输出的 System Prompt 必须包含 spec §7.2 的完整指令块，不得省略或改写
- `callAI` 使用 `AbortController` + 10s 超时，请求体格式与 `vision.ts` 保持一致
- `parseAIResponse` 先尝试 `JSON.parse`，再尝试从 markdown 代码块提取，均失败返回 null
- `interceptChineseNumerals` 使用正则匹配，映射表覆盖：零/一/两/二/三/四/五/六/七/八/九/十/半/打/百/千 + 组合形式（如「二十三」→23）
- AI Key 从 N1 `config/get` 获取，失败时从 SecureStore 中的本地加密缓存读取

### 1.2 `src/store/aiConfig.ts` — AI 配置状态管理

```typescript
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

interface AIConfigState {
  /** AI 是否已配置 */
  configured: boolean;
  /** API 是否可达 */
  reachable: boolean;
  /** 当前模式：chat（AI 驱动）或 search（FTS5 直搜） */
  mode: 'chat' | 'search';
  /** AI API 延迟色标：green / yellow / red / unknown */
  latencyTier: 'green' | 'yellow' | 'red' | 'unknown';
  /** 最近一次延迟（ms） */
  lastLatencyMs: number | null;

  // Actions
  /** App 启动时调用：检测 AI 配置可达性 */
  detectReachability: () => Promise<void>;
  /** 更新延迟色标 */
  updateLatency: (ms: number) => void;
  /** 设置 AI 配置（从 N1 或手动输入） */
  setAIConfig: (config: AITextConfig) => Promise<void>;
  /** 清除 AI 配置 */
  clearAIConfig: () => Promise<void>;
}
```

**检测逻辑**（对应 spec §7.1 降级逻辑）：

```
App 启动 → detectReachability()
  ├─ N1 在线 → 拉取 AI 配置 → HEAD /v1/models → 可达？
  │   ├─ 可达 → mode='chat', reachable=true
  │   └─ 不可达 → mode='search', reachable=false
  ├─ N1 离线 + SecureStore 有缓存 → HEAD 缓存地址 → 可达？
  │   ├─ 可达 → mode='chat', reachable=true
  │   └─ 不可达 → mode='search', reachable=false
  └─ 无配置 → mode='search', reachable=false, configured=false
```

- AI 配置本地加密缓存使用 `expo-secure-store`，键名 `pstore_ai_config`
- `updateLatency`：< 1s → green，1-3s → yellow，> 3s → red（§14.2 网络质量指示）
- 检测结果写入 Zustand store，UI 层订阅 `mode` 决定渲染路径

---

## Commit 2: AI 对话引擎

### 2.1 `src/services/ai/rag.ts` — RAG Top 20 检索增强

```typescript
/**
 * 构建 RAG 上下文：将用户输入作为查询词，FTS5 搜索商品库，
 * 取 Top 20 结果，构造为 AI 可理解的结构化文本摘要。
 *
 * Top K = 20（spec §7.4），不全量注入商品库。
 */

export interface RAGContext {
  /** 商品摘要文本（注入 System Prompt） */
  summary: string;
  /** 匹配到的商品 ID 列表（用于 productId 本地校验） */
  productIds: string[];
  /** 匹配到的商品数量 */
  totalHits: number;
}

/**
 * 从用户输入构建 RAG 上下文。
 * 内部调用 FTS5 searchProducts，取 Top 20，构造摘要。
 */
export async function buildRAGContext(
  db: SQLiteDatabase,
  userInput: string,
): Promise<RAGContext>
```

**实现细节**：

- 调用 `searchProducts(db, tokenizeChinese(userInput), { limit: 20 })`，复用 `src/db/search.ts` 的 FTS5 搜索
- 摘要格式：每行一个商品，格式 `ID:{id} | {name} | {spec} | ¥{price} | [{status}]`
- 仅注入在售（IN_SHOP）商品，缺货/待采不出现在 AI 候选中（spec §7.2 "仅在售商品可选"）
- `productIds` 列表用于 `parseAIResponse` 中的 productId 本地校验

### 2.2 `src/services/ai/chat.ts` — 对话上下文管理器

```typescript
import type { AIMessage } from '../ai';
import type { CartItem } from '../../store/cart';
import type { RAGContext } from './rag';

/** 一轮对话 */
interface ConversationRound {
  userInput: string;
  aiResponse: AIResponse;
}

const MAX_ROUNDS = 10;  // spec §7.2: 最大 10 轮，FIFO 溢出

/**
 * 对话管理器。
 *
 * 维护上下文窗口（最近 10 轮），构造完整的 messages 数组供 AI API 调用。
 * 购物车快照和模式随每次请求注入。
 */
export class ChatManager {
  private rounds: ConversationRound[] = [];

  /** 添加一轮对话，超出 10 轮时 FIFO 丢弃最旧轮次 */
  addRound(userInput: string, aiResponse: AIResponse): void;

  /** 获取最近 N 轮对话（默认 10 轮） */
  getRecentRounds(count?: number): ConversationRound[];

  /** 清空对话历史 */
  clear(): void;

  /**
   * 构造完整的 messages 数组：
   *   [system] ← buildSystemPrompt(cart, mode, rag.summary)
   *   [user_1, assistant_1, ..., user_N, assistant_N]
   *   [user_current]
   */
  buildMessages(
    userInput: string,
    cartSnapshot: string,
    mode: 'NORMAL' | 'ADMIN',
    rag: RAGContext,
  ): AIMessage[];
}
```

**实现细节**：

- `rounds` 数组末尾追加，长度 > 10 时 `shift()` 移除最旧
- 每"轮"定义为一次用户输入 + AI 回复对（spec §7.2 确定性补丁）
- `buildMessages` 遍历 `rounds` 转换为 `{ role: 'user', content }` / `{ role: 'assistant', content: JSON.stringify(aiResponse) }`
- 搜索模式时不使用 ChatManager，直接走 FTS5 搜索

### 2.3 `src/services/ai/cache.ts` — 输入缓存与草稿管理

```typescript
/**
 * 相同输入 5 分钟内复用缓存（spec §7.4）。
 * 草稿卡 60 秒过期变灰（视觉提示，不阻断交互）。
 */

interface CacheEntry {
  response: AIResponse;
  createdAt: number;
}

interface DraftEntry {
  response: AIResponse;
  createdAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;  // 5 分钟
const DRAFT_GREY_MS = 60 * 1000;     // 60 秒

export class AIResponseCache {
  private cache: Map<string, CacheEntry> = new Map();
  private drafts: Map<string, DraftEntry> = new Map();

  /** 检查缓存：命中且未过期返回 AIResponse，否则返回 null */
  get(userInput: string): AIResponse | null;

  /** 存入缓存 */
  set(userInput: string, response: AIResponse): void;

  /** 存入草稿 */
  setDraft(userInput: string, response: AIResponse): void;

  /** 获取草稿及是否已过期（60s） */
  getDraft(userInput: string): { response: AIResponse; expired: boolean } | null;

  /** 清理过期条目 */
  evict(): void;
}
```

**实现细节**：

- 缓存 key = 用户原始输入（trim 后，不含前后空格差异）
- `get` 检查 `Date.now() - entry.createdAt > CACHE_TTL_MS`，过期返回 null
- `getDraft` 返回 response 和 `expired` 布尔值，UI 据此决定是否灰色显示
- `evict` 在每次 `set` 时自动调用，清理所有过期条目

---

## Commit 3: UI 集成

### 3.1 `src/screens/HomeScreen.tsx` (修改) — 双模式适配

**当前状态**：HomeScreen 为纯搜索模式（搜索框 → FTS5 → 商品列表）。

**修改目标**：根据 `aiConfig.mode` 动态切换两种行为：

```
aiConfig.mode === 'chat'  →  聊天模式
  ├─ 底部输入栏显示语音按钮 + 输入框 + 相机按钮
  ├─ 输入框 placeholder: 「说"可乐多少钱"」
  ├─ 发送后：用户消息气泡 → loading → AI 回复气泡 + 商品确认卡片
  └─ 确认卡片 60s 后变灰，仍可点击

aiConfig.mode === 'search'  →  搜索模式（保持现有行为）
  ├─ 底部输入栏仅显示输入框 + 相机按钮（无语音）
  ├─ 输入框 placeholder: 「搜索商品名…」
  └─ 输入 → FTS5 搜索 → 商品列表
```

**关键改动**：

| 改动点 | 说明 |
|--------|------|
| 聊天区域 | 新增 `ScrollView` 或 `FlatList` 渲染消息列表，替代原有搜索结果的直接展示 |
| AI 消息流 | 用户输入 → 调 `interceptChineseNumerals` → 检查缓存 → 缓存命中直接渲染；未命中 → `buildRAGContext` → `ChatManager.buildMessages` → `callAI` → `parseAIResponse` → 渲染气泡+卡片 |
| AI 失败降级 | `callAI` 返回 null 或 `parseAIResponse` 返回 null → 降级为 FTS5 搜索，通知用户「AI 暂不可用，已切换为本地搜索」|
| 中文数字预拦截 | 每次用户输入先过 `interceptChineseNumerals`，替换后如果 `replaced=true`，在用户气泡中展示替换后的文本 |
| 网络质量指示 | Header 右侧 SyncStatusIcon 旁新增延迟色标圆点（绿/黄/红）|

### 3.2 `src/components/AIChatBubble.tsx` (新建)

```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

/** AI 会话气泡组件 */
export function AIChatBubble({ role, content, timestamp }: Props): JSX.Element;
```

**样式规范**（对齐 spec §3.1 色彩 Token）：

| 气泡类型 | 背景色 | 文字色 | 对齐 |
|---------|-------|-------|------|
| 用户 | `#D1FAE5` (UserBubble) | `#065F46` (UserBubbleText) | 右对齐 |
| AI 助手 | `#F1F5F9` (SurfaceVariant) | `#1E293B` (TextPrimary) | 左对齐 |

- 气泡圆角 12px，最大宽度 80%
- 显示时间戳（小时:分钟），字号 11sp，颜色 TextSecondary
- AI 气泡下方显示「AI 生成，请确认」提示文字（字号 11sp，TextSecondary）

### 3.3 `src/components/ProductConfirmCard.tsx` (新建)

```typescript
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Product } from '../db/types';

interface Props {
  product: Product;
  quantity: number;
  confidence: number;
  expired: boolean;   // 60s 过期后为 true，卡片变灰
  onAddToCart: (product: Product, quantity: number) => void;
  onIgnore: () => void;
}

/** AI 识别结果确认卡片 */
export function ProductConfirmCard(props: Props): JSX.Element;
```

**样式规范**：

- 正常态：`#FFFFFF` 背景 + Primary `#2563EB` 边框（2px），显示缩略图 + 名称 + 规格 + 单价 + 数量
- 过期态（60s）：整体 opacity 0.5，背景 `#F1F5F9`，边框 `#94A3B8`
- 底部两个按钮：[加购]（Primary 实心按钮）[忽略]（灰色文字按钮）
- 置信度展示：≥ 0.8 显示「高置信度」绿色标签，0.5-0.8 显示黄色，< 0.5 显示红色
- 数量 > 1 时，卡片标题显示「{name} ×{quantity}」

**交互**：

- [加购] 调用 `onAddToCart(product, quantity)` → Toast "{name} 已加购"
- [忽略] 调用 `onIgnore()` → 卡片移除
- 过期态卡片仍可点击 [加购] 和 [忽略]，过期仅为视觉提示

### 3.4 `src/components/NetworkIndicator.tsx` (新建)

```typescript
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAIConfigStore } from '../store/aiConfig';

/** 网络质量指示器：AI 延迟色标圆点 */
export function NetworkIndicator(): JSX.Element;
```

**样式规范**（spec §14.2 网络质量指示）：

| 延迟 | 色标 | 色值 |
|------|------|------|
| < 1s | 绿色 | `#16A34A` |
| 1-3s | 黄色 | `#F59E0B` |
| > 3s | 红色 | `#EF4444` |
| 未知 | 灰色 | `#94A3B8` |

- 8px 实心圆点，显示在 SyncStatusIcon 旁边
- 仅在 `aiConfig.mode === 'chat'` 时渲染
- 无 AI 时隐藏

### 3.5 `src/components/SyncStatusIcon.tsx` (修改)

在现有逻辑基础上增加 AI 状态标识：

- 当 `aiConfig.mode === 'chat'` 且 `aiConfig.reachable === true` → SyncStatusIcon 右侧附加 `<NetworkIndicator />`
- 延迟色标数据从 `useAIConfigStore` 的 `latencyTier` 读取

---

## Commit 4: 测试

### 4.1 `src/__tests__/ai.test.ts` (新建)

测试 AI 服务层：

- `buildSystemPrompt` 输出的 System Prompt 包含 spec §7.2 全部关键段落
- `buildSystemPrompt` 正确注入购物车快照和模式上下文
- `interceptChineseNumerals('两瓶可乐')` → `{ text: '2瓶可乐', replaced: true }`
- `interceptChineseNumerals('半打鸡蛋')` → `{ text: '6鸡蛋', replaced: true }`
- `interceptChineseNumerals('二十三瓶')` → `{ text: '23瓶', replaced: true }`
- `interceptChineseNumerals('普通可乐')` → `{ text: '普通可乐', replaced: false }`
- `parseAIResponse` 正确解析标准 JSON 回复
- `parseAIResponse` 对缺少必填字段的 JSON 返回 null
- `parseAIResponse` 对无法解析的文本返回 null
- `parseAIResponse` 对不存在的 productId 返回 null
- AI 配置正确存储和读取于 SecureStore

### 4.2 `src/__tests__/ai-chat.test.ts` (新建)

测试对话引擎：

- `ChatManager` 添加 12 轮后仅保留最近 10 轮（FIFO 溢出）
- `ChatManager.buildMessages` 返回的 messages 数组格式正确（system → N 轮对话 → 当前 user）
- `ChatManager.clear` 清空全部历史
- RAG `buildRAGContext` 返回 Top 20 商品摘要，ID 列表长度 ≤ 20
- RAG 摘要仅包含 IN_SHOP 商品，不含缺货/待采
- `AIResponseCache.set` + `get` 5 分钟内命中
- `AIResponseCache.get` 5 分钟后返回 null
- `AIResponseCache.getDraft` 60 秒内返回 `expired: false`
- `AIResponseCache.getDraft` 60 秒后返回 `expired: true`
- `AIResponseCache.evict` 清理过期条目

### 4.3 `src/__tests__/ai-ui.test.ts` (新建)

集成测试：

- `aiConfig.mode === 'search'` 时 HomeScreen 渲染搜索模式 UI
- `aiConfig.mode === 'chat'` 时 HomeScreen 渲染聊天模式 UI
- 聊天模式下语音按钮可见，搜索模式下隐藏
- AI 回复成功 → 用户气泡 + AI 气泡 + 商品确认卡片渲染正确
- AI 回复失败 → 降级为 FTS5 搜索结果
- ProductConfirmCard 正常态和过期态样式差异正确
- [加购] 按钮触发 addToCart 且 Toast 通知
- [忽略] 按钮移除卡片
- NetworkIndicator 颜色随 latencyTier 变化正确
- 中文数字预拦截后用户气泡展示替换后文本

---

## 验收标准

### C1: AI 服务层

| # | 标准 |
|---|------|
| 1 | `buildSystemPrompt` 逐字包含 spec §7.2 的 System Prompt 核心指令 |
| 2 | `buildSystemPrompt` 注入购物车快照（商品名+数量列表）和当前模式 |
| 3 | `callAI` 使用 AbortController + 10s 超时，与 `vision.ts` 调用模式一致 |
| 4 | `parseAIResponse` 正确解析 `{action, productId, quantity, message, confidence}` |
| 5 | `parseAIResponse` 解析失败或 productId 不存在时返回 null |
| 6 | `interceptChineseNumerals` 覆盖所有常用中文数字（零~十、半、打、百）及组合形式 |
| 7 | AI 配置本地加密缓存于 SecureStore（`pstore_ai_config`） |
| 8 | `detectReachability()` 按 N1 → 本地缓存 → 无配置三级降级逻辑正确切换 |

### C2: AI 对话引擎

| # | 标准 |
|---|------|
| 1 | ChatManager 正确维护 10 轮 FIFO 上下文窗口 |
| 2 | `buildMessages` 输出完整的 messages 数组（system + history + current） |
| 3 | `buildRAGContext` 返回 Top 20 商品摘要，仅含 IN_SHOP 商品 |
| 4 | `AIResponseCache` 5 分钟相同输入命中缓存，超时失效 |
| 5 | 草稿卡 60 秒后 `expired=true` |
| 6 | 空商品库时 RAG 摘要显示「商品库为空」 |

### C3: UI 集成

| # | 标准 |
|---|------|
| 1 | 聊天模式：发送文字 → 用户气泡 + AI 气泡 + ProductConfirmCard |
| 2 | 搜索模式：输入文字 → FTS5 搜索 → 商品列表（保持现有行为不变） |
| 3 | AI 不可达时静默降级为搜索模式，不弹窗 |
| 4 | AI 回复解析失败时降级为 FTS5 搜索，用户无感知切换 |
| 5 | ProductConfirmCard 过期后（60s）灰色显示，加购/忽略按钮仍可操作 |
| 6 | 中文数字预拦截替换后用户气泡展示替换文本 |
| 7 | NetworkIndicator 色标随 AI 延迟正确变化（绿/黄/红） |
| 8 | 语音按钮仅在聊天模式显示（预留，功能由 Phase 7 实现） |
| 9 | 购物车更新后，下一轮 AI 请求的 System Prompt 反映最新购物车快照 |

### C4: 测试

| # | 标准 |
|---|------|
| 1 | 所有单元测试通过（ai / ai-chat / ai-ui 三套） |
| 2 | 测试覆盖核心路径 + 边界条件（解析失败/超时/空商品库/上下文溢出/缓存过期） |

---

## 与其他 Phase 的关系

| 依赖方向 | 说明 |
|----------|------|
| Phase 5 → Phase 6 | WebDAV 凭据加密模式（`expo-secure-store`）被 AI Key 本地缓存复用 |
| Phase 2-3 → Phase 6 | FTS5 搜索 (`searchProducts`) 作为 RAG 底层和 AI 降级兜底 |
| Phase 4 → Phase 6 | N1 `config/get` 端点获取 AI 配置（`apiUrl`, `apiKey`, `textModel`） |
| Phase 6 → Phase 7 | AI 引擎完成后，语音输入（§9）直接复用聊天模式的消息管道 |
| Phase 6 独立 | AI 服务层、对话引擎、缓存管理均为独立模块，不与 WebDAV/N1 同步耦合 |

---

## 技术风险与注意事项

| 风险 | 缓解 |
|------|------|
| AI API 返回格式不稳定 | `parseAIResponse` 做多重容错（JSON.parse → Markdown 提取 → null），失败时静默降级 |
| AI 上下文超限（商品摘要过长） | RAG Top 20 硬限制 + 每行商品摘要 ≤ 80 字符 |
| 10 轮 FIFO 溢出时丢失早期上下文 | 符合 spec 设计，单店查价场景早期轮次参考价值低 |
| AI Key 泄露风险 | 使用 `expo-secure-store` 加密存储，与 WebDAV 凭据走同一安全通道 |
| RAG 搜索结果为空 | 摘要设为「商品库中暂无匹配商品」，AI 据此回复 notFound |
