const DEFAULT_BASE_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress'

function locationError(status, code, message) {
  return Object.assign(new Error(message), { status, code })
}

export function createCensusGeocoder({ fetchImpl = fetch, baseUrl = DEFAULT_BASE_URL } = {}) {
  return {
    name: 'us_census_geocoder',

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
        throw locationError(422, 'address_not_resolved', 'The address could not be resolved to a Washington location.')
      }

      const state = match.addressComponents?.state
      if (state !== 'WA') {
        throw locationError(422, 'outside_coverage', 'Phase 1 currently supports Washington addresses only.')
      }

      return {
        latitude: match.coordinates.y,
        longitude: match.coordinates.x,
        normalizedAddress: match.matchedAddress,
      }
    },
  }
}
