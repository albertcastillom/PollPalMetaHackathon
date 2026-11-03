import 'dotenv/config'

import { createApp } from './app.js'
import { createPool } from './db/pool.js'
import { createReminderRepository } from './db/reminder-repository.js'
import { createWashingtonRepository } from './db/washington-repository.js'
import { createElectionService } from './services/election-service.js'
import { createSupabaseAuthVerifier } from './services/supabase-auth.js'
import { createCensusGeocoder } from './services/providers/census-geocoder.js'
import { createWashingtonOwnedProvider } from './services/providers/washington-owned.js'

const port = Number.parseInt(process.env.PORT ?? '3001', 10)

const pool = createPool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true',
})
const repository = createWashingtonRepository(pool)
const reminderRepository = createReminderRepository(pool, {
  tokenSecret: process.env.UNSUBSCRIBE_TOKEN_SECRET,
})
const electionProvider = createWashingtonOwnedProvider({ repository })
const addressGeocoder = createCensusGeocoder()
const electionService = createElectionService({ electionProvider, addressGeocoder })
const authVerifier = createSupabaseAuthVerifier({
  supabaseUrl: process.env.SUPABASE_URL,
  publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
})
const app = createApp({
  electionService,
  authVerifier,
  reminderRepository,
  candidateRepository: repository,
  clientOrigin: process.env.CLIENT_ORIGIN,
  appUrl: process.env.APP_URL,
})

app.listen(port, () => {
  console.log(`PollPal API listening on http://localhost:${port}`)
})
