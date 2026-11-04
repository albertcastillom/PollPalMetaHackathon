const DEFAULT_BASE_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress'

function locationError(status, code, message) {
  return Object.assign(new Error(message), { status, code })
}

// The Census layer names include the Congress number (e.g. "120th Congressional Districts"),
// which changes every two years, so match on the name instead of a fixed key.
function congressionalDistrict(geographies) {
  const [, districts] = Object.entries(geographies ?? {}).find(([key]) => /Congressional Districts/i.test(key)) ?? []
  const district = districts?.[0]
  if (!district) return null
  const atLarge = /at large/i.test(district.BASENAME ?? '') || /at large/i.test(district.NAME ?? '')
  const number = Number.parseInt(district.BASENAME, 10)
  return { number: atLarge || Number.isNaN(number) ? null : number, atLarge, name: district.NAME ?? null }
}

export function createCensusGeocoder({ fetchImpl = fetch, baseUrl = DEFAULT_BASE_URL } = {}) {
  return {
    name: 'us_census_geocoder',

    // Resolves any US street address to coordinates plus the state, county, city and
    // congressional district it falls in.
    async geocode(address) {
      const url = new URL(baseUrl)
      url.searchParams.set('address', address)
      url.searchParams.set('benchmark', 'Public_AR_Current')
      url.searchParams.set('vintage', 'Current_Current')
      url.searchParams.set('format', 'json')

      const response = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      })

      if (!response.ok) {
        throw locationError(502, 'geocoder_unavailable', 'The Census geocoder is temporarily unavailable.')
      }

      const body = await response.json()
      const match = body?.result?.addressMatches?.[0]

      if (!match) {
        throw locationError(422, 'address_not_resolved', 'We could not find that address. Check the street, city, state and ZIP code.')
      }

      const geographies = match.geographies ?? {}
      const stateInfo = geographies.States?.[0]
      const county = geographies.Counties?.[0]
      const place = geographies['Incorporated Places']?.[0] ?? geographies['County Subdivisions']?.[0]

      return {
        latitude: match.coordinates.y,
        longitude: match.coordinates.x,
        normalizedAddress: match.matchedAddress,
        state: match.addressComponents?.state ?? stateInfo?.STUSAB ?? null,
        stateName: stateInfo?.NAME ?? null,
        county: county ? { name: county.NAME, fips: county.GEOID } : null,
        city: place?.BASENAME ?? match.addressComponents?.city ?? null,
        congressionalDistrict: congressionalDistrict(geographies),
      }
    },
  }
}
