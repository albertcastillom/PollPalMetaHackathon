import 'dotenv/config'
import { fileURLToPath } from 'node:url'

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
import { createDemoElectionProvider } from './services/providers/demo-elections.js'

const port = Number.parseInt(process.env.PORT ?? '3001', 10)

// Demo mode (on unless DEMO_MODE=false): treat DEMO_DATE as today so the November 3, 2026
// election still shows as upcoming, and answer addresses outside Washington with sample data.
const demoMode = process.env.DEMO_MODE !== 'false'
const demoDate = process.env.DEMO_DATE || '2026-10-27'
if (demoMode && !/^\d{4}-\d{2}-\d{2}$/.test(demoDate)) throw new Error('DEMO_DATE must look like 2026-10-27.')
const demoProvider = demoMode ? createDemoElectionProvider() : null
if (demoMode) console.log(`Demo mode is on: treating ${demoDate} as today, with sample data outside Washington.`)

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
const electionService = createElectionService({
  electionProvider,
  addressGeocoder,
  demoProvider,
  asOf: demoMode ? demoDate : null,
})
const authVerifier = createSupabaseAuthVerifier({
  supabaseUrl: process.env.SUPABASE_URL,
  publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
})
const museClient = createMuseClient({
  apiKey: process.env.MODEL_API_KEY || process.env.MUSE_API_KEY,
  baseUrl: process.env.MUSE_API_BASE_URL || undefined,
  model: process.env.MUSE_MODEL || undefined,
})
if (!museClient) console.warn('MODEL_API_KEY is not set: candidate comparisons and translations will use fallbacks.')
// Sample races (outside Washington) are compared the same way as real ones.
const comparisonRepository = {
  async findContestForComparison(contestId) {
    return demoProvider?.findContestForComparison(contestId) ?? repository.findContestForComparison(contestId)
  },
}
const comparisonService = createCandidateComparisonService({ repository: comparisonRepository, model: museClient })
// Translations are saved to disk so a restart doesn't make every page translate from scratch.
const translationService = createTranslationService({
  modelClient: museClient,
  cacheFile: fileURLToPath(new URL('./.cache/translations.json', import.meta.url)),
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
