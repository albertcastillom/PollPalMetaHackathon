import assert from 'node:assert/strict'
import test from 'node:test'

import { createDemoElectionProvider } from './demo-elections.js'

const austin = {
  latitude: 30.26,
  longitude: -97.74,
  normalizedAddress: '100 CONGRESS AVE, AUSTIN, TX, 78701',
  state: 'TX',
  stateName: 'Texas',
  county: { name: 'Travis County', fips: '48453' },
  city: 'Austin',
  congressionalDistrict: { number: 10, atLarge: false },
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test('builds a labeled sample ballot for an address outside Washington', () => {
  const result = createDemoElectionProvider().findUpcoming({ geocoded: austin, asOf: '2026-10-27' })

  assert.equal(result.demo.sample, true)
  assert.equal(result.demo.asOf, '2026-10-27')
  assert.equal(result.elections[0].electionDay, '2026-11-03')
  const titles = result.contests.map((contest) => contest.title)
  assert.ok(titles.includes('U.S. Senator'))
  assert.ok(titles.includes('Governor'))
  assert.ok(titles.includes('U.S. Representative'))
  assert.ok(titles.includes('Travis County Commissioner, Position 1'))
  assert.match(result.contests.find((contest) => contest.title === 'U.S. Representative').description, /District 10/)
  for (const contest of result.contests) assert.match(contest.id, UUID)
  for (const location of result.votingLocations) {
    assert.match(location.name, /\(sample\)/)
    assert.ok(location.coordinates.latitude && location.coordinates.longitude)
  }
})

test('only lists the Senate and Governor races a state actually has in 2026', () => {
  const provider = createDemoElectionProvider()
  const california = provider.findUpcoming({ geocoded: { ...austin, state: 'CA', stateName: 'California' }, asOf: null })
  const titles = california.contests.map((contest) => contest.title)
  assert.ok(!titles.includes('U.S. Senator'))
  assert.ok(titles.includes('Governor'))
})

test('gives the same sample ballot for the same address', () => {
  const first = createDemoElectionProvider().findUpcoming({ geocoded: austin, asOf: null })
  const second = createDemoElectionProvider().findUpcoming({ geocoded: austin, asOf: null })
  assert.deepEqual(first.contests, second.contests)
  assert.deepEqual(first.votingLocations, second.votingLocations)
})

test('remembers sample races so they can be compared', () => {
  const provider = createDemoElectionProvider()
  const { contests } = provider.findUpcoming({ geocoded: austin, asOf: null })
  const race = provider.findContestForComparison(contests[0].id)
  assert.equal(race.candidates.length, contests[0].candidates.length)
  assert.ok(race.candidates.every((candidate) => candidate.profile.statement.length > 50))
  assert.ok(race.notices.candidateStatement.includes('not real'))
})
