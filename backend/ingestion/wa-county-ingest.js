import { createHash } from 'node:crypto'

import { fetchArcGisFeatures } from './arcgis-client.js'
import {
  parseBallotItems,
  parseCountyElection,
  parseCountyLocations,
  slug,
  WA_COUNTY_ADAPTERS,
} from './wa-county-adapters.js'

async function fetchText(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { accept: 'text/html', 'user-agent': 'PollPal county election collector/0.2' },
    signal: AbortSignal.timeout(20_000),
  })
  const body = await response.text()
  if (!response.ok) throw new Error(`County source returned HTTP ${response.status} for ${url}`)
  return { body, status: response.status, contentType: response.headers.get('content-type') }
}

async function upsertSource(client, { key, publisher, url, category }) {
  const { rows } = await client.query(
    `insert into public.sources (key, publisher, url, category)
     values ($1, $2, $3, $4)
     on conflict (key) do update set
       publisher = excluded.publisher,
       url = excluded.url,
       category = excluded.category,
       updated_at = now()
     returning id`,
    [key, publisher, url, category],
  )
  return rows[0].id
}

async function snapshot(client, sourceId, payload) {
  await client.query(
    `insert into public.source_snapshots
       (source_id, content_hash, http_status, content_type, raw_body)
     values ($1, $2, $3, $4, $5)
     on conflict (source_id, content_hash) do nothing`,
    [
      sourceId,
      createHash('sha256').update(payload.body).digest('hex'),
      payload.status,
      payload.contentType,
      payload.body,
    ],
  )
}

async function findOrCreateElection(client, descriptor, sourceId, verifiedAt) {
  const existing = await client.query(
    `select id, external_id, election_day
     from public.elections
     where election_day = $1 and type = $2
     order by created_at
     limit 1`,
    [descriptor.electionDay, descriptor.type],
  )
  if (existing.rows[0]) return existing.rows[0]

  const externalId = `wa:${descriptor.electionDay.slice(0, 4)}:${descriptor.type}`
  const { rows } = await client.query(
    `insert into public.elections
       (external_id, name, type, election_day, source_id, verified_at)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (external_id) do update set
       name = excluded.name,
       election_day = excluded.election_day,
       verified_at = excluded.verified_at,
       updated_at = now()
     returning id, external_id, election_day`,
    [externalId, descriptor.name, descriptor.type, descriptor.electionDay, sourceId, verifiedAt],
  )
  return rows[0]
}

async function replaceLocations(client, { adapter, election, jurisdictionId, sourceId, locations, verifiedAt }) {
  const externalIds = []

  for (const location of locations) {
    const externalId = `${election.external_id}:${adapter.key}:location:${slug(location.name)}`
    externalIds.push(externalId)
    await client.query(
      `insert into public.voting_locations
         (external_id, election_id, jurisdiction_id, type, name, address, city, postal_code,
          description, drive_up, opens_on, closes_on, geometry, source_id, verified_at)
       values
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          case when $13::double precision is null or $14::double precision is null then null
               else extensions.st_setsrid(extensions.st_point($14, $13), 4326) end,
          $15, $16)
       on conflict (external_id) do update set
         election_id = excluded.election_id,
         jurisdiction_id = excluded.jurisdiction_id,
         type = excluded.type,
         name = excluded.name,
         address = excluded.address,
         city = excluded.city,
         postal_code = excluded.postal_code,
         description = excluded.description,
         drive_up = excluded.drive_up,
         opens_on = excluded.opens_on,
         closes_on = excluded.closes_on,
         -- Keep coordinates added by the geocode step unless the source now supplies its own
         -- or the address changed.
         geometry = case
           when excluded.geometry is not null then excluded.geometry
           when excluded.address is distinct from voting_locations.address then null
           else voting_locations.geometry
         end,
         source_id = excluded.source_id,
         verified_at = excluded.verified_at,
         updated_at = now()`,
      [
        externalId, election.id, jurisdictionId, location.type, location.name, location.address,
        location.city, location.postalCode, location.description, location.driveUp, location.opensOn,
        location.closesOn, location.latitude, location.longitude, sourceId, verifiedAt,
      ],
    )
  }

  await client.query(
    `delete from public.voting_locations
     where election_id = $1 and jurisdiction_id = $2 and source_id = $3
       and not (external_id = any($4::text[]))`,
    [election.id, jurisdictionId, sourceId, externalIds],
  )
}

async function replaceContests(client, { adapter, election, jurisdictionId, sourceId, items, verifiedAt }) {
  await client.query(
    'delete from public.contests where election_id = $1 and jurisdiction_id = $2',
    [election.id, jurisdictionId],
  )

  for (const item of items) {
    const externalId = `${election.external_id}:${adapter.key}:contest:${item.type}:${slug(item.title)}`
    await client.query(
      `insert into public.contests
         (external_id, election_id, jurisdiction_id, type, title, description, url, source_id, verified_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (external_id) do update set
         type = excluded.type,
         title = excluded.title,
         description = excluded.description,
         url = excluded.url,
         source_id = excluded.source_id,
         verified_at = excluded.verified_at,
         updated_at = now()`,
      [externalId, election.id, jurisdictionId, item.type, item.title, item.description, item.url, sourceId, verifiedAt],
    )
  }
}

async function ingestCounty({ pool, adapter, fetchImpl, year }) {
  const electionPayload = await fetchText(adapter.electionUrl, fetchImpl)
  const [ballotPayload, locationPayload] = await Promise.all([
    adapter.ballotUrl ? fetchText(adapter.ballotUrl, fetchImpl) : null,
    adapter.locationParser === 'king_arcgis'
      ? fetchArcGisFeatures({
        url: adapter.locationUrl,
        outFields: ['FEATURE_ID', 'NAME', 'ADDRESS', 'ZIPCODE', 'CITYZIP', 'DESC_NOTES', 'DRIVEUP', 'LAT', 'LON'],
        fetchImpl,
      }).then((features) => ({
        features,
        body: JSON.stringify({ type: 'FeatureCollection', features }),
        status: 200,
        contentType: 'application/geo+json',
      }))
      : fetchText(adapter.locationUrl, fetchImpl),
  ])

  const descriptor = parseCountyElection(electionPayload.body, year)
  const locations = parseCountyLocations(
    adapter.locationParser,
    locationPayload.features ?? locationPayload.body,
    descriptor.electionDay,
  )
  const ballotItems = [
    ...parseBallotItems(electionPayload.body, adapter.electionUrl),
    ...(ballotPayload ? parseBallotItems(ballotPayload.body, adapter.ballotUrl) : []),
  ].filter((item, index, all) => all.findIndex((candidate) => (
    candidate.type === item.type && candidate.title === item.title && candidate.url === item.url
  )) === index)

  const minimumLocations = adapter.key === 'king' ? 50 : adapter.key === 'snohomish' ? 20 : 2
  if (locations.length < minimumLocations) {
    throw new Error(`${adapter.name} location parser safety check failed: found ${locations.length}, expected at least ${minimumLocations}.`)
  }

  const client = await pool.connect()
  const verifiedAt = new Date().toISOString()
  try {
    await client.query('begin')
    const electionSourceId = await upsertSource(client, {
      key: `wa-${adapter.key}-current-election`,
      publisher: adapter.publisher,
      url: adapter.electionUrl,
      category: 'county_election',
    })
    const locationSourceId = await upsertSource(client, {
      key: `wa-${adapter.key}-voting-locations`,
      publisher: adapter.publisher,
      url: adapter.locationUrl,
      category: 'location',
    })
    const ballotSourceId = ballotPayload
      ? await upsertSource(client, {
        key: `wa-${adapter.key}-ballot`,
        publisher: adapter.publisher,
        url: adapter.ballotUrl,
        category: 'ballot',
      })
      : electionSourceId

    await snapshot(client, electionSourceId, electionPayload)
    await snapshot(client, locationSourceId, locationPayload)
    if (ballotPayload) await snapshot(client, ballotSourceId, ballotPayload)

    const jurisdiction = await client.query(
      'select id from public.jurisdictions where external_id = $1',
      [adapter.jurisdictionExternalId],
    )
    if (!jurisdiction.rows[0]) {
      throw new Error(`${adapter.name} jurisdiction is missing; run the Washington boundary import first.`)
    }

    const election = await findOrCreateElection(client, descriptor, electionSourceId, verifiedAt)
    const jurisdictionId = jurisdiction.rows[0].id
    await client.query(
      `insert into public.election_jurisdictions (election_id, jurisdiction_id, applicability)
       values ($1, $2, 'all')
       on conflict (election_id, jurisdiction_id) do update set applicability = excluded.applicability`,
      [election.id, jurisdictionId],
    )

    await replaceLocations(client, {
      adapter, election, jurisdictionId, sourceId: locationSourceId, locations, verifiedAt,
    })
    await replaceContests(client, {
      adapter, election, jurisdictionId, sourceId: ballotSourceId, items: ballotItems, verifiedAt,
    })

    await client.query(
      `insert into public.coverage (jurisdiction_id, component, status, notes, verified_at)
       values
         ($1, 'calendar', 'complete', $2, $4),
         ($1, 'deadlines', 'complete', $2, $4),
         ($1, 'locations', 'complete', $3, $4),
         ($1, 'contests', 'partial', $5, $4)
       on conflict (jurisdiction_id, component) do update set
         status = excluded.status,
         notes = excluded.notes,
         verified_at = excluded.verified_at`,
      [
        jurisdictionId,
        `${adapter.publisher} current election page`,
        `${locations.length} official locations from ${adapter.publisher}`,
        verifiedAt,
        ballotItems.length > 0
          ? `${ballotItems.length} official ballot resources or measures; address-specific ballot lookup may still be required`
          : 'Official county page does not expose a machine-readable complete contest list',
      ],
    )

    await client.query('commit')
    return {
      county: adapter.name,
      electionDay: descriptor.electionDay,
      locations: locations.length,
      ballotItems: ballotItems.length,
      verifiedAt,
    }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function ingestWashingtonCounties({
  pool,
  fetchImpl = fetch,
  year = new Date().getFullYear(),
  countyKeys = WA_COUNTY_ADAPTERS.map((adapter) => adapter.key),
}) {
  const selected = WA_COUNTY_ADAPTERS.filter((adapter) => countyKeys.includes(adapter.key))
  if (selected.length !== countyKeys.length) {
    const known = WA_COUNTY_ADAPTERS.map((adapter) => adapter.key).join(', ')
    throw new Error(`Unknown county adapter. Available adapters: ${known}`)
  }

  const results = []
  for (const adapter of selected) {
    results.push(await ingestCounty({ pool, adapter, fetchImpl, year }))
  }

  const verifiedAt = new Date().toISOString()
  await pool.query(
    `insert into public.coverage (jurisdiction_id, component, status, notes, verified_at)
     select id, detail.component, 'partial', detail.notes, $1
     from public.jurisdictions
     cross join (values
       ('locations', $2::text),
       ('contests', $3::text)
     ) as detail(component, notes)
     where external_id = 'ocd-division/country:us/state:wa'
     on conflict (jurisdiction_id, component) do update set
       status = excluded.status,
       notes = excluded.notes,
       verified_at = excluded.verified_at`,
    [
      verifiedAt,
      `County location adapters active for ${WA_COUNTY_ADAPTERS.map((adapter) => adapter.name).join(', ')}`,
      'County ballot-resource adapters are active, but complete address-specific contest coverage is not yet statewide',
    ],
  )
  return results
}
