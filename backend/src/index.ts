import express from 'express';
import cors from 'cors';
import { config } from './lib/config.js';
import { authRouter } from './routes/auth.js';
import { searchesRouter } from './routes/searches.js';
import { libraryRouter } from './routes/library.js';
import { exportsRouter } from './routes/exports.js';
import { billingRouter, handleStripeWebhook } from './routes/billing.js';
import { handleBlobUpload } from './routes/uploads.js';
import { papersRouter } from './routes/papers.js';
import { settingsRouter } from './routes/settings.js';
import { friendsRouter } from './routes/friends.js';
import { adminRouter } from './routes/admin.js';
import { referralsRouter } from './routes/referrals.js';
import { cronRouter } from './routes/cron.js';

const app = express();

// Vercel mounts this service under a route prefix (vercel.json ->
// experimentalServices.backend.routePrefix). Depending on how the platform
// forwards requests the prefix may be present in req.url; locally it is absent.
// Strip it up-front so every route below matches whether or not it's there.
const SERVICE_PREFIX = '/_/backend';
app.use((req, _res, next) => {
  if (req.url === SERVICE_PREFIX) req.url = '/';
  else if (req.url.startsWith(`${SERVICE_PREFIX}/`)) req.url = req.url.slice(SERVICE_PREFIX.length);
  next();
});

app.use(cors({ origin: config.FRONTEND_URL, credentials: true }));

// Stripe webhook needs the raw body for signature verification, so it must be
// registered BEFORE the JSON body parser.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, env: config.NODE_ENV }));

app.use('/api/auth', authRouter);
app.use('/api/searches', searchesRouter);
app.use('/api/searches', exportsRouter); // /:id/export/* (distinct paths, no conflict)
// Vercel Blob client-upload token endpoint — auth via clientPayload (JWT),
// so it must sit BEFORE the auth'd library router.
app.post('/api/library/blob-upload', handleBlobUpload);
app.use('/api/library', libraryRouter);
app.use('/api/billing', billingRouter);
app.use('/api/papers', papersRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/referrals', referralsRouter);
app.use('/api/cron', cronRouter);

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
