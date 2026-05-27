import express from 'express';
import cors from 'cors';
import { config } from './lib/config.js';
import { authRouter } from './routes/auth.js';
import { searchesRouter } from './routes/searches.js';
import { libraryRouter } from './routes/library.js';
import { exportsRouter } from './routes/exports.js';
import { curatedRouter } from './routes/curated.js';
import { billingRouter, handleStripeWebhook } from './routes/billing.js';

const app = express();

app.use(cors({ origin: config.FRONTEND_URL, credentials: true }));

// Stripe webhook needs the raw body for signature verification, so it must be
// registered BEFORE the JSON body parser.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, env: config.NODE_ENV }));

app.use('/api/auth', authRouter);
app.use('/api/searches', searchesRouter);
app.use('/api/searches', exportsRouter); // /:id/export/* (distinct paths, no conflict)
app.use('/api/library', libraryRouter);
app.use('/api/curated', curatedRouter);
app.use('/api/billing', billingRouter);

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err);
  res.status(500).json({ error: err.message ?? 'Internal server error' });
});

app.listen(config.PORT, () => {
  console.log(`[server] EvidentiaDental API listening on http://localhost:${config.PORT}`);
  console.log(`[server] Environment: ${config.NODE_ENV}`);
  console.log(`[server] Claude model: ${config.CLAUDE_MODEL}`);
});
