/**
 * Marketing funnel events.
 *
 * The backend is a thin emitter: it POSTs a normalized funnel event to a single
 * n8n webhook (N8N_WEBHOOK_URL). n8n is the orchestrator — it upserts the
 * subscriber into MailerLite and assigns the right group; MailerLite automations
 * (triggered on group join) own the email timing and copy. This keeps marketing
 * logic out of the product code: campaigns can change without a redeploy.
 *
 * Design rules:
 * - Graceful no-op when N8N_WEBHOOK_URL is unset (mirrors the Stripe no-op).
 * - Never throws into the request path. A marketing failure must not break
 *   signup, checkout, or a Stripe webhook (Stripe would otherwise retry).
 * - Awaited (not fire-and-forget) so it actually completes on serverless
 *   (Vercel) where the function may freeze right after responding. A short
 *   timeout guards against a hung n8n stalling the user-facing request.
 */

import { config } from './config.js';

export type FunnelEvent =
  | 'signup' // account created (top of funnel)
  | 'checkout_started' // hit Stripe Checkout (used to gate abandonment)
  | 'checkout_abandoned' // Checkout session expired without completing
  | 'trial_started' // subscription created — 7-day card-upfront trial began
  | 'trial_will_end' // Stripe's 3-days-before-trial-end signal
  | 'trial_canceled' // user scheduled cancellation while still trialing (win-back)
  | 'subscription_active' // trial converted to paid (or reactivated)
  | 'payment_failed' // invoice payment failed (dunning)
  | 'subscription_canceled' // subscription fully ended (win-back)
  | 'referral_signup' // someone registered via a referral link
  | 'referral_first_payment' // a referred friend paid for the first time
  | 'circle_completed' // referrer reached 5 paying friends — subscription is now free
  | 'circle_broken' // referrer dropped below 5 — discount/free benefit reduced
  | 'password_reset'; // transactional: send the password-reset link to the user

export interface FunnelPayload {
  email: string;
  name?: string | null;
  userId?: string | null;
  plan?: string | null; // 'monthly' | 'annual'
  subscriptionStatus?: string | null; // trialing | active | past_due | canceled
  trialEndsAt?: string | null; // ISO
  currentPeriodEnd?: string | null; // ISO
  stripeCustomerId?: string | null;
  resetUrl?: string | null; // password_reset: the tokenized link to set a new password
  // Referrals: current circle state for the email copy ("estás em 4/5", etc.)
  circleSize?: number | null;
  discountPct?: number | null;
  isFree?: boolean | null;
}

const TIMEOUT_MS = 4000;

export async function emitFunnelEvent(event: FunnelEvent, payload: FunnelPayload): Promise<void> {
  const url = config.N8N_WEBHOOK_URL;
  if (!url) return; // funnel disabled — graceful no-op

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (config.N8N_WEBHOOK_SECRET) headers['x-evidentia-secret'] = config.N8N_WEBHOOK_SECRET;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ event, ...payload, sentAt: new Date().toISOString() }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`[marketing] ${event} -> n8n returned ${res.status}`);
    }
  } catch (e: any) {
    // Swallow: marketing plumbing must never break the product flow.
    console.error(`[marketing] failed to emit ${event}:`, e?.message ?? e);
  } finally {
    clearTimeout(timer);
  }
}
