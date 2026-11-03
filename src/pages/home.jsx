import { Link, useSearchParams } from 'react-router-dom'
import ZipForm from '../components/ZipForm'
import { useElections } from '../lib/useElections'
import { formatDate, todayString } from '../lib/format'

function ElectionCard({ election, zip }) {
  const today = todayString()
  const upcomingDates = (election.milestones ?? []).filter((milestone) => milestone.occursOn >= today)

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-900">{election.name}</h3>
            {election.type && (
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium capitalize text-blue-700">
                {String(election.type).replace(/_/g, ' ')}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Election Day: {formatDate(election.electionDay)}
            <span className="text-slate-400"> · </span>
            {election.status === 'confirmed' ? 'Date confirmed' : 'Date expected'}
          </p>
          {election.source?.url && (
            <p className="mt-1 text-xs text-slate-500">
              Source:{' '}
              <a
                href={election.source.url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-blue-700 hover:underline"
              >
                {election.source.publisher ?? 'Official source'}
              </a>
              {election.verifiedAt && <> · checked {formatDate(String(election.verifiedAt).slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' })}</>}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            to={`/candidates?zip=${zip}`}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            See candidates
          </Link>
          <Link
            to={`/map?zip=${zip}`}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Drop-off sites
          </Link>
        </div>
      </div>

      {upcomingDates.length > 0 && (
        <details className="mt-3 border-t border-slate-100 pt-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            Key dates ({upcomingDates.length})
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {upcomingDates.map((milestone) => (
              <li key={milestone.id} className="flex justify-between gap-4">
                <span>{milestone.label ?? milestone.kind}</span>
                <span className="shrink-0 text-slate-500">{formatDate(milestone.occursOn)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  )
}

function Results({ data, zip }) {
  const elections = data.elections ?? []
  const isApproximate = data.query?.precision === 'zip_centroid'

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900">
        Elections for {data.normalizedLocation ?? `ZIP ${zip}`}
      </h2>

      {isApproximate && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          These results are for the center of ZIP code {zip}. A ZIP code can cover more than one
          district, so some local races may be different at your exact address.
        </p>
      )}

      {elections.length === 0 ? (
        <p className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          We didn&apos;t find upcoming elections for this ZIP code in our data. That doesn&apos;t
          mean none are scheduled. Check with your county elections office.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {elections.map((election) => (
            <ElectionCard key={election.id} election={election} zip={zip} />
          ))}
        </ul>
      )}

      {(data.coverage ?? []).length > 0 && (
        <details className="mt-4 text-sm text-slate-600">
          <summary className="cursor-pointer font-medium text-slate-700">What data do we have for this area?</summary>
          <ul className="mt-2 space-y-1">
            {data.coverage.map((item) => (
              <li key={`${item.jurisdictionId}-${item.component}`}>
                <span className="font-medium capitalize">{String(item.component).replace(/_/g, ' ')}</span>:{' '}
                {item.status}
                {item.notes && <span className="text-slate-500"> — {item.notes}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function Home() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawZip = searchParams.get('zip') ?? ''
  const zip = /^\d{5}$/.test(rawZip) ? rawZip : ''
  const { loading, data, error } = useElections(zip)

  return (
    <div className="bg-gradient-to-b from-blue-50 to-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        {/* Election finder */}
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Find elections in your area
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Enter your ZIP code to see the elections you can vote in.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-3xl">
          <ZipForm
            key={zip}
            id="zip"
            initialZip={zip}
            onSubmit={(nextZip) => setSearchParams({ zip: nextZip })}
            hint="No account needed. Currently covers Washington state."
          />
        </div>

        {/* Results */}
        <div className="mx-auto mt-10 max-w-3xl" aria-live="polite">
          {loading && (
            <p role="status" className="text-sm text-slate-600">
              Looking up elections for {zip}…
            </p>
          )}
          {error && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {error.message}
            </div>
          )}
          {data && <Results data={data} zip={zip} />}
        </div>

        {/* Other features */}
        <div className="mx-auto mt-16 max-w-3xl">
          <h2 className="mb-3 text-sm font-medium text-slate-500">More tools</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              to={zip ? `/map?zip=${zip}` : '/map'}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-300"
            >
              <p className="font-semibold text-slate-900">Ballot drop-off map</p>
              <p className="mt-1 text-sm text-slate-600">
                See where you can drop off your ballot near you.
              </p>
              <span className="mt-3 inline-block text-sm font-medium text-blue-700">Open the map</span>
            </Link>
            <Link
              to={zip ? `/candidates?zip=${zip}` : '/candidates'}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-300"
            >
              <p className="font-semibold text-slate-900">Candidate information</p>
              <p className="mt-1 text-sm text-slate-600">
                Read about candidates using government and official sources.
              </p>
              <span className="mt-3 inline-block text-sm font-medium text-blue-700">Browse candidates</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Home