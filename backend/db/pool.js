import pg from 'pg'

const { Pool } = pg

export function createPool({ connectionString, ssl = false }) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to start the Washington election API.')
  }

  return new Pool({
    connectionString,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })
}
