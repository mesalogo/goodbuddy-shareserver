import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL
const pool = connectionString ? new Pool({ connectionString }) : undefined

export function databaseEnabled(): boolean {
  return pool !== undefined
}

export async function initializeDatabase(): Promise<void> {
  if (!pool) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shareserver_state (
      state_key TEXT PRIMARY KEY,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

export async function readState<T>(key: string): Promise<T | null> {
  if (!pool) return null
  const result = await pool.query<{ state: T }>('SELECT state FROM shareserver_state WHERE state_key = $1', [key])
  return result.rows[0]?.state ?? null
}

export async function writeState(key: string, state: unknown): Promise<void> {
  if (!pool) return
  await pool.query(
    `INSERT INTO shareserver_state (state_key, state, updated_at)
     VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
     ON CONFLICT (state_key) DO UPDATE SET state = EXCLUDED.state, updated_at = EXCLUDED.updated_at`,
    [key, JSON.stringify(state)]
  )
}
