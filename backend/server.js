import 'dotenv/config'

import { createApp } from './app.js'
import { createPool } from './db/pool.js'
import { createWashingtonRepository } from './db/washington-repository.js'
import { createElectionService } from './services/election-service.js'
import { createCensusGeocoder } from './services/providers/census-geocoder.js'
import { createWashingtonOwnedProvider } from './services/providers/washington-owned.js'

const port = Number.parseInt(process.env.PORT ?? '3001', 10)

const pool = createPool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true',
})
const repository = createWashingtonRepository(pool)
const electionProvider = createWashingtonOwnedProvider({ repository })
const addressGeocoder = createCensusGeocoder()
const electionService = createElectionService({ electionProvider, addressGeocoder })
const app = createApp({
  electionService,
  clientOrigin: process.env.CLIENT_ORIGIN,
})

app.listen(port, () => {
  console.log(`PollPal API listening on http://localhost:${port}`)
})
