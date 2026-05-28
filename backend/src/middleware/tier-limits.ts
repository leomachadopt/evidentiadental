/**
 * Access control — driven entirely by Stripe subscription state.
 *
 * A user can use the product only while their Stripe subscription is `trialing`
 * (the 7-day card-upfront trial) or `active` (paying). There is no app-level
 * free trial. Admins always have access.
 *
 * The subscription state is kept in sync by the Stripe webhook (routes/billing.ts).
 */

import type { RequestHandler } from 'express';
import { query } from '../db/client.js';

const SEARCH_LIMIT = 30; // searches/month for subscribers (trialing or active)
const ACTIVE_STATUSES = new Set(['trialing', 'active']);

export interface UsageStatus {
  isAdmin: boolean;
  subscriptionStatus: string | null; // 'trialing' | 'active' | 'past_due' | 'canceled' | null
  isTrialing: boolean;
  currentPeriodEnd: string | null; // trial end (when trialing) or next renewal (when active)
  hasAccess: boolean;
  searchesThisMonth: number;
  synthesesThisMonth: number;
  monthlyLimit: number; // Infinity for admin, SEARCH_LIMIT for subscribers, 0 otherwise
}

export async function getUsageStatus(userId: string): Promise<UsageStatus> {
  const userRes = await query<{
    is_admin: boolean;
    subscription_status: string | null;
    current_period_end: string | null;
  }>('SELECT is_admin, subscription_status, current_period_end FROM users WHERE id = $1', [userId]);
  const u = userRes.rows[0] ?? { is_admin: false, subscription_status: null, current_period_end: null };

  const [searchesRes, synthRes] = await Promise.all([
    query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM searches
       WHERE user_id = $1 AND created_at >= date_trunc('month', now())`,
      [userId],
    ),
    query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM syntheses s
       JOIN searches se ON se.id = s.search_id
       WHERE se.user_id = $1 AND s.created_at >= date_trunc('month', now())`,
      [userId],
    ),
  ]);

  const subscribed = !!u.subscription_status && ACTIVE_STATUSES.has(u.subscription_status);
  const hasAccess = u.is_admin || subscribed;
  const monthlyLimit = u.is_admin ? Infinity : subscribed ? SEARCH_LIMIT : 0;

  return {
    isAdmin: u.is_admin,
    subscriptionStatus: u.subscription_status,
    isTrialing: u.subscription_status === 'trialing',
    currentPeriodEnd: u.current_period_end,
    hasAccess,
    searchesThisMonth: Number(searchesRes.rows[0].count),
    synthesesThisMonth: Number(synthRes.rows[0].count),
    monthlyLimit,
  };
}

/**
 * Middleware factory. Blocks the action if the user has no active subscription
 * (402) or has hit the monthly quota (429).
 */
export function monthlyLimit(kind: 'search' | 'synthesis'): RequestHandler {
  return async (req, res, next) => {
    try {
      const s = await getUsageStatus(req.userId!);

      if (!s.hasAccess) {
        return res.status(402).json({
          error: 'Precisas de uma subscrição ativa para continuar. Começa o teu trial de 7 dias.',
          code: 'subscription_required',
        });
      }

      const used = kind === 'search' ? s.searchesThisMonth : s.synthesesThisMonth;
      if (used >= s.monthlyLimit) {
        return res.status(429).json({
          error: `Limite mensal atingido (${s.monthlyLimit}/mês).`,
          code: 'monthly_limit_reached',
          limit: s.monthlyLimit,
          used,
        });
      }

      next();
    } catch (e: any) {
      console.error('[tier-limits]', e);
      next(); // fail-open: don't block a legit user on a transient metering error
    }
  };
}
