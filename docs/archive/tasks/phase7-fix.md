# Phase 7 测试修复指令

## 背景

Phase 7 的 C1/C2/C3 代码实现已完整，但 C4 测试存在以下问题需修复。

## 修复任务

### 任务 1：stt.test.ts — 修复 2 个 skipped 测试 + unhandled error

文件：`src/__tests__/stt.test.ts`

当前状态：36 个测试，2 个 skipped（因 expo-av SDK52 中 `Audio.RecordingOptionsPresets` 缺少 `maxDuration` 字段，导致相关测试无法运行），另有 1 个 Rollup/parse 相关的 unhandled error。

修复要求：
1. 分析 2 个 skipped 测试的根因
2. 修改测试 mock 或用例逻辑，使得这 2 个测试能够 PASS（而非 skip）
3. 修复 unhandled error（如果是 mock 不完整导致，补全 mock）
4. 所有 36 个测试必须 PASS，不允许 skip
5. 走 tsc --noEmit + vitest run 验证

### 任务 2：voice-button.test.tsx — 修复 2 个 skipped 测试

文件：`src/__tests__/voice-button.test.tsx`

当前状态：18 个测试，2 个 skipped（原因同上，maxDuration 相关）

修复要求：
1. 分析 2 个 skipped 测试的根因
2. 修改测试 mock 或用例逻辑，使得这 2 个测试能够 PASS（而非 skip）
3. 所有 18 个测试必须 PASS
4. 走 vitest run 验证

### 任务 3：新建 voice-ui.test.ts

文件：`src/__tests__/voice-ui.test.ts`（新建）

对照 plan-phase7.md §4.2（Memory: memory_00_oSIFRSOA9PgiMmwYk06t0065）中 voice-ui.test.ts 的验收标准，创建此测试文件。需要覆盖：

- isVoiceAvailable 在无 AI 配置时为 false
- isVoiceAvailable 在 AI 配置可达 + 权限已授权时为 true
- isVoiceAvailable 在 AI 配置可达但权限未授权时为 false
- 语音按钮在 mode='search' 时不渲染
- 语音按钮在 mode='chat' 时渲染
- 按住语音按钮 → 录音状态切换为 recording
- 手指上滑超过阈值 → 显示取消区域
- 在取消区域松开 → 不触发 onResult，录音丢弃
- 正常松开 → onResult 接收到 STT 文本
- 录音时长过短（< 0.5s）→ 静默丢弃，不调用转录 API
- 转录失败时 Toast 提示
- 中文数字预拦截对 STT 结果生效

注意：如果 voice-button.test.tsx 已经覆盖了上述大部分用例，只需新建 voice-ui.test.ts 覆盖 voice-button.test.tsx 未覆盖的用例即可，避免重复。

## 验证步骤

完成上述三个任务后，执行：
```
pnpm tsc --noEmit
pnpm vitest run --reporter=verbose src/__tests__/stt.test.ts src/__tests__/voice-button.test.tsx src/__tests__/voice-ui.test.ts
```

确保：
- tsc 零错误
- 所有测试 PASS，0 skipped，0 failed
