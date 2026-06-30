# Phase 7 审校指令

## 背景

Phase 7（语音输入）共 4 个 commit：C1 STT服务层 / C2 按住说话交互 / C3 UI集成 / C4 测试。

当前状态：C1 stt.ts ✅、C2 VoiceButton.tsx ✅，但以下部分缺失或需验证：

- C1 aiConfig.ts：缺 micPermissionGranted / isVoiceAvailable / checkMicPermission
- C1 app.json：缺 RECORD_AUDIO 权限声明
- C1 package.json：缺 expo-av 和 expo-file-system 依赖
- C3 HomeScreen.tsx：VoiceButton 集成未做

## 审校任务

对照 `plan-phase7.md`（Memory: memory_00_oSIFRSOA9PgiMmwYk06t0065）逐项审校以下文件，输出差异清单。

### 文件列表

1. `src/services/stt.ts` — 现存，审校是否完全符合 plan C1 定义
2. `src/store/aiConfig.ts` — 审校缺失项（micPermissionGranted / isVoiceAvailable / checkMicPermission）
3. `app.json` — 审校是否缺 RECORD_AUDIO
4. `package.json` — 审校是否缺 expo-av / expo-file-system
5. `src/components/VoiceButton.tsx` — 现存，审校是否完全符合 plan C2 定义
6. `src/screens/HomeScreen.tsx` — 审校缺失项（VoiceButton 集成 / handleVoiceResult / handleAiSendWithText / 样式）
7. `src/__tests__/stt.test.ts` — 审校测试覆盖率
8. `src/__tests__/voice-button.test.tsx` — 审校测试覆盖率

### 审校重点

- 逐条对照 plan §验收标准 四个 commit 的所有验收项
- 标记状态：✅ 已实现 / ⚠️ 不完整 / ❌ 缺失 / 🔧 需修改
- 每个差异标注 plan 中的对应章节号
- 对 VoiceButton.tsx 特别注意：计划要求 `type Props` 命名，现有代码用 `VoiceButtonProps`；计划要求 `export type *` / `export function *`，现有代码的导出签名是否对齐
- 对 aiConfig.ts：检查现有 state 结构，micPermissionGranted / isVoiceAvailable 应如何插入
- 对 HomeScreen.tsx：定位语音按钮占位位置（现有 🎤 的 TouchableOpacity）、输入框逻辑、handleAiSend 函数

### 输出格式

```
## 文件: <path>

| 验收项 (plan §章节) | 状态 | 差异说明 |
|---|---|---|
| ... | ✅/⚠️/❌/🔧 | ... |
```

末尾汇总：按严重程度 CRITICAL/HIGH/MEDIUM/LOW 分级所有差异项。
