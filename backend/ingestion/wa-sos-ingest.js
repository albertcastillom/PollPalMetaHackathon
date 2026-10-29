import { createHash } from 'node:crypto'

import { parseWashingtonDatesAndDeadlines } from './wa-sos-parser.js'

export const WA_DATES_URL = 'https://www.sos.wa.gov/elections/elections-calendar/dates-and-deadlines'
const STATE_EXTERNAL_ID = 'ocd-division/country:us/state:wa'

async function upsertState(client, sourceId, verifiedAt) {
  const { rows } = await client.query(
    `insert into public.jurisdictions
       (external_id, name, type, source_id, verified_at)
     values ($1, 'Washington', 'state', $2, $3)
     on conflict (external_id) do update set
       source_id = excluded.source_id,
       verified_at = excluded.verified_at,
       updated_at = now()
     returning id`,
    [STATE_EXTERNAL_ID, sourceId, verifiedAt],
  )
  return rows[0].id
}

export async function ingestWashingtonDates({ pool, fetchImpl = fetch, year = new Date().getFullYear() }) {
  const response = await fetchImpl(WA_DATES_URL, {
    headers: { accept: 'text/html', 'user-agent': 'PollPal election data collector/0.1' },
    signal: AbortSignal.timeout(15_000),
  })
  const html = await response.text()
  if (!response.ok) throw new Error(`Washington SOS returned HTTP ${response.status}`)

  const elections = parseWashingtonDatesAndDeadlines(html, year)
  if (elections.length < 4) {
    throw new Error(`Parser safety check failed: expected at least 4 election sections, found ${elections.length}`)
  }

  const client = await pool.connect()
  const verifiedAt = new Date().toISOString()

  try {
    await client.query('begin')
    const sourceResult = await client.query(
      `insert into public.sources (key, publisher, url, category)
       values ('wa-sos-dates-deadlines', 'Washington Secretary of State', $1, 'state_calendar')
       on conflict (key) do update set url = excluded.url, updated_at = now()
       returning id`,
      [WA_DATES_URL],
    )
    const sourceId = sourceResult.rows[0].id
    const runResult = await client.query(
      `insert into public.ingestion_runs (source_id, status)
       values ($1, 'running') returning id`,
      [sourceId],
    )
    const runId = runResult.rows[0].id

    await client.query(
      `insert into public.source_snapshots
         (source_id, content_hash, http_status, content_type, raw_body)
       values ($1, $2, $3, $4, $5)
       on conflict (source_id, content_hash) do nothing`,
      [
        sourceId,
        createHash('sha256').update(html).digest('hex'),
        response.status,
        response.headers.get('content-type'),
        html,
      ],
    )

    const stateId = await upsertState(client, sourceId, verifiedAt)

    for (const election of elections) {
      const electionResult = await client.query(
        `insert into public.elections
           (external_id, name, type, election_day, source_id, verified_at)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (external_id) do update set
           name = excluded.name,
           type = excluded.type,
           election_day = excluded.election_day,
           source_id = excluded.source_id,
           verified_at = excluded.verified_at,
           updated_at = now()
         returning id`,
        [election.externalId, election.name, election.type, election.electionDay, sourceId, verifiedAt],
      )
      const electionId = electionResult.rows[0].id

      await client.query(
        `insert into public.election_jurisdictions (election_id, jurisdiction_id, applicability)
         values ($1, $2, 'all')
         on conflict (election_id, jurisdiction_id) do update set applicability = excluded.applicability`,
        [electionId, stateId],
      )

      for (const milestone of election.milestones) {
        await client.query(
          `insert into public.election_milestones
             (election_id, kind, label, occurs_on, occurs_at, local_time, date_precision, source_id,
              source_excerpt, verified_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           on conflict (election_id, kind, occurs_on) do update set
             label = excluded.label,
             occurs_at = excluded.occurs_at,
             local_time = excluded.local_time,
             date_precision = excluded.date_precision,
             source_id = excluded.source_id,
             source_excerpt = excluded.source_excerpt,
             verified_at = excluded.verified_at,
             revision = case when (
               public.election_milestones.label,
               public.election_milestones.occurs_at,
               public.election_milestones.local_time,
               public.election_milestones.date_precision,
               public.election_milestones.source_excerpt
             ) is distinct from (
               excluded.label,
               excluded.occurs_at,
               excluded.local_time,
               excluded.date_precision,
               excluded.source_excerpt
             ) then public.election_milestones.revision + 1
             else public.election_milestones.revision end,
             updated_at = now()`,
          [
            electionId, milestone.kind, milestone.label, milestone.occursOn,
            milestone.occursAt, milestone.localTime, milestone.datePrecision, sourceId,
            milestone.sourceExcerpt, verifiedAt,
          ],
        )
      }
    }

    await client.query(
      `insert into public.coverage (jurisdiction_id, component, status, notes, verified_at)
       values
         ($1, 'calendar', 'complete', 'Washington SOS statewide calendar', $2),
         ($1, 'deadlines', 'complete', 'Statewide registration and ballot return deadlines', $2),
         ($1, 'locations', 'pending', 'County adapters are Phase 2', $2),
         ($1, 'contests', 'pending', 'County and state ballot adapters are Phase 2', $2),
         ($1, 'precinct_matching', 'partial', 'Depends on the latest boundary import', $2)
       on conflict (jurisdiction_id, component) do update set
         status = excluded.status,
         notes = excluded.notes,
         verified_at = excluded.verified_at`,
      [stateId, verifiedAt],
    )

    await client.query(
      `update public.ingestion_runs set
         finished_at = now(), status = 'succeeded', records_seen = $2, records_written = $2
       where id = $1`,
      [runId, elections.length],
    )
    await client.query('commit')
    return { elections: elections.length, source: WA_DATES_URL, verifiedAt }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}
