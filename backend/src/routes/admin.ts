import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/client.js';
import { authRequired } from '../middleware/auth.js';
import { adminRequired } from '../middleware/admin.js';

export const adminRouter = Router();
adminRouter.use(authRequired);
adminRouter.use(adminRequired);

// GET /api/admin/stats — platform overview
adminRouter.get('/stats', async (_req, res) => {
  const [users, byTier, searches, syntheses, tokens] = await Promise.all([
    query<{ count: number }>('SELECT COUNT(*)::int AS count FROM users'),
    query<{ subscription_tier: string; count: number }>(
      'SELECT subscription_tier, COUNT(*)::int AS count FROM users GROUP BY subscription_tier',
    ),
    query<{ count: number }>('SELECT COUNT(*)::int AS count FROM searches'),
    query<{ count: number }>('SELECT COUNT(*)::int AS count FROM syntheses'),
    query<{ tin: number; tout: number }>(
      'SELECT COALESCE(SUM(llm_tokens_input),0)::bigint AS tin, COALESCE(SUM(llm_tokens_output),0)::bigint AS tout FROM usage_events',
    ),
  ]);

  const admins = await query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM users WHERE is_admin = TRUE',
  );
  const subscribed = await query<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM users WHERE subscription_status IN ('trialing','active')",
  );

  const tin = Number(tokens.rows[0].tin);
  const tout = Number(tokens.rows[0].tout);
  const tierMap: Record<string, number> = {};
  for (const r of byTier.rows) tierMap[r.subscription_tier] = Number(r.count);

  res.json({
    totalUsers: Number(users.rows[0].count),
    admins: Number(admins.rows[0].count),
    subscribed: Number(subscribed.rows[0].count),
    byTier: tierMap,
    totalSearches: Number(searches.rows[0].count),
    totalSyntheses: Number(syntheses.rows[0].count),
    tokensInput: tin,
    tokensOutput: tout,
    estCostUsd: Number((tin * 3) / 1e6 + (tout * 15) / 1e6),
  });
});

// GET /api/admin/users — list users with usage
adminRouter.get('/users', async (_req, res) => {
  const result = await query(
    `SELECT u.id, u.email, u.name, u.speciality, u.country,
            u.subscription_tier, u.subscription_status, u.trial_ends_at,
            u.is_admin, u.created_at,
            (SELECT COUNT(*)::int FROM searches s WHERE s.user_id = u.id) AS total_searches
     FROM users u
     ORDER BY u.created_at DESC
     LIMIT 200`,
  );
  res.json({ users: result.rows });
});

// PATCH /api/admin/users/:id — manage a user's access and admin role.
// access is driven by subscription_status: 'active'/'trialing' grant access,
// 'none' (mapped to NULL) or 'canceled' revoke it. Lets the admin comp a user.
adminRouter.patch('/users/:id', async (req, res) => {
  const schema = z.object({
    access: z.enum(['active', 'trialing', 'canceled', 'none']).optional(),
    isAdmin: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const targetId = req.params.id as string;

  // Guard: don't let an admin remove their own admin access (lockout safety).
  if (parsed.data.isAdmin === false && targetId === req.userId) {
    return res.status(400).json({ error: 'Não podes remover o teu próprio acesso de administrador.' });
  }

  const sets: string[] = [];
  const params: any[] = [];
  if (parsed.data.access !== undefined) {
    const status = parsed.data.access === 'none' ? null : parsed.data.access;
    params.push(status);
    sets.push(`subscription_status = $${params.length}`);
  }
  if (parsed.data.isAdmin !== undefined) {
    params.push(parsed.data.isAdmin);
    sets.push(`is_admin = $${params.length}`);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'Nada para atualizar' });

  params.push(targetId);
  const result = await query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}
     RETURNING id, email, name, subscription_status, current_period_end, is_admin`,
    params,
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Utilizador não encontrado' });
  res.json(result.rows[0]);
});
