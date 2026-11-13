import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

pg.types.setTypeParser(1082, (value) => value);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const production = process.env.NODE_ENV === 'production';

export const pool = new pg.Pool({
  host: process.env.PGHOST || (production ? 'postgres' : '127.0.0.1'),
  port: Number(process.env.PGPORT || (production ? 5432 : 55434)),
  database: process.env.PGDATABASE || process.env.POSTGRES_DB || 'sharescope',
  user: process.env.PGUSER || process.env.POSTGRES_USER || 'sharescope',
  password: process.env.PGPASSWORD,
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

export async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', ['sharescope-schema-migrations']);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const applied = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((row) => row.name));
    const directory = path.resolve(__dirname, '../db/migrations');
    const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
    for (const name of files) {
      if (applied.has(name)) continue;
      await client.query('BEGIN');
      try {
        await client.query(await readFile(path.join(directory, name), 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['sharescope-schema-migrations']);
    } finally {
      client.release();
    }
  }
}

export async function checkDatabase() {
  await pool.query('SELECT 1');
}

export async function closeDatabase() {
  await pool.end();
}
