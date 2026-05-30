import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { query } from '../db/client.js';
import { config } from '../lib/config.js';
import { signToken, authRequired } from '../middleware/auth.js';
import { emitFunnelEvent } from '../lib/marketing.js';
import { ensureReferralCode, recordReferral } from '../services/referral-service.js';

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

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
  referralCode: z.string().optional(), // código do indicador, vindo do ?ref= no link
});

authRouter.post('/register', async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, password, name, speciality, country, referralCode } = parsed.data;
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

  // Top of the marketing funnel: hand the lead to n8n -> MailerLite. Awaited but
  // never throws, so a marketing outage can't fail a signup.
  await emitFunnelEvent('signup', { email, name, userId: user.id });

  // Programa de indicações: gera o código próprio do novo utilizador e regista
  // a indicação se veio por link. Nunca pode partir o registo.
  try {
    await ensureReferralCode(user.id);
    if (referralCode) {
      await recordReferral(user.id, referralCode);
      await emitFunnelEvent('referral_signup', { email, name, userId: user.id });
    }
  } catch (e: any) {
    console.error('[auth] referral capture failed:', e?.message ?? e);
  }

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

// GET /api/auth/me — current user + access state (source of truth for the frontend)
authRouter.get('/me', authRequired, async (req, res) => {
  const result = await query<{
    id: string;
    email: string;
    name: string | null;
    avatar_url: string | null;
    is_admin: boolean;
    subscription_status: string | null;
    current_period_end: string | null;
  }>(
    'SELECT id, email, name, avatar_url, is_admin, subscription_status, current_period_end FROM users WHERE id = $1',
    [req.userId],
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Utilizador não encontrado' });
  const u = result.rows[0];
  const subscribed = u.subscription_status === 'trialing' || u.subscription_status === 'active';
  res.json({
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatar_url,
    isAdmin: u.is_admin,
    subscriptionStatus: u.subscription_status,
    isTrialing: u.subscription_status === 'trialing',
    currentPeriodEnd: u.current_period_end,
    hasAccess: u.is_admin || subscribed,
  });
});

// POST /api/auth/forgot-password — start a reset. Always returns 200 (even when
// the email is unknown) so the endpoint can't be used to enumerate accounts.
const ForgotSchema = z.object({ email: z.string().email() });

authRouter.post('/forgot-password', async (req, res) => {
  const parsed = ForgotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email } = parsed.data;
  const result = await query<{ id: string; name: string | null }>(
    'SELECT id, name FROM users WHERE email = $1',
    [email],
  );

  if (result.rows.length > 0) {
    const user = result.rows[0];
    // Raw token goes only in the email link; we store only its hash.
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h
    await query(
      'UPDATE users SET password_reset_token_hash = $1, password_reset_expires = $2 WHERE id = $3',
      [hashToken(token), expires, user.id],
    );
    const resetUrl = `${config.FRONTEND_URL}/reset-password?token=${token}`;
    await emitFunnelEvent('password_reset', { email, name: user.name, userId: user.id, resetUrl });
  }

  res.json({ ok: true });
});

// POST /api/auth/reset-password — consume the token and set a new password.
const ResetSchema = z.object({ token: z.string().min(1), password: z.string().min(8) });

authRouter.post('/reset-password', async (req, res) => {
  const parsed = ResetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { token, password } = parsed.data;
  const result = await query<{ id: string }>(
    `SELECT id FROM users
      WHERE password_reset_token_hash = $1 AND password_reset_expires > NOW()`,
    [hashToken(token)],
  );
  if (result.rows.length === 0) {
    return res.status(400).json({ error: 'Token inválido ou expirado. Pede um novo link.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await query(
    `UPDATE users
        SET password_hash = $1,
            password_reset_token_hash = NULL,
            password_reset_expires = NULL
      WHERE id = $2`,
    [passwordHash, result.rows[0].id],
  );

  res.json({ ok: true });
});
