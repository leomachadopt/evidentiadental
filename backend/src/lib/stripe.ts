import Stripe from 'stripe';
import { config } from './config.js';

/**
 * Stripe client. Null when STRIPE_SECRET_KEY is not configured, so the rest of
 * the app can run (and the billing routes can return a clear 503) before
 * billing is wired up.
 */
export const stripe = config.STRIPE_SECRET_KEY ? new Stripe(config.STRIPE_SECRET_KEY) : null;

export type Tier = 'trial' | 'clinical' | 'pro';

/** Map a Stripe price id back to our internal tier. */
export function tierForPrice(priceId: string | undefined): Tier {
  if (priceId && priceId === config.STRIPE_PRICE_PRO) return 'pro';
  return 'clinical';
}
