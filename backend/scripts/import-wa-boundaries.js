import 'dotenv/config'

import { createPool } from '../db/pool.js'
import { importWashingtonBoundaries } from '../ingestion/wa-boundaries.js'

const pool = createPool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true',
})

try {
  const result = await importWashingtonBoundaries({ pool })
  console.log(JSON.stringify(result, null, 2))
} finally {
  await pool.end()
}
