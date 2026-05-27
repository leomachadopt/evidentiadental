import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<{ name: string }>('SELECT name FROM _migrations ORDER BY id');
  return new Set(result.rows.map((r) => r.name));
}

async function runMigrations() {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log('[migrate] No migrations directory found');
    return;
  }

  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`[migrate] ✓ ${file} (already applied)`);
      continue;
    }

    console.log(`[migrate] → Running ${file}`);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[migrate] ✓ ${file}`);
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(`[migrate] ✗ ${file}`, e);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  console.log('[migrate] All migrations applied');
}

function createMigration(name: string) {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const existing = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const nextNumber = String(existing.length + 1).padStart(3, '0');
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const filename = `${nextNumber}_${slug}.sql`;
  const filepath = path.join(MIGRATIONS_DIR, filename);
  fs.writeFileSync(filepath, `-- Migration: ${nextNumber}_${slug}\n-- Created: ${new Date().toISOString().slice(0, 10)}\n\n`);
  console.log(`[migrate] Created ${filename}`);
}

const command = process.argv[2];
if (command === 'create') {
  const name = process.argv[3];
  if (!name) {
    console.error('Usage: npm run migrate:create <name>');
    process.exit(1);
  }
  createMigration(name);
  process.exit(0);
} else {
  runMigrations().then(() => process.exit(0)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
