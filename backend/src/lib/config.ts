import dotenv from 'dotenv';
import { z } from 'zod';

// override:true so the project's .env wins over empty/stale vars inherited from
// the shell profile (e.g. an exported but empty ANTHROPIC_API_KEY). In production
// there is no .env file, so this is a no-op and platform env vars are used.
dotenv.config({ override: true });

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ADMIN_EMAIL: z.string().email().optional(),
  NCBI_API_KEY: z.string().optional(),
  NCBI_EMAIL: z.string().email(),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-'),
  CLAUDE_MODEL: z.string().default('claude-sonnet-4-6'),
  // Modelo "rápido" para tarefas de classificação/extração (PICO, relevance
  // scoring) — não precisam do raciocínio do Sonnet e o relevance scoring é
  // ~85% do custo de LLM por busca. Haiku 4.5 custa 1/3 do Sonnet ($1/$5 vs
  // $3/$15). A síntese clínica continua sempre no CLAUDE_MODEL (Sonnet),
  // protegida pelo citation-validator. Mete = CLAUDE_MODEL para reverter.
  CLAUDE_MODEL_FAST: z.string().default('claude-haiku-4-5-20251001'),
  CROSSREF_EMAIL: z.string().email(),
  UNPAYWALL_EMAIL: z.string().email(),
  CORE_API_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_MONTHLY: z.string().optional(),
  STRIPE_PRICE_ANNUAL: z.string().optional(),
  // Marketing funnel: backend emits funnel events to this n8n webhook, which
  // syncs subscribers/groups into MailerLite. No-op when unset (graceful).
  N8N_WEBHOOK_URL: z.string().url().optional(),
  N8N_WEBHOOK_SECRET: z.string().optional(),
  // Object storage for user-uploaded PDFs (Vercel Blob). Auto-injected by Vercel
  // when a Blob store is linked. Upload endpoints are no-op/503 when unset.
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  // Segredo partilhado para o endpoint de cron (reconciliação de indicações).
  // Vercel Cron / n8n chamam com este segredo. No-op (503) se não configurado.
  CRON_SECRET: z.string().optional(),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
});

const result = schema.safeParse(process.env);

if (!result.success) {
  console.error('[config] Invalid environment variables:');
  console.error(result.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = result.data;
