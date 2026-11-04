import { Link } from 'react-router-dom'
import AddressForm from '../components/AddressForm'
import DemoNotice from '../components/DemoNotice'
import { useElections } from '../lib/useElections'
import { formatDate, todayString } from '../lib/format'
import T from '../context/T'
import { useTranslation } from '../context/useTranslation'

// `today` is the demo date when the backend is in demo mode, so a past election's key dates still show.
function ElectionCard({ election, today = todayString() }) {
  const upcomingDates = (election.milestones ?? []).filter((milestone) => milestone.occursOn >= today)
  const { translate } = useTranslation([
    election.name,
    ...upcomingDates.map((milestone) => milestone.label ?? String(milestone.kind).replace(/_/g, ' ')),
  ])

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-900">{translate(election.name)}</h3>
            {election.type && (
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium capitalize text-blue-700">
                {String(election.type).replace(/_/g, ' ')}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            <T>Election Day</T>: {formatDate(election.electionDay)}
            <span className="text-slate-400"> · </span>
            {election.status === 'confirmed' ? <T>Date confirmed</T> : <T>Date expected</T>}
          </p>
          {election.source?.url && (
            <p className="mt-1 text-xs text-slate-500">
              <T>Source</T>:{' '}
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
            to={`/candidates?election=${encodeURIComponent(election.id)}`}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
              <T>See candidates</T>
          </Link>
          <Link
            to="/map"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
              <T>Drop-off sites</T>
          </Link>
        </div>
      </div>

      {upcomingDates.length > 0 && (
        <details className="mt-3 border-t border-slate-100 pt-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            <T>Key dates</T> ({upcomingDates.length})
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {upcomingDates.map((milestone) => (
              <li key={milestone.id} className="flex justify-between gap-4">
                <span>{translate(milestone.label ?? String(milestone.kind).replace(/_/g, ' '))}</span>
                <span className="shrink-0 text-slate-500">{formatDate(milestone.occursOn)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  )
}

function Results({ data, address }) {
  const elections = data.elections ?? []
  const { translate } = useTranslation(['Elections for'])

  return (
    <div>
      {data.demo && (
        <div className="mb-4">
          <DemoNotice demo={data.demo} />
        </div>
      )}
      <h2 className="text-lg font-semibold text-slate-900">
        {translate('Elections for')} {data.normalizedLocation ?? address}
      </h2>

      {elections.length === 0 ? (
        <p className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <T>We didn't find upcoming elections for this address in our data. That doesn't mean none are scheduled. Check with your county elections office.</T>
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {elections.map((election) => (
            <ElectionCard key={election.id} election={election} today={data.demo?.asOf ?? undefined} />
          ))}
        </ul>
      )}

      {(data.coverage ?? []).length > 0 && (
        <details className="mt-4 text-sm text-slate-600">
          <summary className="cursor-pointer font-medium text-slate-700"><T>What data do we have for this area?</T></summary>
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

function Home({ search, onSearch }) {
  const { address } = search
  const { loading, data, error } = useElections(search)

  return (
    <div className="bg-gradient-to-b from-blue-50 to-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        {/* Election finder */}
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            <T>Find elections in your area</T>
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            <T>Enter your address to see the elections you can vote in.</T>
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-3xl">
          <AddressForm
            key={address}
            id="address"
            initialAddress={address}
            onSubmit={onSearch}
            hint="No account needed. We use your address only to find your elections. Works for any US address. Washington uses official data; other states show sample data."
          />
        </div>

        {/* Results */}
        <div className="mx-auto mt-10 max-w-3xl" aria-live="polite">
          {loading && (
            <p role="status" className="text-sm text-slate-600">
              <T>Looking up elections for your address…</T>
            </p>
          )}
          {error && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {error.message}
            </div>
          )}
          {data && <Results data={data} address={address} />}
        </div>

        {/* Other features */}
        <div className="mx-auto mt-16 max-w-3xl">
          <h2 className="mb-3 text-sm font-medium text-slate-500"><T>More tools</T></h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              to="/map"
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-300"
            >
              <p className="font-semibold text-slate-900"><T>Ballot drop-off map</T></p>
              <p className="mt-1 text-sm text-slate-600">
                <T>See where you can drop off your ballot near you.</T>
              </p>
              <span className="mt-3 inline-block text-sm font-medium text-blue-700"><T>Open the map</T></span>
            </Link>
            <Link
              to="/candidates"
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-300"
            >
              <p className="font-semibold text-slate-900"><T>Candidate information</T></p>
              <p className="mt-1 text-sm text-slate-600">
                <T>Read about candidates using government and official sources.</T>
              </p>
              <span className="mt-3 inline-block text-sm font-medium text-blue-700"><T>Browse candidates</T></span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Home
