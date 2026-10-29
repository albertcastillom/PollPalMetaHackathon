export async function fetchArcGisFeatures({ url, outFields, fetchImpl = fetch, pageSize = 1000 }) {
  const features = []
  let offset = 0

  while (true) {
    const queryUrl = new URL(`${url.replace(/\/$/, '')}/query`)
    queryUrl.searchParams.set('where', '1=1')
    queryUrl.searchParams.set('outFields', outFields.join(','))
    queryUrl.searchParams.set('returnGeometry', 'true')
    queryUrl.searchParams.set('outSR', '4326')
    queryUrl.searchParams.set('f', 'geojson')
    queryUrl.searchParams.set('resultOffset', String(offset))
    queryUrl.searchParams.set('resultRecordCount', String(pageSize))

    const response = await fetchImpl(queryUrl, {
      headers: { accept: 'application/geo+json', 'user-agent': 'PollPal boundary collector/0.1' },
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`ArcGIS returned HTTP ${response.status} for ${url}`)
    const body = await response.json()
    const page = body.features ?? []
    features.push(...page)
    if (page.length < pageSize) break
    offset += page.length
  }

  return features
}
