/**
 * Tier limits — enforce a monthly search quota per plan.
 *
 * Metered by quantity of searches, on a monthly window (not daily): clinical
 * usage is bursty, so a monthly budget fits real behaviour and protects margin
 * (a daily cap of N allows ~30N/month). Limits are read from the DB so an
 * upgrade takes effect immediately.
 */

import type { RequestHandler } from 'express';
import { query } from '../db/client.js';

export const MONTHLY_LIMITS: Record<string, number> = {
  trial: 10,
  paid: 30,
};

export interface UsageStatus {
  tier: string;
  trialEndsAt: string | null;
  trialExpired: boolean;
  subscriptionStatus: string | null;
  searchesThisMonth: number;
  synthesesThisMonth: number;
  monthlyLimit: number;
}

export async function getUsageStatus(userId: string): Promise<UsageStatus> {
  const userRes = await query<{
    subscription_tier: string;
    trial_ends_at: string | null;
    subscription_status: string | null;
  }>('SELECT subscription_tier, trial_ends_at, subscription_status FROM users WHERE id = $1', [userId]);

  const user = userRes.rows[0] ?? { subscription_tier: 'trial', trial_ends_at: null, subscription_status: null };
  const tier = user.subscription_tier;

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

  const trialExpired =
    tier === 'trial' && !!user.trial_ends_at && new Date(user.trial_ends_at).getTime() < Date.now();

  return {
    tier,
    trialEndsAt: user.trial_ends_at,
    trialExpired,
    subscriptionStatus: user.subscription_status,
    searchesThisMonth: Number(searchesRes.rows[0].count),
    synthesesThisMonth: Number(synthRes.rows[0].count),
    monthlyLimit: MONTHLY_LIMITS[tier] ?? MONTHLY_LIMITS.trial,
  };
}

/**
 * Middleware factory. `kind` selects which monthly counter the quota applies to.
 */
export function monthlyLimit(kind: 'search' | 'synthesis'): RequestHandler {
  return async (req, res, next) => {
    try {
      const status = await getUsageStatus(req.userId!);

      if (status.trialExpired) {
        return res.status(402).json({
          error: 'Trial terminado. Subscreve um plano para continuar.',
          code: 'trial_expired',
        });
      }

      const used = kind === 'search' ? status.searchesThisMonth : status.synthesesThisMonth;
      if (used >= status.monthlyLimit) {
        return res.status(429).json({
          error: `Limite mensal do plano ${status.tier} atingido (${status.monthlyLimit}/mês). Faz upgrade para continuar.`,
          code: 'monthly_limit_reached',
          limit: status.monthlyLimit,
          used,
        });
      }

      next();
    } catch (e: any) {
      console.error('[tier-limits]', e);
      next(); // fail-open: never block a paying user because of a metering bug
    }
  };
}
