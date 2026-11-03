import 'dotenv/config'

import { createApp } from './app.js'
import { createPool } from './db/pool.js'
import { createReminderRepository } from './db/reminder-repository.js'
import { createWashingtonRepository } from './db/washington-repository.js'
import { createElectionService } from './services/election-service.js'
import { createCandidateComparisonService } from './services/comparison/candidate-comparison.js'
import { createMuseClient } from './services/comparison/muse-client.js'
import { createSupabaseAuthVerifier } from './services/supabase-auth.js'
import { createTranslationService } from './services/translation-service.js'
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
const museClient = createMuseClient({
  apiKey: process.env.MUSE_API_KEY,
  baseUrl: process.env.MUSE_API_BASE_URL || undefined,
  model: process.env.MUSE_MODEL || undefined,
})
if (!museClient) console.warn('MUSE_API_KEY is not set: candidate comparisons will show official records only.')
const comparisonService = createCandidateComparisonService({ repository, model: museClient })
const translationService = createTranslationService({
  apiToken: process.env.HF_TOKEN,
  model: process.env.TRANSLATION_MODEL,
  endpoint: process.env.TRANSLATION_API_URL,
})
const app = createApp({
  electionService,
  authVerifier,
  reminderRepository,
  candidateRepository: repository,
  comparisonService,
  translationService,
  clientOrigin: process.env.CLIENT_ORIGIN,
  appUrl: process.env.APP_URL,
})

app.listen(port, () => {
  console.log(`PollPal API listening on http://localhost:${port}`)
})
