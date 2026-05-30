import { Router } from 'express';
import { config } from '../lib/config.js';
import { reconcileAllCircles } from '../services/referral-service.js';

export const cronRouter = Router();

/**
 * Reconciliação periódica dos círculos de indicações: ressincroniza
 * `users.circle_size` e o desconto Stripe de cada indicador com a realidade.
 * Corrige o caso de quem junta o círculo em trial e só converte depois, e
 * qualquer webhook perdido.
 *
 * Protegido por segredo partilhado (header `x-cron-secret` ou
 * `Authorization: Bearer <CRON_SECRET>`), para poder ser chamado por Vercel
 * Cron (GET) ou por um schedule do n8n (POST). No-op (503) se CRON_SECRET não
 * estiver configurado.
 */
async function handleReconcile(req: import('express').Request, res: import('express').Response) {
  const secret = config.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: 'CRON_SECRET não configurado.' });

  const provided =
    (req.headers['x-cron-secret'] as string | undefined) ??
    req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (provided !== secret) return res.status(403).json({ error: 'Forbidden' });

  const result = await reconcileAllCircles();
  console.log(`[cron] reconcile-circles: checked=${result.checked} changed=${result.changed}`);
  res.json({ ok: true, ...result });
}

cronRouter.get('/reconcile-circles', handleReconcile);
cronRouter.post('/reconcile-circles', handleReconcile);
