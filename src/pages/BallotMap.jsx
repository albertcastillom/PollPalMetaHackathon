import { lazy, Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ZipForm from '../components/ZipForm'
import { useElections } from '../lib/useElections'
import { distanceMiles, formatDate, formatTime, todayString } from '../lib/format'

// The map library is large, so it only loads when this page is opened.
const LocationMap = lazy(() => import('../components/LocationMap'))

const TYPE_LABELS = {
  drop_box: 'Drop box',
  voting_center: 'Voting center',
  election_office: 'Election office',
}

function availability(location) {
  const dates = location.opensOn
    ? `${formatDate(location.opensOn, { month: 'short', day: 'numeric' })} – ${formatDate(location.closesOn, { month: 'short', day: 'numeric' })}`
    : `Through ${formatDate(location.closesOn, { month: 'short', day: 'numeric' })}`
  const hours = location.opensTime
    ? `${formatTime(location.opensTime)} – ${formatTime(location.closesTime)}`
    : `Until ${formatTime(location.closesTime)}`
  return `${dates} · ${hours}`
}

function byDistance(a, b) {
  if (a.distance == null && b.distance == null) return 0
  if (a.distance == null) return 1
  if (b.distance == null) return -1
  return a.distance - b.distance
}

function BallotMap() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawZip = searchParams.get('zip') ?? ''
  const zip = /^\d{5}$/.test(rawZip) ? rawZip : ''
  const { loading, data, error } = useElections(zip)
  const [showAllTypes, setShowAllTypes] = useState(false)
  const [selectedId, setSelectedId] = useState(null)

  const locations = useMemo(() => {
    if (!data) return []

    const today = todayString()
    const seen = new Set()
    const result = []

    for (const location of data.votingLocations ?? []) {
      if (!showAllTypes && location.type !== 'drop_box') continue
      if (location.closesOn && location.closesOn < today) continue

      // The same site can be listed once per election, so show it once.
      const key = `${location.name}|${location.address}`
      if (seen.has(key)) continue
      seen.add(key)

      result.push({
        ...location,
        distance:
          location.coordinates && data.coordinates ? distanceMiles(data.coordinates, location.coordinates) : null,
      })
    }

    return result.sort(byDistance)
  }, [data, showAllTypes])

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Ballot drop-off locations
        </h1>
        <p className="mt-2 text-slate-600">See where you can drop off your ballot near you.</p>
      </div>

      <div className="mt-6 max-w-xl">
        <ZipForm
          key={zip}
          id="map-zip"
          initialZip={zip}
          buttonLabel="Find locations"
          onSubmit={(nextZip) => setSearchParams({ zip: nextZip })}
          hint="Currently covers Washington state."
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3" aria-live="polite">
        {/* Map */}
        <div className="relative min-h-[320px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm lg:col-span-2 lg:min-h-[520px]">
          {data ? (
            <Suspense fallback={<p className="p-6 text-sm text-slate-500">Loading map…</p>}>
              <LocationMap
                center={data.coordinates}
                locations={locations}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </Suspense>
          ) : (
            <div className="flex h-full min-h-[320px] items-center justify-center p-6 text-center text-sm text-slate-500">
              {loading ? `Looking up locations near ${zip}…` : 'Enter your ZIP code to see drop-off locations on the map.'}
            </div>
          )}
        </div>

        {/* Location list */}
        <div>
          {error && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {error.message}
            </div>
          )}

          {data && (
            <>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={showAllTypes}
                  onChange={(event) => setShowAllTypes(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Also show voting centers and election offices
              </label>

              {data.query?.precision === 'zip_centroid' && (
                <p className="mt-3 text-xs text-slate-500">
                  Sorted by distance from the center of ZIP code {zip}. Check with your county which
                  locations you can use.
                </p>
              )}

              {locations.length === 0 ? (
                <p className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                  No drop-off locations are listed for this ZIP code yet. Location data currently covers
                  King, Snohomish, Benton and Franklin counties.
                </p>
              ) : (
                <ul className="mt-4 space-y-3 lg:max-h-[460px] lg:overflow-y-auto lg:pr-1">
                  {locations.map((location) => (
                    <li key={location.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(location.id)}
                        aria-pressed={selectedId === location.id}
                        className={`w-full rounded-xl border bg-white p-4 text-left shadow-sm hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-600 ${
                          selectedId === location.id ? 'border-blue-600 ring-1 ring-blue-600' : 'border-slate-200'
                        }`}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-slate-900">{location.name}</span>
                          {location.distance != null && (
                            <span className="shrink-0 text-xs font-medium text-slate-500">
                              {location.distance.toFixed(1)} mi
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block text-sm text-slate-600">
                          {[location.address, location.city, location.postalCode].filter(Boolean).join(', ')}
                        </span>
                        <span className="mt-1 block text-xs font-medium text-blue-700">{availability(location)}</span>
                        <span className="mt-2 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                            {TYPE_LABELS[location.type] ?? location.type}
                          </span>
                          {location.driveUp && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">Drive-up</span>
                          )}
                        </span>
                      </button>
                      {location.source?.url && (
                        <a
                          href={location.source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block px-1 text-xs text-blue-700 hover:underline"
                        >
                          Source: {location.source.publisher ?? 'official source'}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default BallotMap