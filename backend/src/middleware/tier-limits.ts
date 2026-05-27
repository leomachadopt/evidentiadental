/**
 * Tier limits — enforce per-day quotas on the expensive write actions
 * (creating a search, generating a synthesis) according to the user's plan.
 *
 * Limits are read from the DB (not the JWT) so an upgrade takes effect
 * immediately, without waiting for the 30-day token to refresh.
 */

import type { RequestHandler } from 'express';
import { query } from '../db/client.js';

export const DAILY_LIMITS: Record<string, number> = {
  trial: 5,
  clinical: 50,
  pro: Infinity,
};

export interface UsageStatus {
  tier: string;
  trialEndsAt: string | null;
  trialExpired: boolean;
  subscriptionStatus: string | null;
  searchesToday: number;
  synthesesToday: number;
  dailyLimit: number;
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
       WHERE user_id = $1 AND created_at >= date_trunc('day', now())`,
      [userId],
    ),
    query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM syntheses s
       JOIN searches se ON se.id = s.search_id
       WHERE se.user_id = $1 AND s.created_at >= date_trunc('day', now())`,
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
    searchesToday: Number(searchesRes.rows[0].count),
    synthesesToday: Number(synthRes.rows[0].count),
    dailyLimit: DAILY_LIMITS[tier] ?? DAILY_LIMITS.trial,
  };
}

/**
 * Middleware factory. `kind` selects which counter the daily limit applies to.
 */
export function dailyLimit(kind: 'search' | 'synthesis'): RequestHandler {
  return async (req, res, next) => {
    try {
      const status = await getUsageStatus(req.userId!);

      if (status.trialExpired) {
        return res.status(402).json({
          error: 'Trial terminado. Subscreve um plano para continuar.',
          code: 'trial_expired',
        });
      }

      const used = kind === 'search' ? status.searchesToday : status.synthesesToday;
      if (used >= status.dailyLimit) {
        return res.status(429).json({
          error: `Limite diário do plano ${status.tier} atingido (${status.dailyLimit}/dia). Faz upgrade para continuar.`,
          code: 'daily_limit_reached',
          limit: status.dailyLimit,
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
