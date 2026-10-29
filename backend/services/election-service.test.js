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
