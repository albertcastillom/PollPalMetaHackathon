function serviceError(status, code, message) {
  return Object.assign(new Error(message), { status, code })
}

// Looks up elections for an address or coordinates.
// - Washington addresses use PollPal's official Washington data.
// - Other US addresses use `demoProvider` (sample data) when one is configured.
// - `asOf` (YYYY-MM-DD) is a demo "today", so a past election still shows as upcoming.
export function createElectionService({ electionProvider, addressGeocoder, demoProvider = null, asOf = null }) {
  return {
    async findUpcoming(location) {
      let coordinates = location.coordinates
      let normalizedAddress = null
      let locationSource = 'user_coordinates'
      let geocoded = null

      if (location.address) {
        if (!addressGeocoder) {
          throw serviceError(503, 'geocoder_not_configured', 'Address lookup is not configured.')
        }
        geocoded = await addressGeocoder.geocode(location.address)
        coordinates = {
          latitude: geocoded.latitude,
          longitude: geocoded.longitude,
        }
        normalizedAddress = geocoded.normalizedAddress
        locationSource = addressGeocoder.name
      }

      let result
      if (geocoded && geocoded.state && geocoded.state !== 'WA') {
        if (!demoProvider) {
          throw serviceError(422, 'outside_coverage', 'PollPal currently covers Washington addresses only.')
        }
        result = await demoProvider.findUpcoming({ geocoded, asOf })
      } else {
        result = await electionProvider.findUpcoming({ coordinates, normalizedAddress, asOf })
        if (asOf) {
          result.demo = {
            sample: false,
            asOf,
            notice: 'Demo mode: showing the November 3, 2026 election as if it were still upcoming. Candidates and drop-off sites are from official Washington sources.',
          }
        }
      }

      return {
        ...result,
        query: {
          type: location.coordinates ? 'coordinates' : 'address',
          resolvedBy: locationSource,
        },
        retrievedAt: new Date().toISOString(),
      }
    },
  }
}
