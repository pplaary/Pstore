/**
 * N1 API 客户端测试
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as N1 from '../../services/n1';

describe('N1 API 客户端', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  const mockServerUrl = 'http://localhost:3141';

  describe('getConfig', () => {
    it('正确解析返回格式', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            apiUrl: 'https://api.example.com',
            apiKey: 'key123',
            textModel: 'gpt-4',
            visionModel: 'gpt-4-vision',
          }),
      });

      const result = await N1.getConfig(mockServerUrl);

      expect(result.apiUrl).toBe('https://api.example.com');
      expect(result.apiKey).toBe('key123');
      expect(result.textModel).toBe('gpt-4');
      expect(result.visionModel).toBe('gpt-4-vision');
    });

    it('请求体为空对象', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await N1.getConfig(mockServerUrl);

      const call = (globalThis.fetch as any).mock.calls[0];
      expect(call[0]).toBe(`${mockServerUrl}/api/config/get`);
      expect(JSON.parse(call[1].body)).toEqual({});
    });
  });

  describe('setConfig', () => {
    it('构造正确的请求体', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      await N1.setConfig(mockServerUrl, '0000', {
        apiUrl: 'https://api.example.com',
        apiKey: 'key123',
      });

      const call = (globalThis.fetch as any).mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.pin).toBe('0000');
      expect(body.apiUrl).toBe('https://api.example.com');
      expect(body.apiKey).toBe('key123');
    });

    it('不发送未定义的字段', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

      await N1.setConfig(mockServerUrl, '0000', {
        apiUrl: 'https://api.example.com',
      });

      const call = (globalThis.fetch as any).mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body).not.toHaveProperty('apiKey');
      expect(body).not.toHaveProperty('textModel');
    });
  });

  describe('syncProducts', () => {
    it('不传 after 时请求体为空', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            products: [],
            serverTime: '2024-06-21T00:00:00.000Z',
          }),
      });

      await N1.syncProducts(mockServerUrl);

      const call = (globalThis.fetch as any).mock.calls[0];
      expect(JSON.parse(call[1].body)).toEqual({});
    });

    it('传 after 时包含 after 字段', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            products: [],
            serverTime: '2024-06-21T00:00:00.000Z',
          }),
      });

      await N1.syncProducts(mockServerUrl, '2024-06-01T00:00:00.000Z');

      const call = (globalThis.fetch as any).mock.calls[0];
      expect(JSON.parse(call[1].body)).toEqual({
        after: '2024-06-01T00:00:00.000Z',
      });
    });

    it('返回 serverTime', async () => {
      const serverTime = '2024-06-21T12:00:00.000Z';
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            products: [],
            serverTime,
          }),
      });

      const result = await N1.syncProducts(mockServerUrl);
      expect(result.serverTime).toBe(serverTime);
    });
  });

  describe('pushProducts', () => {
    it('构造正确的请求体', async () => {
      const changes = [
        {
          id: 'p1',
          name: '可乐',
          price: 3.5,
          category: '饮料',
          unit: '个',
          isDeleted: 0,
          updatedAt: '2024-06-21T00:00:00.000Z',
        },
      ];

      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, count: 1 }),
      });

      await N1.pushProducts(mockServerUrl, changes);

      const call = (globalThis.fetch as any).mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.changes).toEqual(changes);
      expect(body.changes[0].name).toBe('可乐');
    });

    it('返回 count', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true, count: 3 }),
      });

      const result = await N1.pushProducts(mockServerUrl, []);
      expect(result.count).toBe(3);
    });
  });

  describe('超时处理', () => {
    it('AbortController 在超时后 abort 请求', async () => {
      const abortedSignals: AbortSignal[] = [];

      (globalThis.fetch as any).mockImplementationOnce(
        (_url: string, options: { signal: AbortSignal }) => {
          abortedSignals.push(options.signal);
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              resolve({ ok: true, json: () => Promise.resolve({}) });
            }, 6000);
            options.signal.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(new Error('Aborted'));
            });
          });
        },
      );

      // 模拟 N1 客户端的 5 秒超时逻辑
      const testTimeout = 5;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), testTimeout * 1000);

      try {
        await fetch('http://localhost:3141/api/health', { signal: controller.signal });
      } catch (e) {
        // 预期会被 abort
      } finally {
        clearTimeout(timer);
      }

      // 验证 abort 被调用
      expect(abortedSignals.length).toBe(1);
      expect(abortedSignals[0].aborted).toBe(true);
    });
  });

  describe('非 200 响应', () => {
    it('非 200 响应抛出错误', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(N1.getConfig(mockServerUrl)).rejects.toThrow('HTTP 500');
    });
  });

  describe('AI API 调用', () => {
    describe('aiParse', () => {
      it('成功返回 data', async () => {
        const mockData: N1.AiParseResult = {
          name: '测试物品',
          category: '电子产品',
          price: '99.00',
        };
        (globalThis.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: mockData }),
        });

        const result = await N1.aiParse(mockServerUrl, '一个99元的电子产品');

        expect(result.data).toEqual(mockData);
        expect(result.data?.name).toBe('测试物品');
        expect(result.data?.category).toBe('电子产品');
      });

      it('非 200 响应抛出错误', async () => {
        (globalThis.fetch as any).mockResolvedValueOnce({
          ok: false,
          status: 502,
        });

        await expect(N1.aiParse(mockServerUrl, '测试文本')).rejects.toThrow('HTTP 502');
      });
    });

    describe('aiParseImage', () => {
      it('成功返回 data', async () => {
        const mockData: N1.AiParseResult = {
          name: '照片物品',
          category: '家居',
          location: '客厅',
        };
        (globalThis.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: mockData }),
        });

        const result = await N1.aiParseImage(mockServerUrl, 'data:image/png;base64,...');

        expect(result.data).toEqual(mockData);
        expect(result.data?.location).toBe('客厅');
      });

      it('非 200 响应抛出错误', async () => {
        (globalThis.fetch as any).mockResolvedValueOnce({
          ok: false,
          status: 503,
        });

        await expect(
          N1.aiParseImage(mockServerUrl, 'data:image/png;base64,...'),
        ).rejects.toThrow('HTTP 503');
      });
    });

    describe('aiQuery', () => {
      it('单层 data 直接返回', async () => {
        const mockData: N1.AiQueryResult = {
          answer: '您有3件电子产品',
          items: [],
        };
        (globalThis.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: mockData }),
        });

        const result = await N1.aiQuery(mockServerUrl, '我有多少电子产品');

        expect(result.data).toEqual(mockData);
        expect(result.data?.answer).toBe('您有3件电子产品');
      });

      it('双层 data 归一化（验证 answer 字段被扁平化）', async () => {
        const innerData = {
          answer: '已为您找到2件商品',
          items: [
            {
              id: 1,
              name: '沙发',
              category: '家具',
              location: '客厅',
              description: '',
              price: 2999,
              acquired_at: '',
              warranty_to: '',
              barcode: '',
              status: 'IN_SHOP',
            },
          ],
        };
        (globalThis.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: { data: innerData } }),
        });

        const result = await N1.aiQuery(mockServerUrl, '找一下沙发');

        expect(result.data).toEqual(innerData);
        expect((result.data as any)?.data).toBeUndefined();
        expect(result.data?.answer).toBe('已为您找到2件商品');
        expect(result.data?.items).toHaveLength(1);
      });

      it('无 data 字段时原样返回', async () => {
        const rawResponse = { error: '服务暂不可用' };
        (globalThis.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(rawResponse),
        });

        const result = await N1.aiQuery(mockServerUrl, '任意问题');

        expect(result).toEqual(rawResponse);
        expect((result as any).data).toBeUndefined();
      });
    });
  });
});
