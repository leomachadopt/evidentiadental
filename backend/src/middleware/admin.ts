import type { RequestHandler } from 'express';
import { query } from '../db/client.js';

/**
 * Gate for admin-only routes. Must run AFTER authRequired (needs req.userId).
 * Verifies admin status from the DB (not the JWT) so a revoked admin can't keep
 * access with an old token.
 */
export const adminRequired: RequestHandler = async (req, res, next) => {
  try {
    const result = await query<{ is_admin: boolean }>('SELECT is_admin FROM users WHERE id = $1', [
      req.userId,
    ]);
    if (!result.rows[0]?.is_admin) {
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }
    next();
  } catch (e: any) {
    console.error('[adminRequired]', e);
    res.status(500).json({ error: 'Erro a verificar permissões' });
  }
};
