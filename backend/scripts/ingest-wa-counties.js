import 'dotenv/config'

import { createPool } from '../db/pool.js'
import { ingestWashingtonCounties } from '../ingestion/wa-county-ingest.js'

const pool = createPool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true',
})

const yearArgument = process.argv.find((argument) => /^\d{4}$/.test(argument))
const countyKeys = process.argv.slice(2).filter((argument) => !/^\d{4}$/.test(argument))

try {
  const result = await ingestWashingtonCounties({
    pool,
    year: Number(yearArgument ?? new Date().getFullYear()),
    countyKeys: countyKeys.length > 0 ? countyKeys : undefined,
  })
  console.log(JSON.stringify(result, null, 2))
} finally {
  await pool.end()
}
