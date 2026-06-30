# Phase 6 修复指令

## 背景

Phase 6 AI 引擎审校通过（0 CRITICAL），需修复 1 个 MEDIUM 和 1 个 HIGH 项。

## 修复项

### MEDIUM: setAIConfig 状态不一致

文件：`src/store/aiConfig.ts`，`setAIConfig` 方法（约 201-220 行）

问题：setAIConfig 在最终的 `set()` 调用中未更新 `micPermissionGranted` 和 `isVoiceAvailable`。
- `clearAIConfig` 正确重置了这两个字段
- `detectReachability` 在三个分支中都正确计算了这两个字段  
- 但 `setAIConfig` 缺少，若 mode 因不可达变为 'search'，isVoiceAvailable 可能残留为 true

修复：在 `setAIConfig` 的 `set()` 中补充：
```typescript
const { micPermissionGranted } = get();
// 在 set 中添加：
micPermissionGranted,
isVoiceAvailable: computeVoiceAvailable(micPermissionGranted, reachable, reachable ? 'chat' : 'search'),
```

### HIGH: updateLatency 3000ms 边界语义

文件：`src/store/aiConfig.ts`，`updateLatency` 方法（约 191-200 行）

问题：当前代码：
```typescript
} else if (ms < LATENCY_YELLOW_MS) { // LATENCY_YELLOW_MS = 3000
    tier = 'yellow';
} else {
    tier = 'red';
}
```
spec §14.2 说"红 > 3s"。`ms < 3000` 意味着 `ms = 3000` 走 red，语义上 `3000ms`（恰好 3s）应为 yellow。建议改为 `ms <= 3000` 以严格对齐 spec。

修复：将 `ms < LATENCY_YELLOW_MS` 改为 `ms <= LATENCY_YELLOW_MS`

## 验证

修复完成后执行：
1. `npx tsc --noEmit` — 零错误
2. `npx vitest run src/__tests__/aiConfig.test.ts` — 全部通过
