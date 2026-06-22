/**
 * STT (Speech-to-Text) 服务层
 *
 * 封装 expo-av 录音 → Whisper API 转录全流程。
 * 最长录音 15s，< 0.5s 静默丢弃。
 *
 * spec-v4.5 §9（语音输入）
 */

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import type { AITextConfig } from './ai';

// ==================== 类型 ====================

/** STT 识别结果 */
export interface STTResult {
  text: string;
  durationMs: number;
}

/** 录音状态 */
export type RecordingStatus = 'idle' | 'recording' | 'processing';

/** 取消阈值：手指向上滑动超过此距离（dp）视为取消 */
export const CANCEL_THRESHOLD_DP = 80;

/** 最短有效录音时长（ms），低于此值静默丢弃 */
export const MIN_DURATION_MS = 500;

/** 最长录音时长（ms） */
export const MAX_DURATION_MS = 15_000;

// ==================== 权限 ====================

/**
 * 请求麦克风权限。
 * 返回 true 表示已授权，false 表示拒绝。
 */
export async function requestAudioPermission(): Promise<boolean> {
  try {
    const { status } = await Audio.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

// ==================== 录音 ====================

/**
 * 开始录音。
 * 返回录音对象，调用方持有引用以便后续停止。
 */
export async function startRecording(): Promise<Audio.Recording> {
  // 确保录音模式已设置
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsAndRecordsAudio: false,
    staysActiveInBackground: false,
    playThroughEarpieceAndroid: false,
  });

  const recording = new Audio.Recording();
  await recording.prepareToRecordAsync({
    ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
    android: {
      ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
      outputFormat: Audio.AndroidOutputFormat.MPEG_4,
      audioEncoder: Audio.AndroidAudioEncoder.AAC,
    },
    ios: {
      ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
      outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    },
    isMeteringEnabled: true,
    maxDuration: MAX_DURATION_MS,
  });

  await recording.startAsync();
  return recording;
}

/**
 * 停止录音并返回临时文件路径。
 */
export async function stopRecording(recording: Audio.Recording): Promise<string> {
  await recording.stopAndUnloadAsync();
  const uri = recording.getURI();
  if (!uri) {
    throw new Error('Recording URI is null after stop');
  }
  return uri;
}

// ==================== 转录 ====================

/**
 * 将录音文件发送到 STT API（OpenAI Whisper 兼容格式）。
 * 使用 FormData 上传音频文件，Content-Type: multipart/form-data。
 * 超时 15s，失败返回 null。
 *
 * @param config AI 配置（复用 apiUrl + apiKey，endpoint 拼接 /v1/audio/transcriptions）
 * @param filePath 录音文件的绝对路径
 * @returns 识别的文本，失败返回 null
 */
export async function transcribeAudio(
  config: AITextConfig,
  filePath: string,
): Promise<string | null> {
  try {
    // 构造 Whisper API 端点：取 apiUrl 去掉尾部 /v1/chat/completions，拼接 /v1/audio/transcriptions
    const baseUrl = config.apiUrl.replace(/\/+$/, '');
    let endpoint = baseUrl;
    // 如果末尾是 /v1/chat/completions，替换为 /v1/audio/transcriptions
    if (endpoint.endsWith('/v1/chat/completions')) {
      endpoint = endpoint.replace(/\/v1\/chat\/completions$/, '/v1/audio/transcriptions');
    } else if (!endpoint.endsWith('/v1/audio/transcriptions')) {
      endpoint = `${endpoint}/v1/audio/transcriptions`;
    }

    const form = new FormData();
    // React Native FormData: file 字段需要 uri + name + type
    form.append('file', {
      uri: filePath,
      name: 'recording.m4a',
      type: 'audio/m4a',
    } as any);
    form.append('model', 'whisper-1');
    form.append('language', 'zh');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          // 注意：不设置 Content-Type，让 fetch 自动生成 multipart/form-data 带 boundary
        },
        body: form as any,
        signal: controller.signal,
      });

      if (!response.ok) {
        console.warn(`[stt] API returned ${response.status}`);
        return null;
      }

      const data = (await response.json()) as { text?: string };
      return data.text ?? null;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      console.warn('[stt] transcription timeout');
    } else {
      console.warn('[stt] transcription failed:', error);
    }
    return null;
  }
}

// ==================== 一站式入口 ====================

/**
 * 一步完成：录音 → 停止 → 转录 → 清理。
 * 供 UI 层一行调用。
 *
 * @returns STTResult | null（用户取消 / 权限不足 / 识别失败均返回 null）
 */
export async function recordAndTranscribe(
  config: AITextConfig,
  onStatusChange: (status: RecordingStatus) => void,
): Promise<STTResult | null> {
  let recordingRef: Audio.Recording | null = null;
  let filePath: string | null = null;

  try {
    // 1. 检查权限
    const granted = await requestAudioPermission();
    if (!granted) {
      return null;
    }

    // 2. 开始录音
    onStatusChange('recording');
    recordingRef = await startRecording();

    // 3. 轮询等待录音完成（maxDuration 到期自动停止）
    let durationMillis = 0;
    while (true) {
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
      const status = await recordingRef.getStatusAsync();
      if (status.isDoneRecording) {
        durationMillis = status.durationMillis ?? 0;
        break;
      }
    }

    // 4. 停止录音并获取文件路径
    filePath = await stopRecording(recordingRef);
    recordingRef = null; // 已 unload，不再持有引用

    // 5. 最短有效录音检查（< 0.5s 静默丢弃）
    if (durationMillis < MIN_DURATION_MS) {
      return null;
    }

    // 6. 检查文件是否存在且有内容
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    if (!fileInfo.exists || (fileInfo as any).size === 0) {
      return null;
    }

    // 7. 转录
    onStatusChange('processing');
    const text = await transcribeAudio(config, filePath);

    if (!text) {
      return null;
    }

    return { text, durationMs: durationMillis };
  } catch {
    return null;
  } finally {
    // 8. 清理临时文件
    if (filePath) {
      await cleanupRecording(filePath);
    }
    // 停止仍在录音的对象（防止异常中断后残留）
    if (recordingRef) {
      try {
        const status = await recordingRef.getStatusAsync();
        if (status.isRecording) {
          await recordingRef.stopAndUnloadAsync();
        }
      } catch {
        // ignore
      }
    }
    onStatusChange('idle');
  }
}

/**
 * 清理录音临时文件。
 */
export async function cleanupRecording(filePath: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(filePath, { idempotent: true });
  } catch {
    // 静默忽略：文件可能已被清理或不存在
  }
}
