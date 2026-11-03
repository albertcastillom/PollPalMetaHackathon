import 'dotenv/config'

import { createPool } from '../db/pool.js'
import { ingestWashingtonCandidates } from '../ingestion/wa-candidate-ingest.js'

const year = Number.parseInt(process.argv[2] ?? String(new Date().getFullYear()), 10)
const electionType = process.argv[3] ?? 'general'
const knownVoteWaIds = {
  '2026:general': '899',
  '2026:primary': '898',
}
const voteWaElectionId = process.argv[4] ?? knownVoteWaIds[`${year}:${electionType}`]

if (!voteWaElectionId) {
  throw new Error('Pass the VoteWA election id as the third argument for an unconfigured election.')
}

const pool = createPool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true',
})

try {
  const result = await ingestWashingtonCandidates({ pool, year, electionType, voteWaElectionId })
  console.log(JSON.stringify(result, null, 2))
} finally {
  await pool.end()
}
