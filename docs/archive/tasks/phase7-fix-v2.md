# Phase 7 测试修复指令（精准版）

## 背景

vitest run 结果：
- stt.test.ts: 36 passed ✅
- voice-button.test.tsx: 16 passed, 2 skipped (maxDuration 相关)
- 1 unhandled error（Rollup parse 相关）

## 任务 1：修复 voice-button.test.tsx 的 2 个 skipped 测试

文件：`src/__tests__/voice-button.test.tsx`，行 ~485-512 附近

当前 2 个测试标记为 `it.skip`，原因是 expo-av SDK 52+ 移除了 `RecordingOptions` 中的 `maxDuration` 字段。实际实现中，stt.ts 的 `recordAndTranscribe` 使用轮询 `getStatusAsync` + `MAX_DURATION_MS` 常量来控制最长录音时长，而非依赖 expo-av 的 maxDuration。

修复方案：将 2 个 skipped 测试改为验证 `MAX_DURATION_MS` 常量值为 15000，以及验证 `recordAndTranscribe` 在录音达到 15s 时自动停止（通过 mock getStatusAsync 返回 isDoneRecording=true 来模拟）。

```typescript
// 替换为：
it('MAX_DURATION_MS 常量值为 15000', () => {
  const { MAX_DURATION_MS } = require('../services/stt');
  expect(MAX_DURATION_MS).toBe(15_000);
});

it('录音时长达到 MAX_DURATION_MS 后自动停止并转录', async () => {
  setupChatMode();
  mockRecording.getStatusAsync
    .mockResolvedValueOnce({ isDoneRecording: false, isRecording: true })
    .mockResolvedValueOnce({ isDoneRecording: true, durationMillis: 15_000, isRecording: false });

  const onResult = vi.fn();
  const { panHandlers } = renderVoiceButton({ available: true, onResult });

  await simulateGestureGrant(panHandlers);
  await simulateGestureRelease(panHandlers);
  await new Promise((r) => setTimeout(r, 50));

  // 15s 录音应正常走转录流程，触发 onResult
  expect(onResult).toHaveBeenCalledWith('两瓶可乐');
});
```

## 任务 2：调查并修复 unhandled error

vitest 报告 1 个 unhandled error。先定位根因：
1. 运行 `npx vitest run src/__tests__/stt.test.ts --reporter=verbose 2>&1` 观察 stderr 中的具体错误
2. 如果是 Rollup parse 错误（`Expected 'from', got 'typeOf'`），检查 `import type { AITextConfig }` 语句是否被 vitest 的 transform 层误解析
3. 修复后确保 unhandled error 消失

## 验证

```
npx tsc --noEmit
npx vitest run src/__tests__/stt.test.ts src/__tests__/voice-button.test.tsx
```

要求：
- tsc 零错误
- 54 个测试全部 PASS，0 skipped
- 0 unhandled errors
