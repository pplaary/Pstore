# Phase 6 DeepSeek 审校报告

**审校人：** Claude Code (Opus 4.8)  
**日期：** 2026-06-22  
**范围：** phase6 全部变更（ai.ts, aiConfig.ts, ai-chat.test.ts, ai-ui.test.ts, ai.test.ts, aiConfig.test.ts, webdav.test.ts）

---

## 总览

| 等级 | 数量 | 文件 |
|------|------|------|
| P0（阻断） | 1 | src/services/ai.ts:303 |
| P1（需修复） | 2 | src/services/ai.ts 解析静默失败；src/services/ai/cache.ts:98 evict 草稿 TTL 不一致 |
| P2（建议） | 1 | 测试基础设施：package.json 缺少 `"type": "module"` 导致全部 21 个测试套件无法运行 |

---

## P0 — 阻断

### P0-1: ai.ts:303 字符串字面量未闭合

```typescript
// 第 303 行（错误）
const unitChars = Object.keys(UNIT_MULT_MAP).join(');

// 第 303 行（正确）
const unitChars = Object.keys(UNIT_MULT_MAP).join('');
```

**影响：** TypeScript 编译语法错误，该文件无法编译通过。  
**修复：** 闭合引号为 `''`。

---

## P1 — 需修复

### P1-4: parseAIResponse 解析失败静默返回 null

**位置：** `src/services/ai.ts:144-182`  
**问题：** 当 AI 返回非标准 JSON 时，函数在 4 个分支都 `return null` 但不输出任何警告，调试困难。

**修复方案：** 在每个 `return null` 前加 `console.warn`，标注失败原因。

```typescript
// 建议：在各 return null 前加
console.warn('[AI] parseAIResponse: JSON 解析失败（非 markdown 代码块）');
console.warn('[AI] parseAIResponse: JSON 解析失败（markdown 代码块内）');
console.warn('[AI] parseAIResponse: 响应缺少必需字段', parsed);
console.warn('[AI] parseAIResponse: productId 本地校验失败', resp.productId);
```

### P1-5: evict 草稿过期时间与 getDraft 不一致

**位置：** `src/services/ai/cache.ts:98`

| 函数 | 当前 TTL | 应有 TTL |
|------|----------|----------|
| `getDraft` (line 76) | `DRAFT_GREY_MS` (60s) | 60s |
| `evict` (line 98) | `CACHE_TTL_MS` (5min) | **应为 60s** |

**问题：** `evict()` 用 5 分钟清理草稿，但 `getDraft()` 用 60 秒标记过期。这导致草稿在 `getDraft` 已标记为 expired 后，`evict` 要等 5 分钟才真正删除。

**修复方案：** 第 98 行 `CACHE_TTL_MS` → `DRAFT_GREY_MS`。

### P1-6 (发现于修复中): UNIT_MULT_MAP 缺少佰:100

**位置：** `src/services/ai.ts:286-291`  
**问题：** `UNIT_MULT_MAP` 缺少 `'佰': 100` 映射，导致单字「佰」无法转换为 100。

**修复方案：** 补充 `'佰': 100`。

---

## P2 — 建议

### P2-1: 测试基础设施 — 全部 21 个套件无法运行

**现象：** `npm test` 报错 `Vitest cannot be imported in a CommonJS module using require()`

**根因：** `package.json` 缺少 `"type": "module"` 字段，Node.js 将 `.ts` 测试文件按 CJS 处理，但 vitest 的 ESM 导入语法不兼容。

**影响：** 21/21 测试套件全部无法加载，0 个测试实际执行。

**修复方案：** 在 `package.json` 中添加 `"type": "module"`。

**注意：** 需确认项目内无 `require()` 调用。当前所有源码和测试文件均使用 `import` 语法，添加该字段安全。

---

## 修复清单

- [x] P0-1: ai.ts:303 `join(');` → `join('');`
- [x] P1-4: parseAIResponse 各 return null 前加 console.warn
- [x] P1-5: cache.ts:98 `CACHE_TTL_MS` → `DRAFT_GREY_MS`
- [x] P2-1: package.json 添加 `"type": "module"`
- [x] 创建本报告文件 `review-phase6-final.md`
