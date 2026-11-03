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
      const elections = await repository.findUpcomingElections(jurisdictionIds)
      const electionIds = elections.map((election) => election.id)
      const [coverage, votingLocations, contests] = await Promise.all([
        repository.getCoverage(jurisdictionIds),
        repository.findVotingLocations(electionIds, jurisdictionIds),
        repository.findContests(electionIds, jurisdictionIds),
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
        votingLocations,
        contests,
        coverage,
      }
    },
  }
}
