import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/client.js';
import { signToken } from '../middleware/auth.js';

export const authRouter = Router();

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
  const result = await query<{ id: string; subscription_tier: string }>(
    `INSERT INTO users (email, password_hash, name, speciality, country)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, subscription_tier`,
    [email, passwordHash, name, speciality, country],
  );

  const user = result.rows[0];
  const token = signToken({ userId: user.id, tier: user.subscription_tier });
  res.json({ token, user: { id: user.id, email, name, tier: user.subscription_tier } });
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

authRouter.post('/login', async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, password } = parsed.data;
  const result = await query<{ id: string; password_hash: string; name: string; subscription_tier: string }>(
    'SELECT id, password_hash, name, subscription_tier FROM users WHERE email = $1',
    [email],
  );
  if (result.rows.length === 0) return res.status(401).json({ error: 'Credenciais inválidas' });

  const user = result.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });

  const token = signToken({ userId: user.id, tier: user.subscription_tier });
  res.json({ token, user: { id: user.id, email, name: user.name, tier: user.subscription_tier } });
});
