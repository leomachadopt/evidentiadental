import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type Stripe from 'stripe';
import { query } from '../db/client.js';
import { config } from '../lib/config.js';
import { stripe, tierForPrice } from '../lib/stripe.js';
import { authRequired } from '../middleware/auth.js';
import { getUsageStatus } from '../middleware/tier-limits.js';

export const billingRouter = Router();
billingRouter.use(authRequired);

// GET /api/billing/status — plan, trial, and today's usage vs limit
billingRouter.get('/status', async (req, res) => {
  const status = await getUsageStatus(req.userId!);
  res.json(status);
});

const LINK_BY_PLAN: Record<string, string | undefined> = {
  monthly: config.STRIPE_LINK_MONTHLY,
  annual: config.STRIPE_LINK_ANNUAL,
};

// POST /api/billing/checkout — return the Stripe Payment Link for this plan,
// tagged with client_reference_id so the webhook can map the payment back to
// this user (Payment Links are static URLs, so we pass identity via the query).
billingRouter.post('/checkout', async (req, res) => {
  const schema = z.object({ plan: z.enum(['monthly', 'annual']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const link = LINK_BY_PLAN[parsed.data.plan];
  if (!link) {
    return res.status(503).json({ error: `Plano ${parsed.data.plan} não configurado (Payment Link em falta).` });
  }

  const userRes = await query<{ email: string }>('SELECT email FROM users WHERE id = $1', [req.userId]);
  if (userRes.rows.length === 0) return res.status(404).json({ error: 'Utilizador não encontrado' });

  const url = new URL(link);
  url.searchParams.set('client_reference_id', req.userId!);
  url.searchParams.set('prefilled_email', userRes.rows[0].email);
  res.json({ url: url.toString() });
});

// POST /api/billing/portal — open the Stripe customer portal
billingRouter.post('/portal', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Billing não configurado.' });

  const userRes = await query<{ stripe_customer_id: string | null }>(
    'SELECT stripe_customer_id FROM users WHERE id = $1',
    [req.userId],
  );
  const customerId = userRes.rows[0]?.stripe_customer_id;
  if (!customerId) return res.status(400).json({ error: 'Sem subscrição ativa.' });

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${config.FRONTEND_URL}/billing`,
  });
  res.json({ url: session.url });
});

// ============================================================
// Webhook (mounted separately in index.ts with a raw body parser)
// ============================================================

async function applySubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const priceId = sub.items.data[0]?.price.id;
  const tier = tierForPrice(priceId);
  const periodEnd = (sub as any).current_period_end
    ? new Date((sub as any).current_period_end * 1000).toISOString()
    : null;

  await query(
    `UPDATE users
       SET subscription_tier = $1,
           subscription_status = $2,
           stripe_subscription_id = $3,
           current_period_end = $4
     WHERE stripe_customer_id = $5`,
    [tier, sub.status, sub.id, periodEnd, customerId],
  );
}

async function cancelSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  await query(
    `UPDATE users
       SET subscription_tier = 'trial',
           subscription_status = 'canceled',
           stripe_subscription_id = NULL
     WHERE stripe_customer_id = $1`,
    [customerId],
  );
}

export async function handleStripeWebhook(req: Request, res: Response) {
  if (!stripe || !config.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Webhook não configurado.' });
  }

  const sig = req.headers['stripe-signature'];
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig as string, config.STRIPE_WEBHOOK_SECRET);
  } catch (e: any) {
    console.error('[billing] webhook signature verification failed:', e.message);
    return res.status(400).json({ error: `Webhook Error: ${e.message}` });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await applySubscription(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await cancelSubscription(event.data.object as Stripe.Subscription);
        break;
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        // Payment Link carries our user id in client_reference_id. Link the
        // Stripe customer (created by the link) to that user before applying.
        const userId = session.client_reference_id;
        const customerId =
          typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null);
        if (userId && customerId) {
          await query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, userId]);
        }
        if (session.subscription) {
          const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await applySubscription(sub);
        }
        break;
      }
      default:
        break;
    }
  } catch (e: any) {
    console.error('[billing] webhook handler error:', e.message);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }

  res.json({ received: true });
}
