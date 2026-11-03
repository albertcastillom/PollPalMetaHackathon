import { createHash } from 'node:crypto'

import {
  attachVoteWaCandidateGuideLinks,
  fetchVoteWaCandidateProfile,
  fetchVoteWaCandidateCsv,
  parseVoteWaCandidateGuideLinks,
  parseVoteWaCandidateCsv,
  SUPPORTED_CANDIDATE_COUNTIES,
  VOTE_WA_CANDIDATE_URL,
} from './wa-candidate-adapter.js'

function slug(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function stableId(...values) {
  return createHash('sha256').update(values.join('|')).digest('hex').slice(0, 24)
}

async function mapWithConcurrency(values, limit, worker) {
  const queue = [...values]
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) await worker(queue.shift())
  })
  await Promise.all(runners)
}

function groupCandidates(records) {
  const contests = new Map()
  for (const candidate of records) {
    const key = `${candidate.jurisdictionExternalId}|${candidate.race.toLowerCase()}`
    if (!contests.has(key)) {
      contests.set(key, {
        jurisdictionExternalId: candidate.jurisdictionExternalId,
        districtType: candidate.districtType,
        district: candidate.district,
        title: candidate.race,
        candidates: new Map(),
      })
    }
    const contest = contests.get(key)
    const candidateKey = `${candidate.name.toLowerCase()}|${candidate.party ?? ''}`
    contest.candidates.set(candidateKey, candidate)
  }
  return [...contests.values()].map((contest) => ({
    ...contest,
    candidates: [...contest.candidates.values()],
  }))
}

export async function ingestWashingtonCandidates({
  pool,
  fetchImpl = fetch,
  year = new Date().getFullYear(),
  electionType = 'general',
  voteWaElectionId,
  counties = SUPPORTED_CANDIDATE_COUNTIES,
}) {
  if (!voteWaElectionId) throw new Error('A VoteWA election id is required for candidate ingestion.')

  const payloads = []
  for (const county of counties) {
    const payload = await fetchVoteWaCandidateCsv({
      electionId: voteWaElectionId,
      countyCode: county.code,
      fetchImpl,
    })
    const links = parseVoteWaCandidateGuideLinks(payload.html, {
      electionId: voteWaElectionId,
      countyCode: county.code,
    })
    const candidates = attachVoteWaCandidateGuideLinks(
      parseVoteWaCandidateCsv(payload.csv, { countyExternalId: county.externalId }),
      links,
    )
    payloads.push({ county, payload, candidates })
  }

  const records = payloads.flatMap(({ candidates }) => candidates)
  const contests = groupCandidates(records)
  if (records.length < 50 || contests.length < 20) {
    throw new Error(`VoteWA candidate safety check failed: found ${records.length} candidates in ${contests.length} contests.`)
  }

  const profiles = new Map()
  const profileErrors = []
  const profileTargets = new Map()
  for (const record of records) {
    if (record.voterGuide) profileTargets.set(record.voterGuide.ballotId, record.voterGuide)
  }
  await mapWithConcurrency(profileTargets.values(), 5, async (voterGuide) => {
    try {
      profiles.set(voterGuide.ballotId, await fetchVoteWaCandidateProfile({
        electionId: voteWaElectionId,
        voterGuide,
        fetchImpl,
      }))
    } catch (error) {
      profileErrors.push({ ballotId: voterGuide.ballotId, message: error.message })
    }
  })

  const client = await pool.connect()
  const verifiedAt = new Date().toISOString()
  try {
    await client.query('begin')
    const sourceUrl = `${VOTE_WA_CANDIDATE_URL}?e=${encodeURIComponent(voteWaElectionId)}`
    const source = await client.query(
      `insert into public.sources (key, publisher, url, category)
       values ($1, 'Washington Secretary of State / VoteWA', $2, 'ballot')
       on conflict (key) do update set url = excluded.url, updated_at = now()
       returning id`,
      [`wa-votewa-candidates-${voteWaElectionId}`, sourceUrl],
    )
    const sourceId = source.rows[0].id
    const run = await client.query(
      `insert into public.ingestion_runs (source_id, status, metadata)
       values ($1, 'running', $2::jsonb) returning id`,
      [sourceId, JSON.stringify({ year, electionType, voteWaElectionId })],
    )

    for (const { county, candidates } of payloads) {
      const sanitized = JSON.stringify({ county: county.name, candidates })
      await client.query(
        `insert into public.source_snapshots
           (source_id, content_hash, http_status, content_type, raw_body)
         values ($1, $2, 200, 'application/json', $3)
         on conflict (source_id, content_hash) do nothing`,
        [sourceId, createHash('sha256').update(sanitized).digest('hex'), sanitized],
      )
    }

    const election = await client.query(
      `select id, external_id from public.elections
       where extract(year from election_day) = $1 and type = $2
       order by election_day desc limit 1`,
      [year, electionType],
    )
    if (!election.rows[0]) {
      throw new Error(`No ${year} ${electionType} election exists; ingest the Washington calendar first.`)
    }

    const jurisdictionIds = new Map()
    const externalJurisdictions = [...new Set(contests.map((contest) => contest.jurisdictionExternalId))]
    const jurisdictions = await client.query(
      'select id, external_id from public.jurisdictions where external_id = any($1::text[])',
      [externalJurisdictions],
    )
    for (const row of jurisdictions.rows) jurisdictionIds.set(row.external_id, row.id)

    const contestExternalIds = []
    let candidateCount = 0
    for (const contest of contests) {
      const jurisdictionId = jurisdictionIds.get(contest.jurisdictionExternalId)
      if (!jurisdictionId) continue
      const contestExternalId = `${election.rows[0].external_id}:votewa:${contest.jurisdictionExternalId}:${slug(contest.title)}`
      contestExternalIds.push(contestExternalId)
      const contestResult = await client.query(
        `insert into public.contests
           (external_id, election_id, jurisdiction_id, type, title, description, url,
            metadata, source_id, verified_at)
         values ($1, $2, $3, 'candidate_race', $4, $5, $6, $7::jsonb, $8, $9)
         on conflict (external_id) do update set
           election_id = excluded.election_id,
           jurisdiction_id = excluded.jurisdiction_id,
           type = excluded.type,
           title = excluded.title,
           description = excluded.description,
           url = excluded.url,
           metadata = excluded.metadata,
           source_id = excluded.source_id,
           verified_at = excluded.verified_at,
           updated_at = now()
         returning id`,
        [
          contestExternalId,
          election.rows[0].id,
          jurisdictionId,
          contest.title,
          `${contest.districtType}: ${contest.district}`,
          sourceUrl,
          JSON.stringify({ districtType: contest.districtType, district: contest.district }),
          sourceId,
          verifiedAt,
        ],
      )
      const contestId = contestResult.rows[0].id
      const candidateExternalIds = []

      for (const candidate of contest.candidates) {
        const externalId = `wa:votewa:${voteWaElectionId}:candidate:${stableId(
          contestExternalId,
          candidate.name.toLowerCase(),
        )}`
        candidateExternalIds.push(externalId)
        const candidateResult = await client.query(
          `insert into public.contest_candidates
             (external_id, contest_id, name, party, ballot_order, filing_status,
              profile_url, source_id, verified_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           on conflict (contest_id, name) do update set
             external_id = excluded.external_id,
             name = excluded.name,
             party = excluded.party,
             ballot_order = excluded.ballot_order,
             filing_status = excluded.filing_status,
             profile_url = excluded.profile_url,
             source_id = excluded.source_id,
             verified_at = excluded.verified_at,
             updated_at = now()
           returning id`,
          [
            externalId, contestId, candidate.name, candidate.party, candidate.ballotOrder,
            candidate.filingStatus, candidate.voterGuide?.voterGuideUrl ?? null, sourceId, verifiedAt,
          ],
        )
        const profile = candidate.voterGuide ? profiles.get(candidate.voterGuide.ballotId) : null
        if (profile) {
          await client.query(
            `insert into public.candidate_profiles
               (candidate_id, source_id, voter_guide_url, elected_experience,
                professional_experience, education, community_service, statement,
                campaign_website, campaign_finance_url, photo, photo_mime_type,
                submitted, verified_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             on conflict (candidate_id) do update set
               source_id = excluded.source_id,
               voter_guide_url = excluded.voter_guide_url,
               elected_experience = excluded.elected_experience,
               professional_experience = excluded.professional_experience,
               education = excluded.education,
               community_service = excluded.community_service,
               statement = excluded.statement,
               campaign_website = excluded.campaign_website,
               campaign_finance_url = excluded.campaign_finance_url,
               photo = excluded.photo,
               photo_mime_type = excluded.photo_mime_type,
               submitted = excluded.submitted,
               verified_at = excluded.verified_at,
               updated_at = now()`,
            [
              candidateResult.rows[0].id, sourceId, profile.voterGuideUrl,
              profile.electedExperience, profile.professionalExperience, profile.education,
              profile.communityService, profile.statement, profile.campaignWebsite,
              profile.campaignFinanceUrl, profile.photo, profile.photoMimeType,
              profile.submitted, verifiedAt,
            ],
          )
        }
        candidateCount += 1
      }

      await client.query(
        `delete from public.contest_candidates
         where contest_id = $1 and not (external_id = any($2::text[]))`,
        [contestId, candidateExternalIds],
      )
    }

    await client.query(
      `delete from public.contests
       where election_id = $1 and source_id = $2 and type = 'candidate_race'
         and not (external_id = any($3::text[]))`,
      [election.rows[0].id, sourceId, contestExternalIds],
    )

    await client.query(
      `insert into public.coverage (jurisdiction_id, component, status, notes, verified_at)
       select id, 'contests', 'partial', $2, $3
       from public.jurisdictions
       where external_id = any($1::text[])
       on conflict (jurisdiction_id, component) do update set
         status = excluded.status,
         notes = excluded.notes,
         verified_at = excluded.verified_at`,
      [
        [...jurisdictionIds.keys()],
        `Official VoteWA candidate lists ingested for ${counties.map((county) => county.name).join(', ')}; unsupported sub-county districts remain excluded`,
        verifiedAt,
      ],
    )
    await client.query(
      `update public.ingestion_runs set finished_at = now(), status = 'succeeded',
         records_seen = $2, records_written = $3
       where id = $1`,
      [run.rows[0].id, records.length, candidateCount],
    )
    await client.query('commit')
    return {
      electionId: election.rows[0].id,
      source: sourceUrl,
      candidatesSeen: records.length,
      candidatesWritten: candidateCount,
      contestsWritten: contestExternalIds.length,
      profilesWritten: profiles.size,
      profileErrors,
      jurisdictionsMatched: jurisdictionIds.size,
      verifiedAt,
    }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}
