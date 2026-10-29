import 'dotenv/config'

import { createPool } from '../db/pool.js'
import { ingestWashingtonDates } from '../ingestion/wa-sos-ingest.js'

const pool = createPool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true',
})

try {
  const result = await ingestWashingtonDates({ pool, year: Number(process.argv[2] ?? 2026) })
  console.log(JSON.stringify(result, null, 2))
} finally {
  await pool.end()
}
