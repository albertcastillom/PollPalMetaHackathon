function serviceError(status, code, message) {
  return Object.assign(new Error(message), { status, code })
}

export function createElectionService({ electionProvider, addressGeocoder }) {
  return {
    async findUpcoming(location) {
      let coordinates = location.coordinates
      let normalizedAddress = null
      let locationSource = 'user_coordinates'

      if (location.address) {
        if (!addressGeocoder) {
          throw serviceError(503, 'geocoder_not_configured', 'Address lookup is not configured.')
        }
        const geocoded = await addressGeocoder.geocode(location.address)
        coordinates = {
          latitude: geocoded.latitude,
          longitude: geocoded.longitude,
        }
        normalizedAddress = geocoded.normalizedAddress
        locationSource = addressGeocoder.name
      }

      const result = await electionProvider.findUpcoming({ coordinates, normalizedAddress })

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
