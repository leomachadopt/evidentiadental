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
  CROSSREF_EMAIL: z.string().email(),
  UNPAYWALL_EMAIL: z.string().email(),
  CORE_API_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_MONTHLY: z.string().optional(),
  STRIPE_PRICE_ANNUAL: z.string().optional(),
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
