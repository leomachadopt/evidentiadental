import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/client.js';
import { config } from '../lib/config.js';
import { signToken, authRequired } from '../middleware/auth.js';

export const authRouter = Router();

function isAdminEmail(email: string): boolean {
  return !!config.ADMIN_EMAIL && email.toLowerCase() === config.ADMIN_EMAIL.toLowerCase();
}

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
  speciality: z.string().optional(),
  country: z.string().length(2).default('PT'),
});

authRouter.post('/register', async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, password, name, speciality, country } = parsed.data;
  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) return res.status(409).json({ error: 'Email já registado' });

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = isAdminEmail(email);
  const result = await query<{ id: string; subscription_tier: string; is_admin: boolean }>(
    `INSERT INTO users (email, password_hash, name, speciality, country, is_admin)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, subscription_tier, is_admin`,
    [email, passwordHash, name, speciality, country, admin],
  );

  const user = result.rows[0];
  const token = signToken({ userId: user.id, tier: user.subscription_tier });
  res.json({
    token,
    user: { id: user.id, email, name, tier: user.subscription_tier, isAdmin: user.is_admin },
  });
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

authRouter.post('/login', async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, password } = parsed.data;
  const result = await query<{
    id: string;
    password_hash: string;
    name: string;
    subscription_tier: string;
    is_admin: boolean;
  }>('SELECT id, password_hash, name, subscription_tier, is_admin FROM users WHERE email = $1', [email]);
  if (result.rows.length === 0) return res.status(401).json({ error: 'Credenciais inválidas' });

  const user = result.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });

  // Promote on login too, in case the account predates the ADMIN_EMAIL config.
  let isAdmin = user.is_admin;
  if (!isAdmin && isAdminEmail(email)) {
    await query('UPDATE users SET is_admin = TRUE WHERE id = $1', [user.id]);
    isAdmin = true;
  }

  const token = signToken({ userId: user.id, tier: user.subscription_tier });
  res.json({
    token,
    user: { id: user.id, email, name: user.name, tier: user.subscription_tier, isAdmin },
  });
});

// GET /api/auth/me — current user (source of truth for the frontend, incl. admin)
authRouter.get('/me', authRequired, async (req, res) => {
  const result = await query<{
    id: string;
    email: string;
    name: string | null;
    subscription_tier: string;
    is_admin: boolean;
  }>('SELECT id, email, name, subscription_tier, is_admin FROM users WHERE id = $1', [req.userId]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Utilizador não encontrado' });
  const u = result.rows[0];
  res.json({ id: u.id, email: u.email, name: u.name, tier: u.subscription_tier, isAdmin: u.is_admin });
});
