# Phase 7 开发计划：语音输入

> 基于 spec-v4.5 §9（语音输入）、§7（AI 引擎输入管道）、§4.4（底部输入栏）、architecture-mvp §5 L1 输入层
> 基准 commit: Phase 6 完成后的 HEAD
> 工作流: 按 commit 顺序执行 → 每个 commit 完成后 `git commit` → 进入下一个

---

## 提交信息格式

```
phase7-<n>: <简短描述>
```

---

## 文件清单

| Commit | 新建 | 修改 |
|--------|------|------|
| C1 STT 服务层 | `src/services/stt.ts` | `src/store/aiConfig.ts`, `app.json`, `package.json` |
| C2 按住说话交互 | `src/components/VoiceButton.tsx` | — |
| C3 UI 集成 | — | `src/screens/HomeScreen.tsx` |
| C4 测试 | `src/__tests__/stt.test.ts`, `src/__tests__/voice-ui.test.ts` | — |

---

## 实现要点

### 通用约束（所有 commit 遵守）

1. spec-v4.5 §9 是唯一权威：按住 🎤 说话 → 松开发送 → AI 解析 → 展示商品卡片确认；滑动至取消区域松开则不发送
2. 语音输入是 AI 引擎输入管道的**增强通道**（与文字输入并列），复用 Phase 6 已完成的 ChatManager → RAG → callAI → parseAIResponse → 卡片确认全链路
3. 无 AI 配置时隐藏语音按钮（与 spec §9 "无 AI 时隐藏语音按钮" 对齐），直接由 `aiConfig.mode !== 'chat'` 控制渲染
4. STT 服务依赖 AI 配置可达性：复用 `aiConfig.reachable` 判断，不可达时语音按钮仍显示但 Toast 提示「语音服务暂不可用」
5. 录音权限遵循 Android 运行时权限模型：首次使用弹系统授权，拒绝后在 UI 上提示「请在设置中开启麦克风权限」
6. 录音文件为临时中间产物，写入当前会话 temp 目录，发送后或取消后立即清理
7. 语音识别失败时静默降级：Toast 提示「语音识别失败，请使用文字输入」，不弹错误对话框，不阻塞
8. 中文数字预拦截对 STT 输出同样生效：STT 返回文本 → `interceptChineseNumerals` → 再注入 AI 管道

---

## Commit 1: STT 服务层

### 1.1 `src/services/stt.ts` — 语音识别服务

```typescript
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import type { AITextConfig } from './ai';

/** STT 识别结果 */
export interface STTResult {
  text: string;
  durationMs: number;
}

/** 录音状态 */
export type RecordingStatus = 'idle' | 'recording' | 'processing';

/** 取消阈值：手指向上滑动超过此距离（dp）视为取消 */
export const CANCEL_THRESHOLD_DP = 80;
```

**导出函数**：

```typescript
/**
 * 请求麦克风权限。
 * 返回 true 表示已授权，false 表示拒绝。
 */
export async function requestAudioPermission(): Promise<boolean>

/**
 * 开始录音。
 * 返回录音状态订阅对象。
 * 使用 expo-av Audio.Recording，格式为 AAC（Android 默认）。
 */
export async function startRecording(): Promise<Audio.Recording>

/**
 * 停止录音并返回临时文件路径。
 */
export async function stopRecording(recording: Audio.Recording): Promise<string>

/**
 * 将录音文件发送到 STT API（OpenAI Whisper 兼容格式）。
 * 使用 FormData 上传音频文件，Content-Type: multipart/form-data。
 * 超时 15s，失败返回 null。
 *
 * @param config AI 配置（复用 apiUrl + apiKey，endpoint 拼接 `/v1/audio/transcriptions`）
 * @param filePath 录音文件的绝对路径
 * @returns 识别的文本，失败返回 null
 */
export async function transcribeAudio(
  config: AITextConfig,
  filePath: string,
): Promise<string | null>

/**
 * 一步完成：录音 → 停止 → 转录 → 清理。
 * 供 UI 层一行调用。
 *
 * @returns STTResult | null（用户取消 / 权限不足 / 识别失败均返回 null）
 */
export async function recordAndTranscribe(
  config: AITextConfig,
  onStatusChange: (status: RecordingStatus) => void,
): Promise<STTResult | null>

/**
 * 清理录音临时文件。
 */
export async function cleanupRecording(filePath: string): Promise<void>
```

**实现细节**：

- 使用 `expo-av` 的 `Audio.Recording` 进行录音，格式设置为 `Audio.RecordingOptionsPresets.HIGH_QUALITY`，输出格式为 `.m4a`（AAC）
- `transcribeAudio` 构造 FormData：
  ```
  form.append('file', { uri, name: 'recording.m4a', type: 'audio/m4a' });
  form.append('model', 'whisper-1');
  form.append('language', 'zh');
  ```
- API endpoint：取 `config.apiUrl` 去掉尾部 `/v1/chat/completions`，拼接 `/v1/audio/transcriptions`
- 超时 15s（语音文件上传可能较大，比文本 API 10s 宽松），使用 `AbortController`
- `recordAndTranscribe` 作为一站式入口，内部处理权限检查、录音、停止、转录、清理全流程
- 录音过程中通过 `onStatusChange` 回调通知 UI 当前状态：`'recording'` | `'processing'`
- 清理使用 `FileSystem.deleteAsync(filePath, { idempotent: true })`，静默忽略文件不存在的错误

### 1.2 `src/store/aiConfig.ts` (修改) — 新增语音权限状态

```typescript
// 在 AIConfigState 接口中新增：

interface AIConfigState {
  // ... 已有字段保留不动

  /** 麦克风权限是否已授权 */
  micPermissionGranted: boolean;
  /** 语音按钮是否可用（AI 配置可达且权限已授权） */
  isVoiceAvailable: boolean;

  // 新增 Actions
  /** 检查并请求麦克风权限 */
  checkMicPermission: () => Promise<void>;
}
```

**检测逻辑**：

```
checkMicPermission()
  ├─ 调用 requestAudioPermission()
  ├─ 授权 → micPermissionGranted = true
  └─ 拒绝 → micPermissionGranted = false

isVoiceAvailable = (mode === 'chat' && reachable && micPermissionGranted)
```

- `micPermissionGranted` 初始值为 `false`，首次使用时请求
- `isVoiceAvailable` 是派生状态（computed），由 `mode` / `reachable` / `micPermissionGranted` 三个条件与运算得出
- UI 层订阅 `isVoiceAvailable` 决定语音按钮的可用/隐藏状态

### 1.3 `app.json` (修改) — 新增录音权限

```json
{
  "expo": {
    "android": {
      "permissions": [
        "CAMERA",
        "RECORD_AUDIO"
      ]
    }
  }
}
```

**实现细节**：

- 仅新增 `"RECORD_AUDIO"` 一行，不改动已有 `"CAMERA"` 行

### 1.4 `package.json` (修改) — 新增依赖

```json
{
  "dependencies": {
    "expo-av": "~15.0.0",
    "expo-file-system": "~18.0.0"
  }
}
```

**实现细节**：

- `expo-av`：录音 API（`Audio.Recording`）
- `expo-file-system`：临时文件清理（`FileSystem.deleteAsync`）
- 均为 Expo SDK 52 兼容版本

---

## Commit 2: 按住说话交互组件

### 2.1 `src/components/VoiceButton.tsx` (新建)

```typescript
import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  PanResponder,
  StyleSheet,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import { useAIConfigStore } from '../store/aiConfig';
import { recordAndTranscribe, CANCEL_THRESHOLD_DP, type RecordingStatus, type STTResult } from '../services/stt';
import { showToast } from '../utils/toast';

interface Props {
  /** 语音识别成功回调，传入识别文本 */
  onResult: (text: string) => void;
  /** 是否可用（AI 配置可达 + 权限已授权） */
  available?: boolean;
}

/**
 * 按住说话语音按钮。
 *
 * 交互流程：
 * 1. 按下 → 开始录音 → 按钮高亮 + 动画反馈
 * 2. 手指上滑超过 CANCEL_THRESHOLD_DP → 显示"松开取消"区域
 * 3. 松手：
 *    - 未超过取消阈值 → 停止录音 → 调用 STT → onResult(text)
 *    - 超过取消阈值 → 停止录音 → 丢弃 → 不触发 onResult
 * 4. 录音中手指划回按钮区域 → 取消提示消失，恢复正常录音态
 */
export function VoiceButton({ onResult, available }: Props): JSX.Element;
```

**状态机**：

```
IDLE（初始态）
  ↓ 按下
RECORDING（录音中）
  ├─ 滑上超过阈值 → READY_TO_CANCEL（显示取消提示）
  │    ├─ 松开 → CANCELLED（丢弃录音）→ IDLE
  │    └─ 滑回按钮区域 → RECORDING
  └─ 松开（未超阈值）→ PROCESSING（转录中）→ DONE（回调 onResult）→ IDLE
```

**实现细节**：

- 使用 `PanResponder` 处理手势（`onPanResponderGrant` / `onPanResponderMove` / `onPanResponderRelease`）
- 录音过程中按钮背景色变为 Primary `#2563EB`，文字变为白色 `#FFF`，外圈脉冲动画（`Animated.loop` + scale）
- 取消区域：按钮上方 80dp 处显示半透明红色条带「松开取消」，`opacity` 随滑动距离渐进出现
- `available === false` 时按钮 `opacity: 0.3`，按下时 Toast 提示原因（"AI 未配置" 或 "麦克风权限未开启"）
- `onResult` 回调前先经过 `interceptChineseNumerals`（由 HomeScreen 层在收到 STT 文本后调用，保持关注点分离）
- 录音过程中 UI 显示声波动画（简单的 `Animated` 高度变化条，3 条竖线交替伸缩）
- 录音时长为 0 的情况（手指误触立即松开）：不调用 STT API，直接静默丢弃

**子组件拆解**（内联在同一文件中）：

| 子组件 | 职责 |
|--------|------|
| `RecordingIndicator` | 录音中的声波动画（3 条竖线交替伸缩，Primary 色） |
| `CancelZone` | 取消区域提示（半透明红色条带 "松开取消"，位于按钮上方） |
| `ProcessingOverlay` | 转录中旋转指示器（简单的 "..." 文字闪烁） |

---

## Commit 3: UI 集成

### 3.1 `src/screens/HomeScreen.tsx` (修改) — 替换语音按钮占位

**当前状态**（Phase 6 C3 产物，行 ~662）：

```tsx
<TouchableOpacity style={styles.voiceBtn} activeOpacity={0.7}>
  <Text style={styles.voiceBtnText}>🎤</Text>
</TouchableOpacity>
```

无任何事件处理，仅视觉占位。

**修改目标**：

1. 将占位 `TouchableOpacity` 替换为 `<VoiceButton />`
2. 语音识别成功后，将文本注入 AI 管道（与手动输入走同一 `handleAiSend` 路径）

**改动点**：

| 改动 | 说明 |
|------|------|
| import VoiceButton | 新增 `import { VoiceButton } from '../components/VoiceButton'` |
| `handleVoiceResult` 回调 | 接收 STT 文本 → 经过 `interceptChineseNumerals` → 设置为 `chatInput` → 自动触发 `handleAiSend` |
| 替换 jsx | 移除占位 TouchableOpacity，替换为 `<VoiceButton available={isVoiceAvailable} onResult={handleVoiceResult} />` |
| 录音中禁用输入框 | 录音时输入框 `editable={false}`，placeholder 变为 "正在聆听..." |
| 权限引导 | `isVoiceAvailable === false` 且 `aiConfig.mode === 'chat'` 时，VoiceButton 内部显示禁用态；点击时根据原因 Toast 提示「请在设置中开启麦克风权限」或「AI 服务未连接」 |

**`handleVoiceResult` 实现**（在 HomeScreen 组件内新增）：

```typescript
const handleVoiceResult = useCallback((text: string) => {
  // 中文数字预拦截（与文字输入走同一管道）
  const { text: processed, replaced } = interceptChineseNumerals(text.trim());
  if (!processed) {
    showToast('未识别到有效内容');
    return;
  }
  // 设置为聊天输入并自动发送
  setChatInput(processed);
  // 通过 setTimeout 确保 setChatInput 的 state 更新后再发送
  setTimeout(() => {
    handleAiSendWithText(processed);
  }, 0);
}, [/* deps */]);
```

**注意**：`handleAiSend` 读取的是 `chatInput` state，语音路径需要绕过 state 异步问题。方案：抽取 `handleAiSendWithText(text: string)` 内部函数，接受显式文本参数，供文字路径和语音路径共用。原 `handleAiSend` 改为调用 `handleAiSendWithText(chatInput)`。

**HomeScreen 样式需新增**：

```typescript
// 语音录音中占位
voiceRecordingBar: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#2563EB',
  marginHorizontal: 12,
  marginBottom: 4,
  borderRadius: 10,
  paddingHorizontal: 16,
  height: 44,
},
voiceRecordingText: {
  flex: 1,
  fontSize: 15,
  color: '#FFF',
  textAlign: 'center',
},
voiceRecordingCancel: {
  fontSize: 13,
  color: 'rgba(255,255,255,0.7)',
},
```

---

## Commit 4: 测试

### 4.1 `src/__tests__/stt.test.ts` (新建)

测试 STT 服务层：

- `requestAudioPermission` 授权后返回 `true`
- `requestAudioPermission` 拒绝后返回 `false`
- `transcribeAudio` Mock 成功的 API 响应返回文本
- `transcribeAudio` API 超时返回 `null`
- `transcribeAudio` API 返回非 200 时返回 `null`
- `recordAndTranscribe` 权限未授权时返回 `null`，不抛出异常
- `recordAndTranscribe` 录音 + 转录成功返回 `STTResult`
- `recordAndTranscribe` 转录失败后调用 `cleanupRecording`
- `cleanupRecording` 文件不存在时不抛异常（idempotent）
- `transcribeAudio` 构造的 FormData 包含 `model: 'whisper-1'` 和 `language: 'zh'`

### 4.2 `src/__tests__/voice-ui.test.ts` (新建)

集成测试：

- `isVoiceAvailable` 在无 AI 配置时为 `false`
- `isVoiceAvailable` 在 AI 配置可达 + 权限已授权时为 `true`
- `isVoiceAvailable` 在 AI 配置可达但权限未授权时为 `false`
- 语音按钮在 `aiConfig.mode === 'search'` 时不渲染
- 语音按钮在 `aiConfig.mode === 'chat'` 时渲染
- 按住语音按钮 → 录音状态切换为 `recording`
- 手指上滑超过阈值 → 显示取消区域
- 在取消区域松开 → 不触发 `onResult`，录音丢弃
- 正常松开 → `onResult` 接收到 STT 文本
- 录音时长过短（< 0.5s）→ 静默丢弃，不调用转录 API
- 转录失败时 Toast 提示「语音识别失败，请使用文字输入」
- 中文数字预拦截对 STT 结果生效（"两瓶可乐" → 传入 AI 管道的是 "2瓶可乐"）

---

## 验收标准

### C1: STT 服务层

| # | 标准 |
|---|------|
| 1 | `expo-av` 录音正常，输出 `.m4a` 文件 |
| 2 | `requestAudioPermission` 正确调用系统权限弹窗 |
| 3 | `transcribeAudio` 调用 `/v1/audio/transcriptions` 端点，Whisper API 兼容格式 |
| 4 | STT API 15s 超时，超时返回 null 不抛异常 |
| 5 | `recordAndTranscribe` 一站式调用返回 `STTResult` 或 null |
| 6 | 录音临时文件在 send/cancel 后均被清理 |
| 7 | `app.json` 包含 `RECORD_AUDIO` 权限声明 |
| 8 | `package.json` 新增 `expo-av` + `expo-file-system` 依赖 |
| 9 | `aiConfig.isVoiceAvailable` 派生状态正确反映三个条件 |

### C2: 按住说话交互

| # | 标准 |
|---|------|
| 1 | 按下 → 开始录音，按钮视觉反馈（颜色变化 + 脉冲动画） |
| 2 | 手指上滑超过 80dp → 显示"松开取消"红色区域 |
| 3 | 在取消区域松开 → 录音丢弃，不触发 onResult |
| 4 | 手指滑回按钮区域 → 取消提示消失，恢复录音态 |
| 5 | 正常松开 → 录音停止 → STT 转录 → onResult |
| 6 | 录音中显示声波动画（3 条竖线交替伸缩） |
| 7 | 转录中显示处理指示器 |
| 8 | 可用性为 false 时按钮半透明 + 点击 Toast 说明原因 |
| 9 | 误触（极短录音 < 0.5s）静默丢弃 |

### C3: UI 集成

| # | 标准 |
|---|------|
| 1 | 搜索模式不显示语音按钮（保持 Phase 6 行为） |
| 2 | 聊天模式显示 VoiceButton 替代占位 TouchableOpacity |
| 3 | STT 成功识别的文本注入 AI 管道，用户看到自己的气泡 + AI 回复 + 确认卡片 |
| 4 | STT 文本经 `interceptChineseNumerals` 预拦截后再注入 AI |
| 5 | 录音中聊天输入框不可编辑，placeholder 显示「正在聆听...」 |
| 6 | 权限未授权时点击语音按钮 Toast 提示引导用户去设置 |
| 7 | 与 Phase 6 文字输入路径互不干扰，两通道可交替使用 |

### C4: 测试

| # | 标准 |
|---|------|
| 1 | 所有单元测试通过（stt / voice-ui 两套） |
| 2 | 测试覆盖核心路径 + 边界条件（权限拒绝 / 识别失败 / 超时 / 取消 / 误触 / 文件清理） |

---

## 与其他 Phase 的关系

| 依赖方向 | 说明 |
|----------|------|
| Phase 6 → Phase 7 | 语音输入复用 Phase 6 AI 引擎全链路（ChatManager → buildSystemPrompt → RAG → callAI → parseAIResponse → ProductConfirmCard） |
| Phase 6 → Phase 7 | AI 配置（`aiConfig` store）被 STT 服务复用（apiUrl + apiKey 同源） |
| Phase 7 独立 | 语音交互层（VoiceButton 手势 + 录音 + STT 转录）为独立模块，不依赖 Phase 1-5 的 CRUD/同步/数据层 |
| Phase 7 → Phase 8 | 语音输入完成后，Phase 8 拍照识别（§8.2）可参考 VoiceButton 的权限申请模式和 API 调用模式 |

---

## 技术风险与注意事项

| 风险 | 缓解 |
|------|------|
| Android 录音权限被拒绝后再也无法请求 | 检测到 `never_ask_again` 状态后 Toast 引导用户去系统设置手动开启 |
| expo-av 在部分 Android 设备录音格式不兼容 | 指定 `OutputFormat.MPEG_4` + `AudioEncoder.AAC`，这是 Android 最通用的组合 |
| Whisper API 不支持 FormData 流式 | 文件小（< 10s 语音），一次请求即可，不做流式 |
| 中文识别准确率不稳定 | `language: 'zh'` 约束 + 中文数字预拦截兜底 |
| 录音文件过大导致上传超时 | 前端限制最长录音 15s（Android Audio.Recording 的 `maxDuration`），超出自动停止 |
| 与文字输入共享 ChatManager 状态冲突 | 语音识别结果是异步的，通过 `handleAiSendWithText(text)` 显式传参避免 state 竞态 |
| 滑动取消手势与 ScrollView 滚动冲突 | VoiceButton 的 PanResponder 在 `onMoveShouldSetPanResponder` 中吸收手势，阻止冒泡到外层 ScrollView |

---

## 录音时长与 UI 状态映射

| 录音时长 | UI 状态 |
|----------|---------|
| < 0.5s | 静默丢弃，Toast「按住说话，松开发送」引导 |
| 0.5s ~ 15s | 正常录音 → 松开后转录 |
| = 15s | 自动停止录音 → 转录（不做二次确认） |
| 转录中 | 按钮显示 "..." 处理指示器 |
| 转录失败 | Toast「语音识别失败，请使用文字输入」→ 按钮恢复 IDLE |
| 转录成功 | 文本注入输入框 → 自动发送 → 按钮恢复 IDLE |
| 滑动取消 | 按钮恢复 IDLE，无 Toast |
