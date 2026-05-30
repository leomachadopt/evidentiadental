import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type Stripe from 'stripe';
import { query } from '../db/client.js';
import { config } from '../lib/config.js';
import { stripe, tierForPrice } from '../lib/stripe.js';
import { authRequired } from '../middleware/auth.js';
import { getUsageStatus } from '../middleware/tier-limits.js';
import { emitFunnelEvent, type FunnelEvent, type FunnelPayload } from '../lib/marketing.js';
import { applyFriendWelcomeCredit } from '../services/referral-service.js';

export const billingRouter = Router();
billingRouter.use(authRequired);

// GET /api/billing/status — plan, trial, and today's usage vs limit
billingRouter.get('/status', async (req, res) => {
  const status = await getUsageStatus(req.userId!);
  res.json(status);
});

const PRICE_BY_PLAN: Record<string, string | undefined> = {
  monthly: config.STRIPE_PRICE_MONTHLY,
  annual: config.STRIPE_PRICE_ANNUAL,
};

// POST /api/billing/checkout — create a Stripe Checkout Session for the chosen
// plan. The Stripe customer (and its email) is reused from the user's record so
// the buyer never re-enters data collected at sign-up; the plan is fixed as a
// line item so Stripe doesn't ask them to choose again; and the 7-day trial is
// defined here in code instead of depending on dashboard configuration.
billingRouter.post('/checkout', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Billing não configurado.' });

  const schema = z.object({ plan: z.enum(['monthly', 'annual']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const price = PRICE_BY_PLAN[parsed.data.plan];
  if (!price) {
    return res.status(503).json({ error: `Plano ${parsed.data.plan} não configurado (price ID em falta).` });
  }

  const userRes = await query<{ email: string; name: string | null; stripe_customer_id: string | null }>(
    'SELECT email, name, stripe_customer_id FROM users WHERE id = $1',
    [req.userId],
  );
  if (userRes.rows.length === 0) return res.status(404).json({ error: 'Utilizador não encontrado' });

  // Remember the chosen cadence so the funnel can segment monthly vs annual.
  await query('UPDATE users SET plan_interval = $1 WHERE id = $2', [parsed.data.plan, req.userId]);

  // Reuse the customer if we have one, otherwise create it now so the email is
  // prefilled and the webhook can map subscription events back to this user.
  let customerId = userRes.rows[0].stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userRes.rows[0].email,
      metadata: { userId: req.userId! },
    });
    customerId = customer.id;
    await query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, req.userId]);
  }

  // Amigo indicado: crédito único de boas-vindas (€5) na 1ª fatura, via Customer
  // Balance — o preço listado continua €9,90 e o desconto entra como crédito.
  await applyFriendWelcomeCredit(req.userId!, customerId);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    subscription_data: { trial_period_days: 7 },
    client_reference_id: req.userId!,
    allow_promotion_codes: true,
    success_url: `${config.FRONTEND_URL}/billing?success=true`,
    cancel_url: `${config.FRONTEND_URL}/billing`,
  });

  if (!session.url) return res.status(502).json({ error: 'Stripe não devolveu URL de checkout.' });

  // Mark the user as "in checkout". If they never complete, MailerLite's
  // abandonment automation (gated on NOT being in the trial group) fires.
  await emitFunnelEvent('checkout_started', {
    email: userRes.rows[0].email,
    name: userRes.rows[0].name,
    userId: req.userId,
    plan: parsed.data.plan,
    stripeCustomerId: customerId,
  });

  res.json({ url: session.url });
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

/** Map a Stripe customer back to our user so funnel events carry email/name/plan. */
async function userByCustomer(customerId: string) {
  const r = await query<{ id: string; email: string; name: string | null; plan_interval: string | null }>(
    'SELECT id, email, name, plan_interval FROM users WHERE stripe_customer_id = $1',
    [customerId],
  );
  return r.rows[0] ?? null;
}

/** Emit a funnel event for the user behind a Stripe customer id. Best-effort. */
async function emitForCustomer(
  customerId: string,
  event: FunnelEvent,
  extra: Partial<FunnelPayload> = {},
) {
  const u = await userByCustomer(customerId);
  if (!u) {
    console.warn(`[billing] no user for customer ${customerId}; skipping ${event} funnel event`);
    return;
  }
  await emitFunnelEvent(event, {
    email: u.email,
    name: u.name,
    userId: u.id,
    plan: u.plan_interval,
    stripeCustomerId: customerId,
    ...extra,
  });
}

const subCustomerId = (sub: Stripe.Subscription) =>
  typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

const unixToIso = (ts: number | null | undefined) => (ts ? new Date(ts * 1000).toISOString() : null);

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
        // DB only. The trial_started funnel event is emitted from
        // checkout.session.completed so it fires exactly once with the email.
        await applySubscription(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const prev = event.data.previous_attributes as Partial<Stripe.Subscription> | undefined;
        await applySubscription(sub);

        // Trial -> paid (or any reactivation into active).
        if (sub.status === 'active' && prev?.status && prev.status !== 'active') {
          await emitForCustomer(subCustomerId(sub), 'subscription_active', {
            subscriptionStatus: 'active',
            currentPeriodEnd: unixToIso((sub as any).current_period_end),
          });
        } else if (sub.cancel_at_period_end === true && prev?.cancel_at_period_end === false) {
          // User scheduled cancellation. While still trialing this is the
          // "canceled the trial" signal the win-back / re-subscribe sequence needs.
          await emitForCustomer(subCustomerId(sub), 'trial_canceled', {
            subscriptionStatus: sub.status,
            currentPeriodEnd: unixToIso((sub as any).current_period_end),
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await cancelSubscription(sub);
        await emitForCustomer(subCustomerId(sub), 'subscription_canceled', {
          subscriptionStatus: 'canceled',
        });
        break;
      }

      case 'customer.subscription.trial_will_end': {
        // Stripe fires this ~3 days before the trial ends.
        const sub = event.data.object as Stripe.Subscription;
        await emitForCustomer(subCustomerId(sub), 'trial_will_end', {
          subscriptionStatus: sub.status,
          trialEndsAt: unixToIso(sub.trial_end),
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer?.id ?? null);
        if (customerId) await emitForCustomer(customerId, 'payment_failed', { subscriptionStatus: 'past_due' });
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        // The session carries our user id in client_reference_id. Link the
        // Stripe customer to that user before applying.
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
          // Single source of truth for "trial began" — fires once per checkout.
          if (customerId) {
            await emitForCustomer(customerId, 'trial_started', {
              subscriptionStatus: sub.status,
              trialEndsAt: unixToIso(sub.trial_end),
              currentPeriodEnd: unixToIso((sub as any).current_period_end),
            });
          }
        }
        break;
      }

      case 'checkout.session.expired': {
        // Started Stripe Checkout but never completed = cart abandonment.
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId =
          typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null);
        if (customerId) {
          await emitForCustomer(customerId, 'checkout_abandoned');
        } else if (session.customer_details?.email) {
          // No linked customer (rare): fall back to the email Stripe captured.
          await emitFunnelEvent('checkout_abandoned', {
            email: session.customer_details.email,
            userId: session.client_reference_id ?? null,
          });
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
