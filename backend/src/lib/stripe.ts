import Stripe from 'stripe';
import { config } from './config.js';

/**
 * Stripe client. Null when STRIPE_SECRET_KEY is not configured, so the rest of
 * the app can run (and the billing routes can return a clear 503) before
 * billing is wired up.
 */
export const stripe = config.STRIPE_SECRET_KEY ? new Stripe(config.STRIPE_SECRET_KEY) : null;

export type Tier = 'trial' | 'paid';

/**
 * Single paid plan billed monthly or annually — both Stripe prices map to the
 * same internal tier. Kept as a function so callers don't need to change.
 */
export function tierForPrice(_priceId: string | undefined): Tier {
  return 'paid';
}
