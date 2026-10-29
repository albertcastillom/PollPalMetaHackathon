import assert from 'node:assert/strict'
import test from 'node:test'

import { fetchArcGisFeatures } from './arcgis-client.js'

test('paginates ArcGIS feature responses', async () => {
  const offsets = []
  const fetchImpl = async (url) => {
    const offset = Number(url.searchParams.get('resultOffset'))
    offsets.push(offset)
    const count = offset === 0 ? 2 : 1
    return {
      ok: true,
      async json() {
        return { features: Array.from({ length: count }, (_, index) => ({ id: offset + index })) }
      },
    }
  }

  const features = await fetchArcGisFeatures({
    url: 'https://example.test/FeatureServer/0',
    outFields: ['name'],
    fetchImpl,
    pageSize: 2,
  })

  assert.deepEqual(offsets, [0, 2])
  assert.equal(features.length, 3)
})
