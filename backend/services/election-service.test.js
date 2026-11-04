import assert from 'node:assert/strict'
import test from 'node:test'

import { createElectionService } from './election-service.js'

test('geocodes an address and discards the raw input before provider lookup', async () => {
  const addressGeocoder = {
    name: 'test_geocoder',
    async geocode() {
      return { latitude: 47.76, longitude: -122.2, normalizedAddress: 'BOTHELL, WA' }
    },
  }
  const electionProvider = {
    async findUpcoming(input) {
      return { provider: 'test', input, elections: [] }
    },
  }
  const service = createElectionService({ electionProvider, addressGeocoder })

  const result = await service.findUpcoming({ address: 'private input address' })

  assert.deepEqual(result.input, {
    coordinates: { latitude: 47.76, longitude: -122.2 },
    normalizedAddress: 'BOTHELL, WA',
    asOf: null,
  })
  assert.equal(result.query.resolvedBy, 'test_geocoder')
  assert.equal(JSON.stringify(result).includes('private input address'), false)
})

test('passes coordinates directly to the owned provider', async () => {
  const electionProvider = {
    async findUpcoming(input) {
      return { provider: 'test', input, elections: [] }
    },
  }
  const service = createElectionService({ electionProvider, addressGeocoder: null })
  const coordinates = { latitude: 47.76, longitude: -122.2 }

  const result = await service.findUpcoming({ coordinates })

  assert.deepEqual(result.input.coordinates, coordinates)
  assert.equal(result.query.type, 'coordinates')
  assert.equal(result.query.resolvedBy, 'user_coordinates')
})

function geocoderFor(state) {
  return {
    name: 'test_geocoder',
    async geocode() {
      return { latitude: 30.26, longitude: -97.74, normalizedAddress: `SOMEWHERE, ${state}`, state }
    },
  }
}

test('sends addresses outside Washington to the demo provider', async () => {
  const calls = []
  const electionProvider = { async findUpcoming() { calls.push('washington'); return { elections: [] } } }
  const demoProvider = { async findUpcoming({ geocoded, asOf }) { calls.push(`demo:${geocoded.state}:${asOf}`); return { elections: [], demo: { sample: true } } } }
  const service = createElectionService({ electionProvider, addressGeocoder: geocoderFor('TX'), demoProvider, asOf: '2026-10-27' })

  const result = await service.findUpcoming({ address: 'an Austin address' })
  assert.deepEqual(calls, ['demo:TX:2026-10-27'])
  assert.equal(result.demo.sample, true)
})

test('rejects addresses outside Washington when demo mode is off', async () => {
  const electionProvider = { async findUpcoming() { return { elections: [] } } }
  const service = createElectionService({ electionProvider, addressGeocoder: geocoderFor('TX') })
  await assert.rejects(service.findUpcoming({ address: 'an Austin address' }), (error) => error.code === 'outside_coverage')
})

test('passes the demo date to Washington lookups and labels the result', async () => {
  let received
  const electionProvider = { async findUpcoming(input) { received = input; return { elections: [] } } }
  const service = createElectionService({ electionProvider, addressGeocoder: geocoderFor('WA'), asOf: '2026-10-27' })

  const result = await service.findUpcoming({ address: 'a Seattle address' })
  assert.equal(received.asOf, '2026-10-27')
  assert.equal(result.demo.sample, false)
  assert.equal(result.demo.asOf, '2026-10-27')
})
