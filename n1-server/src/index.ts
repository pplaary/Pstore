import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import configRouter from './routes/config.js';
import productsRouter from './routes/products.js';
import aiRouter from './routes/ai.js';

const app = express();
const PORT = process.env.PORT || 3141;

app.use(bodyParser.json());

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.use('/api/config', configRouter);
app.use('/api/products', productsRouter);
app.use('/api/ai', aiRouter);

app.listen(PORT, () => {
  console.log(`N1 server listening on :${PORT}`);
});
