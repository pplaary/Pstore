# Phase 6-4 审校报告

生成时间：2026-06-22

## P0 — 必须修复

### P0-1：ai-chat.test.ts 缓存过期测试使用无效的 Date spy

**文件**：`src/__tests__/ai-chat.test.ts`（3 处）
**行号**：418-440（5 分钟过期）、453-473（60 秒过期）、489-505（evict）

**问题**：使用 `vi.spyOn(global, 'Date').mockImplementation(...)` 模拟 `Date.now()`。
`AIResponseCache` 内部直接调用 `Date.now()`，但 spy 替换了整个 `Date` 构造函数为返回 `{ now: () => ... }` 的对象。
当代码执行 `new Date()` 或 `Date.now()` 调用时，由于 spy 返回的是普通对象而非 Date 实例，
行为不符合预期，过期判断不可靠。

**修复方案**：使用 `vi.useFakeTimers()` + `vi.advanceTimersByTime()` 替代。

```typescript
// 修复前（错误）
vi.spyOn(global, 'Date').mockImplementation(() => ({
  now: () => futureTime,
}) as unknown as Date);

// 修复后（正确）
const realDateNow = Date.now;
vi.useFakeTimers();
cache.set('test', mockResponse);
vi.advanceTimersByTime(5 * 60 * 1000 + 1000); // 超过 5 分钟
expect(cache.get('test')).toBeNull();
vi.useRealTimers();
```

**影响**：3 个测试用例（5 分钟过期、60 秒过期、evict 清理）逻辑不正确，
可能在 CI 中随机通过/失败。

---

### P0-2：RAG mock 路径可能未正确拦截

**文件**：`src/__tests__/ai-chat.test.ts`
**行号**：229-233

**问题**：`vi.mock('../../db/search', ...)` 在 `src/__tests__/ai-chat.test.ts` 中，
相对路径解析为 `src/db/search.ts`。`src/services/ai/rag.ts` 中导入路径为 `../../db/search`，
两者在文件系统上指向同一文件，路径正确。

但 mock 使用 `(...args: unknown[]) => mockSearchProducts(...args)` 转发调用，
如果 `searchProducts` 的签名发生变化（如新增参数），测试可能静默失败。

**修复方案**：确保 mock 调用参数断言正确。`buildRAGContext(db, userInput, { status, limit })`
调用 `searchProducts(db, query, options)`，其中 `options` 为第三个参数 `args[2]`。
当前断言 `args[2]` 正确。

**结论**：路径本身正确，但需确保 mock 函数签名与源文件一致。当前无功能性错误，
标记为 P0 以防回归。

---

## P1 — 建议修复

### P1-1：缺少 SecureStore AI 配置读写测试

**文件**：`src/store/aiConfig.ts`
**现有测试**：`src/__tests__/config-webdav.test.ts` 覆盖了 WebDAV 凭据的 SecureStore 操作，
但未覆盖 AI 配置（`pstore_ai_config` 键）的 `setAIConfig` / `clearAIConfig`。

**缺失测试**：
- `setAIConfig` 写入 SecureStore 后 `getItemAsync('pstore_ai_config')` 能读回
- `setAIConfig` 空字段时清除 SecureStore
- `clearAIConfig` 删除 SecureStore 键

**建议**：在 `src/__tests__/ai-chat.test.ts` 或新建 `src/__tests__/aiConfig.test.ts` 补充。

---

### P1-2：Toast 通知验证不足

**文件**：`src/utils/toast.ts`
**现有测试**：无专门测试文件。

**缺失测试**：
- Android 路径：`ToastAndroid.show` 被调用且 duration 映射正确
- iOS 路径：`Alert.alert` 被调用
- Platform 判断逻辑

**建议**：新建 `src/__tests__/toast.test.ts`，mock `react-native` 的 `ToastAndroid` 和 `Alert`。

---

### P1-3：中文数字预拦截气泡验证不完整

**文件**：`src/components/HomeScreen.tsx` + `src/__tests__/ai-ui.test.ts`
**现状**：`ai-ui.test.ts` 仅验证 HomeScreen 源码中 `import` 了 `interceptChineseNumerals`，
未验证调用时机和气泡展示。

**缺失验证**：
- `interceptChineseNumerals` 的 `replaced=true` 时是否展示提示气泡
- 气泡文案内容
- 未替换时（`replaced=false`）不展示气泡

**建议**：在 `ai-ui.test.ts` 中补充对调用逻辑的源码分析测试，
验证 `interceptChineseNumerals` 返回值被正确判断和 UI 分支。

---

## 审校结论

| 编号 | 级别 | 描述 | 文件 |
|------|------|------|------|
| P0-1 | P0 | Date spy 不可靠，应使用 vi.useFakeTimers | ai-chat.test.ts |
| P0-2 | P0 | RAG mock 路径正确但需关注签名一致性 | ai-chat.test.ts |
| P1-1 | P1 | 缺少 SecureStore AI 配置测试 | aiConfig.ts |
| P1-2 | P1 | 缺少 Toast 测试 | toast.ts |
| P1-3 | P1 | 中文数字预拦截气泡验证不完整 | HomeScreen.tsx |

**建议执行顺序**：P0-1 → P0-2 → P1-1 → P1-2 → P1-3
