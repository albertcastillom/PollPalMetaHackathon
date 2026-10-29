import assert from 'node:assert/strict'
import test from 'node:test'

import { createCensusGeocoder } from './census-geocoder.js'

function response(body, ok = true) {
  return { ok, status: ok ? 200 : 500, async json() { return body } }
}

test('normalizes a Washington address to coordinates', async () => {
  const geocoder = createCensusGeocoder({
    fetchImpl: async () => response({
      result: {
        addressMatches: [{
          matchedAddress: '18415 101ST AVE NE, BOTHELL, WA, 98011',
          coordinates: { x: -122.205, y: 47.762 },
          addressComponents: { state: 'WA' },
        }],
      },
    }),
  })

  const result = await geocoder.geocode('Bothell address')
  assert.equal(result.latitude, 47.762)
  assert.equal(result.longitude, -122.205)
  assert.match(result.normalizedAddress, /BOTHELL/)
})

test('rejects addresses outside Washington coverage', async () => {
  const geocoder = createCensusGeocoder({
    fetchImpl: async () => response({
      result: {
        addressMatches: [{
          matchedAddress: 'PORTLAND, OR',
          coordinates: { x: -122.67, y: 45.52 },
          addressComponents: { state: 'OR' },
        }],
      },
    }),
  })

  await assert.rejects(geocoder.geocode('Portland'), (error) => error.code === 'outside_coverage')
})
