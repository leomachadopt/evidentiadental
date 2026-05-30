/**
 * Programa de indicações — desconto progressivo + bónus de buscas.
 *
 * Regra: cada amigo indicado ATIVO E A PAGAR vale -20% na mensalidade do
 * indicador, saturando em grátis aos 5. A partir do 6º amigo, cada um dá +20%
 * de buscas (a recompensa deixa de ser dinheiro e passa a capacidade).
 *
 * `users.circle_size` é a contagem viva de amigos qualificados, mantida aqui
 * por `recomputeCircle`. A regra anti-anel está na contagem: um amigo só conta
 * se está `active` E o desconto dele ainda não é 100% (circle_size < 5) — senão
 * um anel mútuo iria todo a grátis sem ninguém pagar.
 *
 * Princípio de resiliência: nada disto pode partir um signup nem um webhook
 * Stripe. As funções engolem erros (logam) onde são chamadas nesses caminhos.
 */

import crypto from 'node:crypto';
import { query } from '../db/client.js';
import { config } from '../lib/config.js';
import { applyCircleDiscount, creditCustomerBalance } from '../lib/stripe.js';
import { emitFunnelEvent } from '../lib/marketing.js';

export const CIRCLE_THRESHOLD = 5; // nº de amigos pagantes para mensalidade grátis
export const DISCOUNT_PER_REFERRAL = 20; // % por amigo
export const FRIEND_WELCOME_CREDIT_CENTS = 500; // €5 de desconto na 1ª mensalidade do amigo
export const BASE_SEARCH_LIMIT = 30; // buscas/mês base (subscritor)
const SEARCH_BONUS_PER_REFERRAL = Math.round(BASE_SEARCH_LIMIT * 0.2); // +20% da base = +6

/** Desconto da mensalidade para n amigos pagantes: min(100, 20·n) %. */
export function circleDiscountPct(n: number): number {
  return Math.min(100, DISCOUNT_PER_REFERRAL * Math.max(0, n));
}

/** Buscas/mês para um subscritor com `n` amigos pagantes (+20% por amigo após o 5º). */
export function searchLimitFor(n: number): number {
  return BASE_SEARCH_LIMIT + Math.max(0, n - CIRCLE_THRESHOLD) * SEARCH_BONUS_PER_REFERRAL;
}

// ============================================================
// Geração / resolução de códigos
// ============================================================

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem I, O, 0, 1, L (ambíguos)

function randomCode(len = 8): string {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Garante (e devolve) o referral_code do utilizador, gerando um se faltar. */
export async function ensureReferralCode(userId: string): Promise<string> {
  const existing = await query<{ referral_code: string | null }>(
    'SELECT referral_code FROM users WHERE id = $1',
    [userId],
  );
  if (existing.rows[0]?.referral_code) return existing.rows[0].referral_code;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      const upd = await query<{ referral_code: string }>(
        'UPDATE users SET referral_code = $1 WHERE id = $2 RETURNING referral_code',
        [code, userId],
      );
      return upd.rows[0].referral_code;
    } catch {
      // Colisão no índice UNIQUE — tenta outro código.
    }
  }
  throw new Error('Não foi possível gerar um referral_code único');
}

/**
 * Regista uma indicação no signup. `code` é o referral_code do indicador.
 * Guards: código válido, sem auto-indicação, uma indicação por indicado.
 * Nunca lança — uma falha aqui não pode partir o registo.
 */
export async function recordReferral(referredUserId: string, code: string | undefined): Promise<void> {
  if (!code) return;
  const clean = code.toUpperCase().trim();
  try {
    const r = await query<{ id: string }>('SELECT id FROM users WHERE referral_code = $1', [clean]);
    const referrerId = r.rows[0]?.id;
    if (!referrerId || referrerId === referredUserId) return; // inválido ou auto-indicação
    await query(
      `INSERT INTO referrals (referrer_id, referred_id, code)
       VALUES ($1, $2, $3)
       ON CONFLICT (referred_id) DO NOTHING`,
      [referrerId, referredUserId, clean],
    );
  } catch (e: any) {
    console.error('[referrals] recordReferral failed:', e?.message ?? e);
  }
}

// ============================================================
// Manutenção do círculo
// ============================================================

async function referrerOf(referredUserId: string): Promise<string | null> {
  const r = await query<{ referrer_id: string }>(
    `SELECT referrer_id FROM referrals WHERE referred_id = $1 AND status <> 'reversed'`,
    [referredUserId],
  );
  return r.rows[0]?.referrer_id ?? null;
}

/**
 * Recalcula o círculo de um indicador: conta amigos qualificados, atualiza
 * circle_size, aplica o desconto Stripe correspondente, e — se o estado
 * "paga vs grátis" do indicador mudou (cruzou os 5) — propaga em cascata para
 * quem o indicou (ele deixa/volta a contar para o círculo de cima).
 */
export async function recomputeCircle(referrerId: string, visited = new Set<string>()): Promise<void> {
  if (visited.has(referrerId)) return; // a árvore de indicações não tem ciclos, mas por segurança
  visited.add(referrerId);

  const r = await query<{
    circle_size: number;
    stripe_subscription_id: string | null;
  }>('SELECT circle_size, stripe_subscription_id FROM users WHERE id = $1', [referrerId]);
  if (r.rows.length === 0) return;
  const oldSize = r.rows[0].circle_size;

  const cnt = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n
       FROM referrals rf
       JOIN users f ON f.id = rf.referred_id
      WHERE rf.referrer_id = $1
        AND rf.status = 'active'
        AND f.subscription_status = 'active'
        AND f.circle_size < $2`,
    [referrerId, CIRCLE_THRESHOLD],
  );
  const newSize = cnt.rows[0].n;
  if (newSize === oldSize) return; // nada mudou

  await query('UPDATE users SET circle_size = $1 WHERE id = $2', [newSize, referrerId]);

  // Desconto na Stripe (best-effort: a reconciliação corrige se falhar).
  try {
    await applyCircleDiscount(r.rows[0].stripe_subscription_id, circleDiscountPct(newSize));
  } catch (e: any) {
    console.error(`[referrals] applyCircleDiscount falhou para ${referrerId}:`, e?.message ?? e);
  }

  // Cascata só ao cruzar os 5: é quando o indicador deixa/volta a "pagar" e
  // portanto muda se conta para o círculo de quem o indicou.
  const wasFree = oldSize >= CIRCLE_THRESHOLD;
  const isFree = newSize >= CIRCLE_THRESHOLD;
  if (wasFree !== isFree) {
    // Avisa o indicador que ficou grátis / perdeu o grátis (win-back).
    try {
      const u = await query<{ email: string; name: string | null }>(
        'SELECT email, name FROM users WHERE id = $1',
        [referrerId],
      );
      if (u.rows[0]) {
        await emitFunnelEvent(isFree ? 'circle_completed' : 'circle_broken', {
          email: u.rows[0].email,
          name: u.rows[0].name,
          userId: referrerId,
          circleSize: newSize,
          discountPct: circleDiscountPct(newSize),
          isFree,
        });
      }
    } catch (e: any) {
      console.error('[referrals] funnel emit (circle boundary) failed:', e?.message ?? e);
    }

    const up = await referrerOf(referrerId);
    if (up) await recomputeCircle(up, visited);
  }
}

/** Amigo pagou (1ª vez ou renovação): marca a indicação ativa e recalcula. */
export async function markReferralPaid(referredUserId: string): Promise<void> {
  const upd = await query<{ referrer_id: string }>(
    `UPDATE referrals
        SET status = 'active', first_paid_at = COALESCE(first_paid_at, NOW())
      WHERE referred_id = $1 AND status = 'pending'
      RETURNING referrer_id`,
    [referredUserId],
  );
  const referrerId = upd.rows[0]?.referrer_id ?? (await referrerOf(referredUserId));

  // Só na 1ª transição pending->active (upd devolve linha) avisamos o indicador.
  if (upd.rows[0]) {
    try {
      const u = await query<{ email: string; name: string | null }>(
        'SELECT email, name FROM users WHERE id = $1',
        [upd.rows[0].referrer_id],
      );
      if (u.rows[0]) {
        await emitFunnelEvent('referral_first_payment', {
          email: u.rows[0].email,
          name: u.rows[0].name,
          userId: upd.rows[0].referrer_id,
        });
      }
    } catch (e: any) {
      console.error('[referrals] funnel emit (first payment) failed:', e?.message ?? e);
    }
  }

  if (referrerId) await recomputeCircle(referrerId);
}

/** Estado da subscrição do amigo mudou (cancelou, falhou, reativou): recalcula. */
export async function onReferredSubscriptionChanged(referredUserId: string): Promise<void> {
  const referrerId = await referrerOf(referredUserId);
  if (referrerId) await recomputeCircle(referrerId);
}

/** Clawback: reembolso/estorno dentro da janela — a indicação deixa de contar. */
export async function reverseReferral(referredUserId: string): Promise<void> {
  const upd = await query<{ referrer_id: string }>(
    `UPDATE referrals SET status = 'reversed'
      WHERE referred_id = $1 AND status <> 'reversed'
      RETURNING referrer_id`,
    [referredUserId],
  );
  if (upd.rows[0]) await recomputeCircle(upd.rows[0].referrer_id);
}

/**
 * Crédito único de boas-vindas (€5) para um amigo indicado, aplicado no
 * checkout via Customer Balance (abate à 1ª fatura, mantém a âncora de €9,90).
 * Idempotente (flag `welcome_credited`). Best-effort: nunca parte o checkout.
 */
export async function applyFriendWelcomeCredit(userId: string, customerId: string): Promise<void> {
  try {
    // Só se foi indicado, a indicação não foi revertida, e ainda não creditámos.
    const r = await query<{ id: string }>(
      `SELECT id FROM referrals
        WHERE referred_id = $1 AND status <> 'reversed' AND welcome_credited = FALSE`,
      [userId],
    );
    if (r.rows.length === 0) return;
    await creditCustomerBalance(
      customerId,
      FRIEND_WELCOME_CREDIT_CENTS,
      'Desconto de boas-vindas por indicação (€5)',
    );
    await query('UPDATE referrals SET welcome_credited = TRUE WHERE referred_id = $1', [userId]);
  } catch (e: any) {
    console.error('[referrals] applyFriendWelcomeCredit failed:', e?.message ?? e);
  }
}

// ============================================================
// Leitura (API)
// ============================================================

export interface CircleStatus {
  code: string;
  link: string;
  activePaying: number; // n
  threshold: number; // 5
  discountPct: number;
  isFree: boolean;
  searchesPerMonth: number;
  bonusSearches: number;
  friends: Array<{ name: string | null; status: string | null; counts: boolean }>;
}

export async function getMyCircle(userId: string): Promise<CircleStatus> {
  const code = await ensureReferralCode(userId);

  // n é a contagem viva (mesma regra do recompute), não o circle_size guardado,
  // para a leitura ser sempre exata mesmo que um webhook se tenha perdido.
  const friendsRes = await query<{ name: string | null; subscription_status: string | null; counts: boolean }>(
    `SELECT f.name,
            f.subscription_status,
            (f.subscription_status = 'active' AND f.circle_size < $2) AS counts
       FROM referrals rf
       JOIN users f ON f.id = rf.referred_id
      WHERE rf.referrer_id = $1 AND rf.status <> 'reversed'
      ORDER BY rf.created_at DESC`,
    [userId, CIRCLE_THRESHOLD],
  );

  const n = friendsRes.rows.filter((r) => r.counts).length;
  const searches = searchLimitFor(n);

  return {
    code,
    link: `${config.FRONTEND_URL}/?ref=${code}`,
    activePaying: n,
    threshold: CIRCLE_THRESHOLD,
    discountPct: circleDiscountPct(n),
    isFree: n >= CIRCLE_THRESHOLD,
    searchesPerMonth: searches,
    bonusSearches: searches - BASE_SEARCH_LIMIT,
    // Privacidade: nunca expomos o email do amigo — só nome e estado.
    friends: friendsRes.rows.map((r) => ({
      name: r.name,
      status: r.subscription_status,
      counts: r.counts,
    })),
  };
}
