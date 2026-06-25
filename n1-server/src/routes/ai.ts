import { Router, Request, Response } from 'express';
import { buildChatCompletionsUrl, callAiJson, callAiText, getStreamChunkText, readAiErrorDetail } from '../ai/client';
import { isRecord, parseAiJsonResponse } from '../ai/json-utils';
import {
  type ItemType,
  getAllItems,
  getDateBoundaries,
  getDynamicCategories,
  normalizeExpiringDays,
  normalizeItemDraftPayload,
  normalizeQueryResponseStyle,
  validateImageDataUrl,
} from '../ai/items';
import { parseItemImage, parseItemText } from '../ai/parse';
import {
  buildBatchParsePrompt,
  buildImageParseMessages,
  buildParsePrompt,
  buildQueryMessages,
} from '../ai/prompts';
import {
  buildEmptyBoxAnswer,
  buildInventoryAnswer,
  getSafeQueryStreamChunk,
  isInventoryQuestion,
  resolveQueryResult,
  stripQueryMetadata,
} from '../ai/query';
import type { ChatMessage } from '../ai/types';

const aiRouter = Router();

// ---------------------------------------------------------------------------
// AI config status
// ---------------------------------------------------------------------------

aiRouter.get('/config-status', (_req: Request, res: Response) => {
  const hasServerAiConfig =
    typeof process.env.AI_API_KEY === 'string' && process.env.AI_API_KEY.trim().length > 0;

  res.json({
    data: {
      hasServerAiConfig,
      defaultBaseUrl: process.env.AI_BASE_URL || 'https://api.openai.com',
      defaultModel: process.env.AI_MODEL || 'gpt-4o-mini',
    },
  });
});

// ---------------------------------------------------------------------------
// Parse — non-streaming
// ---------------------------------------------------------------------------

aiRouter.post('/parse', async (req: Request, res: Response) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';

    if (!text) {
      res.status(400).json({ error: 'Text is required' });
      return;
    }

    const apiKey = String(process.env.AI_API_KEY || '');
    const baseUrl = String(process.env.AI_BASE_URL || 'https://api.openai.com');
    const model = String(process.env.AI_MODEL || 'gpt-4o-mini');

    const result = await parseItemText(apiKey, baseUrl, model, text);

    if ('error' in result) {
      res.status(422).json({ error: result.error, raw: result.raw });
      return;
    }

    res.json({ data: result.data });
  } catch (error) {
    res.status(502).json({
      error: 'AI service error',
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ---------------------------------------------------------------------------
// Parse image — non-streaming
// ---------------------------------------------------------------------------

aiRouter.post('/parse-image', async (req: Request, res: Response) => {
  try {
    const validated = validateImageDataUrl(req.body?.image);

    if (!validated) {
      res.status(400).json({ error: 'A valid image data URL is required (data:image/...;base64,...)' });
      return;
    }

    const apiKey = String(process.env.AI_API_KEY || '');
    const baseUrl = String(process.env.AI_BASE_URL || 'https://api.openai.com');
    const model = String(process.env.AI_MODEL || 'gpt-4o-mini');

    const result = await parseItemImage(apiKey, baseUrl, model, validated.dataUrl);

    if ('error' in result) {
      res.status(422).json({ error: result.error, raw: result.raw });
      return;
    }

    res.json({ data: result.data });
  } catch (error) {
    res.status(502).json({
      error: 'AI service error',
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ---------------------------------------------------------------------------
// Parse batch — non-streaming
// ---------------------------------------------------------------------------

aiRouter.post('/parse-batch', async (req: Request, res: Response) => {
  try {
    const text: string = typeof req.body?.text === 'string' ? req.body.text : '';
    const items: string[] = text
      .split('\n')
      .map((item: string) => item.trim())
      .filter(Boolean);

    if (items.length === 0) {
      res.status(400).json({ error: 'Text is required' });
      return;
    }

    if (items.length > 20) {
      res.status(400).json({ error: 'Too many items, max 20' });
      return;
    }

    const apiKey = String(process.env.AI_API_KEY || '');
    const baseUrl = String(process.env.AI_BASE_URL || 'https://api.openai.com');
    const model = String(process.env.AI_MODEL || 'gpt-4o-mini');

    const settled = await Promise.allSettled(
      items.map((item: string) => parseItemText(apiKey, baseUrl, model, item)),
    );

    const results = settled.map((result, index) => {
      if (result.status === 'fulfilled') {
        if ('error' in result.value) {
          return {
            index,
            success: false,
            error: result.value.error,
            raw: result.value.raw,
          };
        }

        return {
          index,
          success: true,
          item: result.value.data,
        };
      }

      return {
        index,
        success: false,
        error: 'AI service error',
        raw: result.reason instanceof Error ? result.reason.message : String(result.reason),
      };
    });

    res.json({ data: { results } });
  } catch (error) {
    res.status(502).json({
      error: 'AI service error',
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ---------------------------------------------------------------------------
// Query — non-streaming
// ---------------------------------------------------------------------------

aiRouter.post('/query', async (req: Request, res: Response) => {
  try {
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    const expiringDays = normalizeExpiringDays(req.body?.expiringDays);
    const responseStyle = normalizeQueryResponseStyle(req.body?.responseStyle);

    if (!question) {
      res.status(400).json({ error: 'Question is required' });
      return;
    }

    const items = getAllItems();
    const { todayStr, in30daysStr } = getDateBoundaries(expiringDays);

    if (items.length === 0) {
      res.json({
        data: {
          answer: buildEmptyBoxAnswer(responseStyle),
          items: [],
        },
      });
      return;
    }

    if (isInventoryQuestion(question)) {
      res.json({
        data: {
          answer: buildInventoryAnswer(items, todayStr, in30daysStr, expiringDays, responseStyle),
          items,
        },
      });
      return;
    }

    const apiKey = String(process.env.AI_API_KEY || '');
    const baseUrl = String(process.env.AI_BASE_URL || 'https://api.openai.com');
    const model = String(process.env.AI_MODEL || 'gpt-4o-mini');

    const raw = await callAiText(
      apiKey,
      baseUrl,
      model,
      buildQueryMessages(question, items, todayStr, in30daysStr, expiringDays, responseStyle),
    );
    const result = resolveQueryResult(
      raw,
      items,
      todayStr,
      in30daysStr,
      expiringDays,
      responseStyle,
    );

    if ('error' in result) {
      res.status(422).json({ error: result.error, raw: result.raw });
      return;
    }

    res.json(result);
  } catch (error) {
    res.status(502).json({
      error: 'AI service error',
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ---------------------------------------------------------------------------
// Query — SSE streaming
// ---------------------------------------------------------------------------

aiRouter.post('/query-stream', async (req: Request, res: Response) => {
  try {
    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    const expiringDays = normalizeExpiringDays(req.body?.expiringDays);
    const responseStyle = normalizeQueryResponseStyle(req.body?.responseStyle);

    if (!question) {
      res.status(400).json({ error: 'Question is required' });
      return;
    }

    const items = getAllItems();
    const { todayStr, in30daysStr } = getDateBoundaries(expiringDays);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (payload: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    if (items.length === 0) {
      sendEvent({ type: 'text', content: buildEmptyBoxAnswer(responseStyle) });
      sendEvent({ type: 'done', answer: buildEmptyBoxAnswer(responseStyle), items: [] });
      res.end();
      return;
    }

    if (isInventoryQuestion(question)) {
      const answer = buildInventoryAnswer(items, todayStr, in30daysStr, expiringDays, responseStyle);
      sendEvent({ type: 'text', content: answer });
      sendEvent({ type: 'done', answer, items });
      res.end();
      return;
    }

    const apiKey = String(process.env.AI_API_KEY || '');
    const baseUrl = String(process.env.AI_BASE_URL || 'https://api.openai.com');
    const model = String(process.env.AI_MODEL || 'gpt-4o-mini');

    const upstreamResponse = await fetch(buildChatCompletionsUrl(baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: buildQueryMessages(question, items, todayStr, in30daysStr, expiringDays, responseStyle),
        stream: true,
      }),
    });

    if (!upstreamResponse.ok) {
      const detail = await readAiErrorDetail(upstreamResponse);
      sendEvent({ type: 'error', message: detail });
      res.end();
      return;
    }

    if (!upstreamResponse.body) {
      sendEvent({ type: 'error', message: 'No response body' });
      res.end();
      return;
    }

    let accumulated = '';
    let pendingText = '';
    let buffer = '';
    const decoder = new TextDecoder();
    const reader = (upstreamResponse.body as ReadableStream<Uint8Array>).getReader();

    const appendContent = (content: string) => {
      accumulated += content;
      pendingText += content;

      const visibleText = getSafeQueryStreamChunk(pendingText);
      if (visibleText) {
        sendEvent({ type: 'text', content: visibleText });
        pendingText = pendingText.slice(visibleText.length);
      }
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(trimmed.indexOf(':') + 1).trim();
          if (payload === '[DONE]') continue;

          const content = getStreamChunkText(payload);
          if (content) {
            appendContent(content);
          }
        }
      }

      // Process final buffer
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data:')) {
          const payload = trimmed.slice(trimmed.indexOf(':') + 1).trim();
          if (payload !== '[DONE]') {
            const content = getStreamChunkText(payload);
            if (content) {
              appendContent(content);
            }
          }
        }
      }

      const result = resolveQueryResult(
        accumulated,
        items,
        todayStr,
        in30daysStr,
        expiringDays,
        responseStyle,
      );

      if ('error' in result) {
        sendEvent({ type: 'error', message: result.error });
      } else {
        const remaining = stripQueryMetadata(pendingText);
        if (remaining) {
          sendEvent({ type: 'text', content: remaining });
        }
        sendEvent({
          type: 'done',
          answer: result.data.answer,
          items: result.data.items,
        });
      }
    } catch (err) {
      sendEvent({
        type: 'error',
        message: err instanceof Error ? err.message : 'Stream error',
      });
    } finally {
      res.end();
    }
  } catch (error) {
    if (!res.headersSent) {
      res.status(502).json({
        error: 'AI service error',
        detail: error instanceof Error ? error.message : 'Unknown error',
      });
    } else {
      res.end();
    }
  }
});

// ---------------------------------------------------------------------------
// Test connection
// ---------------------------------------------------------------------------

aiRouter.post('/test', async (req: Request, res: Response) => {
  try {
    const apiKey = String(process.env.AI_API_KEY || '');
    const baseUrl = String(process.env.AI_BASE_URL || 'https://api.openai.com');
    const model = String(process.env.AI_MODEL || 'gpt-4o-mini');

    const { parsed, raw } = await callAiJson<{
      ok?: boolean;
      message?: string;
    } | null>(apiKey, baseUrl, model, [
      {
        role: 'system',
        content: `你是一个 API 连通性测试助手。

请严格返回 JSON，不要包含任何额外文字：
{
  "ok": true,
  "message": "连接成功"
}`,
      },
      {
        role: 'user',
        content: '请测试当前 API Key、Base URL 和模型是否可以正常完成一次请求。',
      },
    ]);

    if (!parsed || typeof parsed !== 'object' || parsed.ok !== true) {
      res.status(422).json({ error: 'AI returned invalid format', raw });
      return;
    }

    res.json({
      data: {
        ok: true,
        message: typeof parsed.message === 'string' ? parsed.message : '连接成功',
        model,
        baseUrl,
      },
    });
  } catch (error) {
    res.status(502).json({
      error: 'AI service error',
      detail: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default aiRouter;
