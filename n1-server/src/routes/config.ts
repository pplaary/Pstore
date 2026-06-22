import { Router, Request, Response } from 'express';
import { db } from '../db.js';

const router = Router();
const CONFIG_PIN = process.env.CONFIG_PIN || '0000';

// POST /api/config/get
router.post('/get', (_req: Request, res: Response) => {
  const keys = ['apiUrl', 'apiKey', 'textModel', 'visionModel'];
  const result: Record<string, string> = {};
  for (const key of keys) {
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
    result[key] = row ? row.value : '';
  }
  res.json(result);
});

// POST /api/config/set
router.post('/set', (req: Request, res: Response) => {
  const { pin, apiUrl, apiKey, textModel, visionModel } = req.body;

  if (pin !== CONFIG_PIN) {
    res.status(403).json({ error: 'invalid pin' });
    return;
  }

  const upsert = db.prepare(
    'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );

  const fields: Record<string, string | undefined> = { apiUrl, apiKey, textModel, visionModel };
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        upsert.run(key, value);
      }
    }
  });
  tx();

  res.json({ ok: true });
});

export default router;
