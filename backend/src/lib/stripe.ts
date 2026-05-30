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

// ============================================================
// Programa de indicações — cupões de desconto progressivo
// ============================================================
// O desconto da mensalidade do indicador é `min(100, 20 * n)` %, onde n é o
// número de amigos ativos e a pagar. Usamos um cupão fixo e reutilizável por
// patamar (circle-20/40/60/80/100), aplicado à subscrição. Como o cupão só
// afeta faturas FUTURAS, a temporização é naturalmente humana: ganhar/perder o
// desconto só se reflete no próximo ciclo, nunca retroativo.

/** Garante que o cupão circle-<pct> existe na Stripe (idempotente por id fixo). */
async function ensureCircleCoupon(pct: number): Promise<string> {
  if (!stripe) throw new Error('Stripe não configurado');
  const id = `circle-${pct}`;
  try {
    await stripe.coupons.retrieve(id);
  } catch {
    // O id fixo garante idempotência; uma corrida cria-o uma vez só.
    await stripe.coupons.create({
      id,
      percent_off: pct,
      duration: 'forever',
      name: `Indicações −${pct}%`,
    });
  }
  return id;
}

/**
 * Aplica (ou remove) o desconto de indicações na subscrição do indicador.
 * pct <= 0 remove qualquer desconto; caso contrário aplica circle-<pct>.
 * No-op gracioso se a Stripe não estiver configurada ou não houver subscrição.
 */
export async function applyCircleDiscount(
  subscriptionId: string | null | undefined,
  pct: number,
): Promise<void> {
  if (!stripe || !subscriptionId) return;
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  if (clamped <= 0) {
    // Remove qualquer desconto ativo. `discounts: []` limpa o cupão.
    await stripe.subscriptions.update(subscriptionId, { discounts: [] } as any);
    return;
  }
  const coupon = await ensureCircleCoupon(clamped);
  await stripe.subscriptions.update(subscriptionId, { discounts: [{ coupon }] } as any);
}

/**
 * Credita o saldo do cliente (Customer Balance) em `cents` (valor positivo).
 * A Stripe abate este crédito à PRÓXIMA fatura automaticamente — o preço
 * listado no checkout não muda (âncora preservada). No-op gracioso sem Stripe.
 */
export async function creditCustomerBalance(
  customerId: string | null | undefined,
  cents: number,
  description: string,
): Promise<void> {
  if (!stripe || !customerId || cents <= 0) return;
  await stripe.customers.createBalanceTransaction(customerId, {
    amount: -Math.round(cents), // negativo = crédito a favor do cliente
    currency: 'eur',
    description,
  });
}
