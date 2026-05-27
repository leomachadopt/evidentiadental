import pg from 'pg';
import { config } from '../lib/config.js';

const { Pool } = pg;

// Neon (and most managed Postgres) require SSL even in development. Enable it
// whenever the connection string asks for it, not just in production.
const requiresSsl =
  config.NODE_ENV === 'production' || /sslmode=require|neon\.tech/.test(config.DATABASE_URL);

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: requiresSsl ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected error on idle client', err);
});

export async function query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 500) {
    console.warn(`[db] Slow query (${duration}ms): ${text.slice(0, 100)}`);
  }
  return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
