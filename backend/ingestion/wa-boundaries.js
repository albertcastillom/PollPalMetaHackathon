import { fetchArcGisFeatures } from './arcgis-client.js'

const PRECINCT_URL = 'https://services.arcgis.com/jsIt88o09Q0r1j8h/arcgis/rest/services/Statewide_Precincts_2019General_SPS/FeatureServer/0'
const CITY_URL = 'https://webgis.dor.wa.gov/arcgis/rest/services/Ref/Cities/MapServer/0'

function slug(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function polygonParts(geometry) {
  if (!geometry) return []
  if (geometry.type === 'Polygon') return [geometry.coordinates]
  if (geometry.type === 'MultiPolygon') return geometry.coordinates
  throw new Error(`Unsupported boundary geometry type: ${geometry.type}`)
}

function deduplicateBoundaries(records) {
  const unique = new Map()
  for (const record of records) {
    const existing = unique.get(record.externalId)
    if (!existing) {
      unique.set(record.externalId, record)
      continue
    }

    const coordinates = [
      ...polygonParts(existing.geometry),
      ...polygonParts(record.geometry),
    ]
    existing.geometry = coordinates.length === 0
      ? null
      : { type: 'MultiPolygon', coordinates }
  }
  return [...unique.values()]
}

async function sourceId(client, source) {
  const { rows } = await client.query(
    `insert into public.sources (key, publisher, url, category)
     values ($1, $2, $3, 'boundary')
     on conflict (key) do update set url = excluded.url, updated_at = now()
     returning id`,
    [source.key, source.publisher, source.url],
  )
  return rows[0].id
}

async function upsertBatch(client, records) {
  await client.query(
    `insert into public.jurisdictions
       (external_id, name, type, geometry, metadata, source_id, verified_at)
     select
       item->>'externalId',
       item->>'name',
       item->>'type',
       case when item->'geometry' is null or item->'geometry' = 'null'::jsonb then null else
         extensions.st_multi(extensions.st_setsrid(extensions.st_geomfromgeojson(item->'geometry'), 4326))
       end,
       item->'metadata',
       (item->>'sourceId')::uuid,
       (item->>'verifiedAt')::timestamptz
     from jsonb_array_elements($1::jsonb) item
     on conflict (external_id) do update set
       name = excluded.name,
       type = excluded.type,
       geometry = case
         when excluded.geometry is null then public.jurisdictions.geometry
         when public.jurisdictions.geometry is null then excluded.geometry
         else extensions.st_multi(extensions.st_unaryunion(
           extensions.st_collect(public.jurisdictions.geometry, excluded.geometry)
         ))
       end,
       metadata = excluded.metadata,
       source_id = excluded.source_id,
       verified_at = excluded.verified_at,
       updated_at = now()`,
    [JSON.stringify(records)],
  )
}

export async function importWashingtonBoundaries({ pool, fetchImpl = fetch }) {
  const [precinctFeatures, cityFeatures] = await Promise.all([
    fetchArcGisFeatures({
      url: PRECINCT_URL,
      outFields: ['County', 'CountyName', 'PrecCode', 'PrecName', 'LD', 'CD'],
      fetchImpl,
    }),
    fetchArcGisFeatures({ url: CITY_URL, outFields: ['CITY', 'CITY_DISSOLVE', 'GNIS', 'PLACE'], fetchImpl }),
  ])

  if (precinctFeatures.length < 1000 || cityFeatures.length < 200) {
    throw new Error('Boundary safety check failed: an official layer returned too few records.')
  }

  const client = await pool.connect()
  const verifiedAt = new Date().toISOString()

  try {
    await client.query('begin')
    const precinctSourceId = await sourceId(client, {
      key: 'wa-sos-statewide-precincts',
      publisher: 'Washington Secretary of State / WaTech',
      url: PRECINCT_URL,
    })
    const citySourceId = await sourceId(client, {
      key: 'wa-dor-city-boundaries',
      publisher: 'Washington Department of Revenue',
      url: CITY_URL,
    })

    const derived = new Map()
    const precincts = deduplicateBoundaries(precinctFeatures.map((feature) => {
      const p = feature.properties
      const countyExternalId = `wa:county:${slug(p.CountyName)}`
      const legislativeExternalId = `wa:legislative:${p.LD}`
      const congressionalExternalId = `wa:congressional:${p.CD}`
      derived.set(countyExternalId, { externalId: countyExternalId, name: `${p.CountyName} County`, type: 'county' })
      derived.set(legislativeExternalId, { externalId: legislativeExternalId, name: `Legislative District ${p.LD}`, type: 'legislative' })
      derived.set(congressionalExternalId, { externalId: congressionalExternalId, name: `Congressional District ${p.CD}`, type: 'congressional' })

      return {
        externalId: `wa:precinct:${p.County}:${p.PrecCode}`,
        name: p.PrecName,
        type: 'precinct',
        geometry: feature.geometry,
        metadata: { countyExternalId, legislativeExternalId, congressionalExternalId },
        sourceId: precinctSourceId,
        verifiedAt,
      }
    }))

    const derivedRecords = [{ externalId: 'ocd-division/country:us/state:wa', name: 'Washington', type: 'state' }, ...derived.values()].map((record) => ({
      ...record,
      geometry: null,
      metadata: {},
      sourceId: precinctSourceId,
      verifiedAt,
    }))
    const cities = deduplicateBoundaries(cityFeatures.filter((feature) => (
      feature.properties.CITY_DISSOLVE || feature.properties.CITY
    )).map((feature) => ({
      externalId: `wa:city:${slug(feature.properties.CITY_DISSOLVE ?? feature.properties.CITY)}`,
      name: feature.properties.CITY_DISSOLVE ?? feature.properties.CITY,
      type: 'city',
      geometry: feature.geometry,
      metadata: { gnis: feature.properties.GNIS, place: feature.properties.PLACE },
      sourceId: citySourceId,
      verifiedAt,
    })))

    for (const records of [derivedRecords, precincts, cities]) {
      for (let index = 0; index < records.length; index += 250) {
        await upsertBatch(client, records.slice(index, index + 250))
      }
    }

    await client.query(
      `with precinct_groups as (
         select metadata->>'countyExternalId' as external_id,
                extensions.st_multi(extensions.st_unaryunion(extensions.st_collect(geometry))) as geometry
         from public.jurisdictions where type = 'precinct'
         group by metadata->>'countyExternalId'
         union all
         select metadata->>'legislativeExternalId',
                extensions.st_multi(extensions.st_unaryunion(extensions.st_collect(geometry)))
         from public.jurisdictions where type = 'precinct'
         group by metadata->>'legislativeExternalId'
         union all
         select metadata->>'congressionalExternalId',
                extensions.st_multi(extensions.st_unaryunion(extensions.st_collect(geometry)))
         from public.jurisdictions where type = 'precinct'
         group by metadata->>'congressionalExternalId'
       )
       update public.jurisdictions j
       set geometry = g.geometry, updated_at = now()
       from precinct_groups g
       where j.external_id = g.external_id`,
    )

    await client.query(
      `update public.jurisdictions
       set geometry = (
         select extensions.st_multi(extensions.st_unaryunion(extensions.st_collect(geometry)))
         from public.jurisdictions where type = 'precinct'
       ), updated_at = now()
       where external_id = 'ocd-division/country:us/state:wa'`,
    )

    await client.query(
      `insert into public.coverage (jurisdiction_id, component, status, notes, verified_at)
       select id, 'precinct_matching', 'complete',
              'Washington SOS statewide precinct boundaries', $1
       from public.jurisdictions
       where external_id = 'ocd-division/country:us/state:wa'
       on conflict (jurisdiction_id, component) do update set
         status = excluded.status,
         notes = excluded.notes,
         verified_at = excluded.verified_at`,
      [verifiedAt],
    )

    await client.query('commit')
    return { precincts: precincts.length, cities: cities.length, derived: derivedRecords.length, verifiedAt }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}
