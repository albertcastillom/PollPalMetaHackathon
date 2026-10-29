function providerError(status, code, message) {
  return Object.assign(new Error(message), { status, code })
}

export function createWashingtonOwnedProvider({ repository }) {
  return {
    name: 'pollpal_washington',

    async findUpcoming({ coordinates, normalizedAddress = null }) {
      const jurisdictions = await repository.resolveJurisdictions(coordinates)
      const state = jurisdictions.find((item) => item.type === 'state')

      if (!state) {
        throw providerError(422, 'outside_coverage', 'These coordinates are outside Washington coverage.')
      }

      const jurisdictionIds = jurisdictions.map((item) => item.id)
      const [elections, coverage] = await Promise.all([
        repository.findUpcomingElections(jurisdictionIds),
        repository.getCoverage(jurisdictionIds),
      ])

      return {
        provider: this.name,
        normalizedLocation: normalizedAddress,
        coordinates,
        jurisdictions: jurisdictions.map((item) => ({
          id: item.external_id,
          name: item.name,
          type: item.type,
          verifiedAt: item.verified_at,
        })),
        elections,
        coverage,
      }
    },
  }
}
