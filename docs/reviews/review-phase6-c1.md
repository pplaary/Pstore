# Phase 6-1 AI 服务层 — 审校报告

> 审校基准: `spec-v4.md` §7（AI 引擎）、§7.4（保护机制）、§14.2（错误处理）、`plan-phase6.md`
> 审校范围: `src/services/ai.ts`、`src/store/aiConfig.ts`
> 审校日期: 2026-06-22

---

## 审校摘要

| 级别 | 数量 | 说明 |
|------|------|------|
| P0 | 3 | 功能缺陷或与 spec 冲突，必须修复 |
| P1 | 3 | 写法不规范但功能正常或缺失校验 |
| P2 | 2 | 优化建议 |

---

## P0（功能缺陷）

### P0-1. interceptChineseNumerals 组合数字仅返回前缀值，不做数值合成

**影响文件**: `src/services/ai.ts` L324-345

**问题**: 正则匹配最长前缀后直接返回前缀映射值，不做后续数字合成。导致：
- 「二十三」→ 匹配「二十」→ 返回 "20"，正确应为 "23"
- 「半打」→ 匹配「半」→ 返回 "0.5"，正确应为 "6"（0.5×12）

**原因**: `replace` 回调仅做单次映射查找，没有处理「前缀 + 单位字」的加法/乘法合成逻辑。

**修复建议**: 改为两阶段处理：
1. 先用正则扫描所有匹配位置
2. 对每个匹配，检查后续字符是否为单位字（十/百/千/打），做合成计算

---

### P0-2. 缺失 11-19 组合前缀映射

**影响文件**: `src/services/ai.ts` L278-301 (`COMBINATION_PREFIXES`)

**问题**: `COMBINATION_PREFIXES` 仅包含「二十」「三十」…「九千」，缺失「十一」到「十九」的映射。

**影响**: 「十一瓶」「十五个」等 11-19 的中文数字无法正确转换为阿拉伯数字。

**修复建议**: 补充「十一」到「十九」的映射（11-19）。

---

### P0-3. 缺失百/千独立单位映射

**影响文件**: `src/services/ai.ts` L243-271 (`NUMERAL_MAP`)

**问题**: `NUMERAL_MAP` 包含「半」「打」但缺少「百」「千」。虽然 `COMBINATION_PREFIXES` 有「一百」「一千」等，但：
- 单独的「百」「千」无法被替换
- 「三百」能匹配，但「三百零五」的「百」已包含在前缀中，逻辑正确但不完整

**影响**: 「五百」「一千二百」等已有前缀覆盖，但「万」完全缺失（`COMBINATION_PREFIXES` 也没有）。

**修复建议**: 在 `NUMERAL_MAP` 补充「百」「千」的映射（100, 1000），并在 `COMBINATION_PREFIXES` 补充万级前缀。

---

## P1（写法不规范/缺失校验）

### P1-1. timeout 泄漏：网络异常时 clearTimeout 可能未执行

**影响文件**: `src/services/ai.ts` L88-131 (`callAI`)、`src/store/aiConfig.ts` L177-197 (`checkAIReachable`)

**问题**: 两处均使用 `try { setTimeout; await fetch; clearTimeout; } catch { ... }` 模式。如果 `fetch` 抛出同步异常（如 `TypeError`），`clearTimeout` 在 `try` 块内，会执行；但如果后续代码（如 `response.json()`）抛出，`clearTimeout` 已执行过。然而，更安全的做法是 `try/finally` 确保任何路径都清理定时器。

**实际风险**: 当前 `callAI` 中 `clearTimeout` 在 `await fetch(...)` 之后、`if (!response.ok)` 之前——若 fetch 抛异常，catch 块直接 return null，clearTimeout 未执行。同理 `checkAIReachable`。

**修复建议**: 将 `clearTimeout` 移入 `finally` 块。

---

### P1-2. addToCart 缺少对 AI 返回 productId 的强制校验

**影响文件**: `src/services/ai.ts` L165-180 (`parseAIResponse`)、`src/screens/HomeScreen.tsx`、`src/screens/ScanScreen.tsx`

**问题**: `isValidAIResponse` 中 `productId` 为可选（`obj.productId !== undefined`），但当 `action === 'addToCart'` 时，`productId` 应为必填。当前若 AI 返回 `{ action: 'addToCart', quantity: 2, message: '...', confidence: 0.9 }`（无 productId），`parseAIResponse` 会跳过 `isProductValid` 检查并返回该响应。上层 `HomeScreen` / `ScanScreen` 的 `handleAddToCart` 需要 `product.id`，缺少 productId 会导致运行时错误或无法加购。

**修复建议**: 在 `isValidAIResponse` 中增加约束：`action === 'addToCart'` 时 `productId` 必填且为字符串。

---

### P1-3. AIConfigStore 未对 config 字段做非空校验

**影响文件**: `src/store/aiConfig.ts` L82-86 (`detectReachability`)、L148-157 (`setAIConfig`)

**问题**: `detectReachability` 和 `setAIConfig` 均直接从 N1 响应或参数中取出 `apiUrl`/`apiKey`/`textModel` 使用，未检查空字符串。若 N1 返回 `apiUrl: ""` 或 `apiKey: ""`，后续 `callAI` 会向空 URL 发请求，`checkAIReachable` 会向 `undefined/v1/models` 发请求。

**修复建议**: 增加 `validateAIConfig` 辅助函数，检查三字段均为非空字符串。

---

## P2（优化建议）

### P2-1. COMBINATION_PREFIXES 未覆盖万级数字

**影响文件**: `src/services/ai.ts` L278-301

**问题**: 「一万」「二万」等万级数字无前缀映射。对于 PStore 单店场景使用频率低，但映射表不完整。

**修复建议**: 可选补充「一万」到「九万」（10000-90000）。

---

### P2-2. interceptChineseNumerals 未处理「零」「〇」在组合中的情形

**影响文件**: `src/services/ai.ts`

**问题**: 「一百零五」→ 期望 "105"。当前正则能匹配「一百」，但「零五」会分别替换为 "05"，结果 "1005" 而非 "105"。类似地，「二百零八」→ "2008" 而非 "208"。

**修复建议**: 组合匹配后，对结果做标准化处理（去掉前导零）。

---

## 逐文件审校明细

### src/services/ai.ts

| 检查项 | plan/spec 要求 | 实际 | 结果 |
|--------|---------------|------|------|
| buildSystemPrompt 包含 §7.2 指令块 | plan §1.1 | SYSTEM_PROMPT_CORE 完整 | OK |
| callAI AbortController + 10s 超时 | spec §14.2 | 实现正确，但无 finally 清理 | P1-1 |
| parseAIResponse 多级容错 | plan §1.1 | JSON.parse → markdown 提取 → null | OK |
| productId 本地校验 | plan §1.1 | isProductValid 查询 product 表 | OK |
| action=addToCart 强制 productId | plan §1.1 | productId 可选，addToCart 时必填未强制 | P1-2 |
| 中文数字独立映射 | plan §1.1 | 零~九/十/半/打 覆盖 | OK |
| 中文数字组合前缀 | plan §1.1 | 二十~九千，缺 十一~十九 | P0-2 |
| 百/千映射 | plan §1.1 | NUMERAL_MAP 缺百/千 | P0-3 |
| 组合数值合成 | plan §1.1 | 仅返回前缀值，未合成 | P0-1 |
| 万级前缀 | — | 缺失 | P2-1 |
| 零在组合中的处理 | — | 可能产生多余零 | P2-2 |

### src/store/aiConfig.ts

| 检查项 | plan/spec 要求 | 实际 | 结果 |
|--------|---------------|------|------|
| detectReachability 三级降级 | plan §1.2 | N1→缓存→无配置，正确 | OK |
| SecureStore 加密缓存 | spec §15 | expo-secure-store | OK |
| updateLatency 色标 | spec §14.2 | 绿<1s/黄1-3s/红>3s | OK |
| setAIConfig 非空校验 | — | 无校验，空值可传入 | P1-3 |
| checkAIReachable 超时清理 | — | 无 finally | P1-1 |
| HEAD /v1/models 可达检测 | plan §1.2 | AbortController + 5s | OK |

---

## 附录：spec 关键条款对照

| spec 条款 | 内容摘要 | Phase 6-1 覆盖状态 |
|-----------|---------|-------------------|
| §7 AI 引擎 | 自然语言查价、结构化回复、降级搜索 | 核心框架完成， numeral 合成有误 |
| §7.1 降级逻辑 | N1→缓存→无配置三级 | 正确实现 |
| §7.2 System Prompt | 核心指令块 + 上下文注入 | 逐字对齐 |
| §7.4 保护机制 | 5分钟缓存、不确定时列候选项 | 缓存框架就绪， numeral 预处理有误 |
| §14.2 错误处理 | 超时降级、网络质量指示 | 超时有泄漏风险 |
