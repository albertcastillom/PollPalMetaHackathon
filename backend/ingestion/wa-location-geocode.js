// Fills in map coordinates for stored voting locations whose county source only publishes a
// street address (Snohomish, Benton and Franklin). Uses the free U.S. Census geocoder, so
// these addresses are public places, never voter addresses.

const CENSUS_LOCATIONS_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress'

export async function geocodePublicAddress(address, { fetchImpl = fetch } = {}) {
  const url = new URL(CENSUS_LOCATIONS_URL)
  url.searchParams.set('address', address)
  url.searchParams.set('benchmark', 'Public_AR_Current')
  url.searchParams.set('format', 'json')

  const response = await fetchImpl(url, {
    headers: { accept: 'application/json', 'user-agent': 'PollPal location geocoder/0.1' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Census geocoder returned HTTP ${response.status}`)

  const match = (await response.json())?.result?.addressMatches?.[0]
  if (!match || match.addressComponents?.state !== 'WA') return null
  return { latitude: match.coordinates.y, longitude: match.coordinates.x }
}

function oneLine(location) {
  // Drop suite/room details ("Suite 100", "Room 2") that the Census matcher often rejects.
  const street = String(location.address ?? '').replace(/[,\s]+(suite|ste|room|rm|unit|#)\s*[\w-]+$/i, '')
  return [street, location.city, `WA ${location.postal_code ?? ''}`.trim()].filter(Boolean).join(', ')
}

export async function geocodeMissingLocations({ pool, fetchImpl = fetch, concurrency = 4, log = () => {} }) {
  const { rows } = await pool.query(
    `select id, name, address, city, postal_code
     from public.voting_locations
     where geometry is null and address is not null
     order by city, name`,
  )

  // The same site is often listed once per election, so geocode each address only once.
  const byAddress = new Map()
  for (const row of rows) {
    const key = oneLine(row).toLowerCase()
    if (!byAddress.has(key)) byAddress.set(key, { line: oneLine(row), ids: [] })
    byAddress.get(key).ids.push(row.id)
  }

  const queue = [...byAddress.values()]
  const missed = []
  let updated = 0

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()
      let point = null
      try {
        point = await geocodePublicAddress(item.line, { fetchImpl })
      } catch (error) {
        log(`  ! ${item.line}: ${error.message}`)
      }
      if (!point) {
        missed.push(item.line)
        continue
      }
      const result = await pool.query(
        `update public.voting_locations
         set geometry = extensions.st_setsrid(extensions.st_point($2, $1), 4326), updated_at = now()
         where id = any($3::uuid[]) and geometry is null`,
        [point.latitude, point.longitude, item.ids],
      )
      updated += result.rowCount
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  return { locationsMissingCoordinates: rows.length, uniqueAddresses: byAddress.size, updated, unmatched: missed }
}
