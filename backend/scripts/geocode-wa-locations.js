import 'dotenv/config'

import { createPool } from '../db/pool.js'
import { geocodeMissingLocations } from '../ingestion/wa-location-geocode.js'

const pool = createPool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true',
})

try {
  const result = await geocodeMissingLocations({ pool, log: console.warn })
  console.log(JSON.stringify(result, null, 2))
} finally {
  await pool.end()
}
