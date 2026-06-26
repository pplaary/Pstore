/**
 * STT 服务层单元测试
 *
 * 测试麦克风权限流程、录音启动/停止/取消、Whisper API 调用 mock、错误处理。
 * spec-v4.5 §9（语音输入）
 *
 * 运行：npx vitest run src/__tests__/stt.test.ts
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ==================== Mock 模块 ====================

// expo-av mock
const mockRecordingInstance = {
  prepareToRecordAsync: vi.fn(),
  startAsync: vi.fn(),
  stopAndUnloadAsync: vi.fn(),
  getStatusAsync: vi.fn(),
  getURI: vi.fn(() => 'file:///tmp/test-recording.m4a'),
};

vi.mock('expo-av', () => {
  const actual = vi.importActual('expo-av');
  return {
    ...actual,
    Audio: {
      requestPermissionsAsync: vi.fn(),
      setAudioModeAsync: vi.fn(),
      Recording: vi.fn(() => mockRecordingInstance),
      RecordingOptionsPresets: {
        HIGH_QUALITY: {
          android: { outputFormat: 0, audioEncoder: 0 },
          ios: { outputFormat: 0, audioEncoder: 0 },
        },
      },
      AndroidOutputFormat: { MPEG_4: 2 },
      AndroidAudioEncoder: { AAC: 3 },
      IOSOutputFormat: { MPEG4AAC: 1 },
    },
  };
});

// expo-file-system mock
vi.mock('expo-file-system', () => ({
  deleteAsync: vi.fn(async () => {}),
  getInfoAsync: vi.fn(async () => ({ exists: true, size: 1024 })),
}));

// expo-sqlite mock（ai.ts 依赖链）
vi.mock('expo-sqlite', () => ({
  SQLiteDatabase: class MockDB {},
  openDatabaseAsync: vi.fn(),
}));

// expo-secure-store mock
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}));

// 全局 fetch mock
const mockFetch = vi.fn(async () =>
  Promise.resolve(
    new Response(JSON.stringify({ text: 'hello from whisper' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )
);

// ==================== 导入 ====================

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import {
  requestAudioPermission,
  startRecording,
  stopRecording,
  transcribeAudio,
  recordAndTranscribe,
  cleanupRecording,
  CANCEL_THRESHOLD_DP,
  MIN_DURATION_MS,
  MAX_DURATION_MS,
  type STTResult,
  type RecordingStatus,
} from '../services/stt';

// 引用 mock 实例以便在测试中操控
const mockRecording = mockRecordingInstance as any;

// ==================== 辅助函数 ====================

function makeAIConfig(overrides: { apiUrl?: string; apiKey?: string; textModel?: string } = {}) {
  return {
    apiUrl: 'https://ai.example.com/v1/chat/completions',
    apiKey: 'sk-test-key',
    textModel: 'gpt-4',
    ...overrides,
  };
}

function resetMocks(): void {
  vi.clearAllMocks();
  // 默认：权限已授权
  (Audio.requestPermissionsAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'granted' });
  // 默认：录音完成，0.5s+ 时长
  mockRecording.prepareToRecordAsync.mockResolvedValue(undefined);
  mockRecording.startAsync.mockResolvedValue(undefined);
  mockRecording.getStatusAsync
    .mockResolvedValueOnce({ isDoneRecording: false, isRecording: true })
    .mockResolvedValueOnce({ isDoneRecording: true, durationMillis: 600, isRecording: false });
  mockRecording.stopAndUnloadAsync.mockResolvedValue(undefined);
  mockRecording.getURI.mockReturnValue('file:///tmp/test-recording.m4a');
  // FileSystem 默认：文件存在
  (FileSystem.getInfoAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ exists: true, size: 2048 });
  // fetch 默认：200 + 文本
  global.fetch = mockFetch;
  mockFetch.mockResolvedValue(
    new Response(JSON.stringify({ text: '两瓶可乐' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

// ==================== 测试 ====================

describe('STT 服务层', () => {
  beforeEach(() => {
    resetMocks();
  });

  // ---- requestAudioPermission ----

  describe('requestAudioPermission', () => {
    it('授权后返回 true', async () => {
      (Audio.requestPermissionsAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'granted' });
      const result = await requestAudioPermission();
      expect(result).toBe(true);
      expect(Audio.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('拒绝后返回 false', async () => {
      (Audio.requestPermissionsAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'denied' });
      const result = await requestAudioPermission();
      expect(result).toBe(false);
    });

    it('调用异常时返回 false', async () => {
      (Audio.requestPermissionsAsync as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('System error'));
      const result = await requestAudioPermission();
      expect(result).toBe(false);
    });
  });

  // ---- startRecording ----

  describe('startRecording', () => {
    it('调用 setAudioModeAsync 配置录音模式', async () => {
      await startRecording();
      expect(Audio.setAudioModeAsync).toHaveBeenCalledWith({
        allowsRecordingIOS: true,
        staysActiveInBackground: false,
        playThroughEarpieceAndroid: false,
      });
    });

    it('prepareToRecordAsync 使用 HIGH_QUALITY 预设并设置 AAC 编码', async () => {
      await startRecording();
      expect(mockRecording.prepareToRecordAsync).toHaveBeenCalledTimes(1);
      const options = mockRecording.prepareToRecordAsync.mock.calls[0][0];
      expect(options.android.outputFormat).toBe(Audio.AndroidOutputFormat.MPEG_4);
      expect(options.android.audioEncoder).toBe(Audio.AndroidAudioEncoder.AAC);
      expect(options.ios.outputFormat).toBe(Audio.IOSOutputFormat.MPEG4AAC);
    });

    it('启动录音后返回 recording 实例', async () => {
      const rec = await startRecording();
      expect(mockRecording.startAsync).toHaveBeenCalled();
      expect(rec).toBe(mockRecording);
    });
  });

  // ---- stopRecording ----

  describe('stopRecording', () => {
    it('停止录音并返回文件 URI', async () => {
      mockRecording.getURI.mockReturnValue('file:///tmp/recording.m4a');
      mockRecording.stopAndUnloadAsync.mockResolvedValue(undefined);
      const uri = await stopRecording(mockRecording);
      expect(mockRecording.stopAndUnloadAsync).toHaveBeenCalled();
      expect(uri).toBe('file:///tmp/recording.m4a');
    });

    it('getURI 返回 null 时抛出错误', async () => {
      mockRecording.getURI.mockReturnValue(null);
      await expect(stopRecording(mockRecording)).rejects.toThrow('Recording URI is null after stop');
    });
  });

  // ---- transcribeAudio ----

  describe('transcribeAudio', () => {
    const config = makeAIConfig();

    it('正确构造 FormData 包含 model 和 language', async () => {
      const formCheck = new Map<string, any>();
      const origFormData = global.FormData;
      // 直接通过 mock fetch 的 body 检查不太可行，改用 spy
      // 这里通过检查 fetch 调用参数间接验证
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ text: 'test' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await transcribeAudio(config, 'file:///tmp/test.m4a');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0] as any[];
      expect(call[0]).toContain('/v1/audio/transcriptions');
      expect(call[1].method).toBe('POST');
      expect(call[1].headers.Authorization).toBe('Bearer sk-test-key');
      // FormData body
      const body = call[1].body as FormData;
      expect(body).toBeInstanceOf(FormData);
      // 验证 FormData 字段（Node 环境下通过 entries 迭代）
      const entries = Array.from((body as any).entries());
      const fileEntry = (entries as any).find(([k]: any) => k === 'file');
      expect(fileEntry).toBeDefined();
      expect((fileEntry as any)[1]).toBeDefined();
      expect(body.get('model')).toBe('whisper-1');
      expect(body.get('language')).toBe('zh');
    });

    it('成功转录返回文本', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ text: '两瓶可乐' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const result = await transcribeAudio(config, 'file:///tmp/test.m4a');
      expect(result).toBe('两瓶可乐');
    });

    it('API 返回 { text: null } 时返回 null', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ text: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const result = await transcribeAudio(config, 'file:///tmp/test.m4a');
      expect(result).toBeNull();
    });

    it('API 返回空对象时返回 null', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const result = await transcribeAudio(config, 'file:///tmp/test.m4a');
      expect(result).toBeNull();
    });

    it('API 超时（AbortError）返回 null', async () => {
      mockFetch.mockRejectedValue(new DOMException('The user aborted a request.', 'AbortError'));
      const result = await transcribeAudio(config, 'file:///tmp/test.m4a');
      expect(result).toBeNull();
    });

    it('API 返回非 200 时返回 null', async () => {
      mockFetch.mockResolvedValue(
        new Response('Server Error', { status: 500, headers: { 'Content-Type': 'text/plain' } })
      );
      const result = await transcribeAudio(config, 'file:///tmp/test.m4a');
      expect(result).toBeNull();
    });

    it('API 返回 401 时返回 null', async () => {
      mockFetch.mockResolvedValue(
        new Response('Unauthorized', { status: 401, headers: { 'Content-Type': 'text/plain' } })
      );
      const result = await transcribeAudio(config, 'file:///tmp/test.m4a');
      expect(result).toBeNull();
    });

    it('网络不可达（TypeError）返回 null', async () => {
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));
      const result = await transcribeAudio(config, 'file:///tmp/test.m4a');
      expect(result).toBeNull();
    });

    it('超时使用 AbortController', async () => {
      let resolveFetch: (value: Response) => void;
      const fetchPromise = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
      mockFetch.mockReturnValue(fetchPromise as Promise<Response>);

      const resultPromise = transcribeAudio(config, 'file:///tmp/test.m4a');

      // 等待超时触发（15s）。为加速测试，检查 AbortController 被使用：
      // transcribeAudio 内部使用 new AbortController() + setTimeout(abort, 15000)
      // 由于不能等 15s，验证 fetch 的 signal 参数
      const call = mockFetch.mock.calls[0] as any[];
      expect(call[1].signal).toBeDefined();
      expect(call[1].signal.constructor.name).toBe('AbortSignal');

      // 清理：resolve fetch 避免未处理的 promise
      resolveFetch!(
        new Response(JSON.stringify({ text: 'test' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      const result = await resultPromise;
      expect(result).toBe('test');
    });

    it('apiUrl 不带尾部斜杠时正确拼接端点', async () => {
      const cfg = makeAIConfig({ apiUrl: 'https://ai.example.com' });
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ text: 'test' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await transcribeAudio(cfg, 'file:///tmp/test.m4a');

      const call = mockFetch.mock.calls[0] as any[];
      expect(call[0]).toBe('https://ai.example.com/v1/audio/transcriptions');
    });

    it('apiUrl 已是 /v1/audio/transcriptions 时不再拼接', async () => {
      const cfg = makeAIConfig({ apiUrl: 'https://ai.example.com/v1/audio/transcriptions' });
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ text: 'test' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await transcribeAudio(cfg, 'file:///tmp/test.m4a');

      const call = mockFetch.mock.calls[0] as any[];
      expect(call[0]).toBe('https://ai.example.com/v1/audio/transcriptions');
    });
  });

  // ---- recordAndTranscribe ----

  describe('recordAndTranscribe', () => {
    const config = makeAIConfig();

    it('权限未授权时返回 null，不抛出异常', async () => {
      (Audio.requestPermissionsAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'denied' });

      const statuses: RecordingStatus[] = [];
      const result = await recordAndTranscribe(config, (s) => statuses.push(s));

      expect(result).toBeNull();
      // 不会进入录音状态
      expect(statuses.filter((s) => s === 'recording')).toHaveLength(0);
    });

    it('授权 + 录音 + 转录成功返回 STTResult', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ text: '一瓶牛奶' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const statuses: RecordingStatus[] = [];
      const result = await recordAndTranscribe(config, (s) => statuses.push(s));

      expect(result).not.toBeNull();
      expect(result!.text).toBe('一瓶牛奶');
      expect(result!.durationMs).toBe(600);
      // 状态流转：recording → processing → idle
      expect(statuses).toContain('recording');
      expect(statuses).toContain('processing');
      expect(statuses[statuses.length - 1]).toBe('idle');
    });

    it('转录失败后调用 cleanupRecording 清理文件', async () => {
      // 模拟 getStatusAsync 返回 completed，然后转录失败
      mockRecording.getStatusAsync
        .mockResolvedValueOnce({ isDoneRecording: false, isRecording: true })
        .mockResolvedValueOnce({ isDoneRecording: true, durationMillis: 800, isRecording: false });

      mockFetch.mockResolvedValue(
        new Response('', { status: 500, headers: { 'Content-Type': 'text/plain' } })
      );

      const result = await recordAndTranscribe(config, () => {});

      expect(result).toBeNull();
      expect(FileSystem.deleteAsync).toHaveBeenCalled();
    });

    it('录音时长 < 500ms 静默丢弃，不调用转录 API', async () => {
      // 模拟极短录音
      vi.mocked(mockRecording.getStatusAsync).mockReset();
      mockRecording.getStatusAsync
        .mockResolvedValueOnce({ isDoneRecording: false, isRecording: true })
        .mockResolvedValueOnce({ isDoneRecording: true, durationMillis: 200, isRecording: false });

      const result = await recordAndTranscribe(config, () => {});

      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('录音时长 = 0 静默丢弃', async () => {
      vi.mocked(mockRecording.getStatusAsync).mockReset();
      mockRecording.getStatusAsync
        .mockResolvedValueOnce({ isDoneRecording: false, isRecording: true })
        .mockResolvedValueOnce({ isDoneRecording: true, durationMillis: 0, isRecording: false });

      const result = await recordAndTranscribe(config, () => {});

      expect(result).toBeNull();
    });

    it('文件不存在时返回 null', async () => {
      mockRecording.getStatusAsync
        .mockResolvedValueOnce({ isDoneRecording: false, isRecording: true })
        .mockResolvedValueOnce({ isDoneRecording: true, durationMillis: 600, isRecording: false });

      (FileSystem.getInfoAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ exists: false });

      const result = await recordAndTranscribe(config, () => {});

      expect(result).toBeNull();
    });

    it('文件大小为 0 时返回 null', async () => {
      mockRecording.getStatusAsync
        .mockResolvedValueOnce({ isDoneRecording: false, isRecording: true })
        .mockResolvedValueOnce({ isDoneRecording: true, durationMillis: 600, isRecording: false });

      (FileSystem.getInfoAsync as ReturnType<typeof vi.fn>).mockResolvedValue({ exists: true, size: 0 });

      const result = await recordAndTranscribe(config, () => {});

      expect(result).toBeNull();
    });

    it('转录 API 返回空文本时返回 null', async () => {
      mockRecording.getStatusAsync
        .mockResolvedValueOnce({ isDoneRecording: false, isRecording: true })
        .mockResolvedValueOnce({ isDoneRecording: true, durationMillis: 600, isRecording: false });

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ text: '' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await recordAndTranscribe(config, () => {});

      expect(result).toBeNull();
    });

    it('始终调用 cleanupRecording 清理临时文件', async () => {
      mockRecording.getStatusAsync
        .mockResolvedValueOnce({ isDoneRecording: false, isRecording: true })
        .mockResolvedValueOnce({ isDoneRecording: true, durationMillis: 600, isRecording: false });

      await recordAndTranscribe(config, () => {});

      // cleanupRecording 在 finally 中调用
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
        'file:///tmp/test-recording.m4a',
        { idempotent: true }
      );
    });

    it('onStatusChange 回调接收状态变化', async () => {
      const statuses: RecordingStatus[] = [];
      await recordAndTranscribe(config, (s) => statuses.push(s));

      // 至少包含 recording 和 processing（成功路径）
      expect(statuses).toContain('recording');
      expect(statuses).toContain('processing');
    });
  });

  // ---- cleanupRecording ----

  describe('cleanupRecording', () => {
    it('正常删除文件', async () => {
      await cleanupRecording('file:///tmp/test.m4a');
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///tmp/test.m4a', { idempotent: true });
    });

    it('文件不存在时不抛异常（idempotent）', async () => {
      (FileSystem.deleteAsync as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('File not found')
      );
      // 不应抛出
      await expect(cleanupRecording('file:///tmp/nonexistent.m4a')).resolves.toBeUndefined();
    });
  });

  // ---- 常量 ----

  describe('常量', () => {
    it('CANCEL_THRESHOLD_DP 为 80', () => {
      expect(CANCEL_THRESHOLD_DP).toBe(80);
    });

    it('MIN_DURATION_MS 为 500', () => {
      expect(MIN_DURATION_MS).toBe(500);
    });

    it('MAX_DURATION_MS 为 15000', () => {
      expect(MAX_DURATION_MS).toBe(15000);
    });
  });

  // ---- 静默超时（静默降级） ----

  describe('静默超时处理', () => {
    it('API 不可达时静默返回 null，不抛异常', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
      const config = makeAIConfig();
      const result = await transcribeAudio(config, 'file:///tmp/test.m4a');
      expect(result).toBeNull();
    });

    it('recordAndTranscribe 整体异常时静默返回 null', async () => {
      // 使 startRecording 抛出异常
      mockRecording.prepareToRecordAsync.mockRejectedValue(new Error('Audio system error'));

      const result = await recordAndTranscribe(makeAIConfig(), () => {});
      expect(result).toBeNull();
    });
  });
});
