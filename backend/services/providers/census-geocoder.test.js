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

test('resolves addresses in any state with county and congressional district', async () => {
  const geocoder = createCensusGeocoder({
    fetchImpl: async () => response({
      result: {
        addressMatches: [{
          matchedAddress: '100 CONGRESS AVE, AUSTIN, TX, 78701',
          coordinates: { x: -97.74, y: 30.26 },
          addressComponents: { state: 'TX', city: 'AUSTIN' },
          geographies: {
            States: [{ STUSAB: 'TX', NAME: 'Texas' }],
            Counties: [{ NAME: 'Travis County', GEOID: '48453' }],
            'Incorporated Places': [{ BASENAME: 'Austin' }],
            '120th Congressional Districts': [{ BASENAME: '10', NAME: 'Congressional District 10' }],
          },
        }],
      },
    }),
  })

  const result = await geocoder.geocode('Austin address')
  assert.equal(result.state, 'TX')
  assert.deepEqual(result.county, { name: 'Travis County', fips: '48453' })
  assert.equal(result.city, 'Austin')
  assert.deepEqual(result.congressionalDistrict, { number: 10, atLarge: false, name: 'Congressional District 10' })
})

test('marks at-large congressional districts', async () => {
  const geocoder = createCensusGeocoder({
    fetchImpl: async () => response({
      result: {
        addressMatches: [{
          matchedAddress: '200 W 24TH ST, CHEYENNE, WY, 82001',
          coordinates: { x: -104.82, y: 41.14 },
          addressComponents: { state: 'WY' },
          geographies: { '120th Congressional Districts': [{ BASENAME: 'Congressional District (at Large)', NAME: 'Congressional District (at Large)' }] },
        }],
      },
    }),
  })

  const result = await geocoder.geocode('Cheyenne address')
  assert.equal(result.congressionalDistrict.atLarge, true)
  assert.equal(result.congressionalDistrict.number, null)
})

test('reports addresses the Census cannot match', async () => {
  const geocoder = createCensusGeocoder({ fetchImpl: async () => response({ result: { addressMatches: [] } }) })
  await assert.rejects(geocoder.geocode('nowhere'), (error) => error.code === 'address_not_resolved')
})
