import express, { Request, Response } from 'express';
import path from 'path';
import bodyParser from 'body-parser';
import configRouter from './routes/config.js';
import productsRouter from './routes/products.js';
import aiRouter from './routes/ai.js';
import { db } from './db.js';
import { buildChatCompletionsUrl } from './ai/client.js';

const app = express();
const PORT = process.env.PORT || 3141;

app.use(bodyParser.json());

// Serve web frontend (if built)
const webDist = path.resolve(process.cwd(), 'web/dist');
app.use(express.static(webDist, { fallthrough: true }));

// OpenAI-compatible proxy: forward /v1/chat/completions to configured AI backend
app.post('/v1/chat/completions', async (req: Request, res: Response) => {
  try {
    const row = db.prepare('SELECT key, value FROM config WHERE key IN (?, ?, ?)')
      .all('apiUrl', 'apiKey', 'textModel') as { key: string; value: string }[];
    const cfg: Record<string, string> = {};
    for (const { key, value } of row) cfg[key] = value;

    const apiKey = cfg.apiKey || process.env.AI_API_KEY || '';
    const baseUrl = cfg.apiUrl || process.env.AI_BASE_URL || 'https://api.openai.com';
    const model = cfg.textModel || req.body?.model || 'gpt-4o-mini';

    const url = buildChatCompletionsUrl(baseUrl);
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ ...req.body, model }),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (e: any) {
    res.status(502).json({ error: e.message || 'AI backend unreachable' });
  }
});

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.use('/api/config', configRouter);
app.use('/api/products', productsRouter);
app.use('/api/ai', aiRouter);

// SPA fallback
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(webDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`N1 server listening on :${PORT}`);
});
