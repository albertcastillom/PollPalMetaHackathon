import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import AddressForm from '../components/AddressForm'
import { useElections } from '../lib/useElections'
import { formatDate } from '../lib/format'
import T from '../context/T'
import { useTranslation } from '../context/useTranslation'

// Order races from the widest district to the narrowest, the way a ballot reads.
const DISTRICT_ORDER = ['federal', 'statewide', 'state', 'judicial', 'congressional', 'legislative', 'county', 'countywide', 'city/town']

function districtRank(contest) {
  const type = String(contest.metadata?.districtType ?? '').toLowerCase()
  const index = DISTRICT_ORDER.indexOf(type)
  return index === -1 ? DISTRICT_ORDER.length : index
}

function initials(name) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function checkedOn(value) {
  if (!value) return null
  return formatDate(String(value).slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' })
}

function CandidateCard({ candidate }) {
  const partyText = candidate.party ? `Prefers ${candidate.party} Party` : 'No party preference listed'
  const { translate } = useTranslation([partyText])
  return (
    <li className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div
        aria-hidden="true"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600"
      >
        {initials(candidate.name)}
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-slate-900">{candidate.name}</p>
        <p className="text-sm text-slate-500">
          {translate(partyText)}
        </p>
        {candidate.profileUrl && (
          <a
            href={candidate.profileUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-xs font-medium text-blue-700 hover:underline"
          >
            <T>View profile</T>
          </a>
        )}
      </div>
    </li>
  )
}

function RaceSection({ contest }) {
  const candidates = contest.candidates ?? []
  const district = contest.metadata?.district ?? contest.description
  const { translate } = useTranslation([contest.title, district].filter(Boolean))

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{translate(contest.title)}</h3>
          {district && <p className="text-sm text-slate-600">{translate(district)}</p>}
        </div>
        <p className="text-xs text-slate-500">
          {candidates.length} {candidates.length === 1 ? <T>candidate</T> : <T>candidates</T>}
        </p>
      </div>

      {candidates.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600"><T>No active candidates are listed for this race.</T></p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {candidates.map((candidate) => (
            <CandidateCard key={candidate.id} candidate={candidate} />
          ))}
        </ul>
      )}

      {(contest.url || contest.source?.url) && (
        <p className="mt-4 text-xs text-slate-500">
          <T>Source</T>:{' '}
          <a
            href={contest.url ?? contest.source.url}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-blue-700 hover:underline"
          >
            {contest.source?.publisher ?? 'Official source'}
          </a>
          {checkedOn(contest.verifiedAt) && <> · checked {checkedOn(contest.verifiedAt)}</>}
        </p>
      )}
    </section>
  )
}

function OtherBallotItems({ measures, resources }) {
  if (measures.length === 0 && resources.length === 0) return null

  return <OtherBallotItemsContent measures={measures} resources={resources} />
}

function OtherBallotItemsContent({ measures, resources }) {
  const { translate } = useTranslation([
    ...measures.flatMap((measure) => [measure.title, measure.description]),
    ...resources.flatMap((resource) => [resource.title, resource.description]),
  ].filter(Boolean))

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {measures.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-900"><T>Measures</T></h2>
          <ul className="mt-3 space-y-3">
            {measures.map((measure) => (
              <li key={measure.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="font-medium text-slate-900">{translate(measure.title)}</p>
                {measure.description && <p className="mt-1 text-sm text-slate-600">{translate(measure.description)}</p>}
                {measure.url && (
                  <a
                    href={measure.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs font-medium text-blue-700 hover:underline"
                  >
                    <T>Read official text</T>
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {resources.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-900"><T>Official ballot resources</T></h2>
          <ul className="mt-3 space-y-3">
            {resources.map((resource) => (
              <li key={resource.id}>
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-blue-300"
                >
                  <span className="font-medium text-blue-700">{translate(resource.title)}</span>
                  {resource.description && (
                    <span className="mt-1 block text-sm text-slate-600">{translate(resource.description)}</span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function CandidatesPage({ search, onSearch }) {
  const { address } = search
  const { loading, data, error } = useElections(search)
  const [searchParams, setSearchParams] = useSearchParams()

  const elections = useMemo(() => data?.elections ?? [], [data])
  const contests = useMemo(() => data?.contests ?? [], [data])

  // Use the election chosen on the Home page (?election=<id>) when it belongs to this address.
  // Otherwise default to the first election that has races, then to the first election.
  const requestedId = searchParams.get('election')
  const selectedElection =
    elections.find((election) => election.id === requestedId) ??
    elections.find((election) => contests.some((contest) => contest.electionId === election.id)) ??
    elections[0] ??
    null

  const { races, measures, resources } = useMemo(() => {
    const forElection = contests.filter((contest) => contest.electionId === selectedElection?.id)
    return {
      races: forElection
        .filter((contest) => contest.type === 'candidate_race')
        .sort((a, b) => districtRank(a) - districtRank(b) || a.title.localeCompare(b.title)),
      measures: forElection.filter((contest) => contest.type === 'measure'),
      resources: forElection.filter((contest) => contest.type === 'ballot_resource' && contest.url),
    }
  }, [contests, selectedElection])

  const contestsCoverage = (data?.coverage ?? []).filter((item) => item.component === 'contests')
  const isPartial = contestsCoverage.length === 0 || contestsCoverage.some((item) => item.status !== 'complete')
  const { translate } = useTranslation([
    'Candidate information',
    'The candidates on your ballot, from the Washington Secretary of State\'s official candidate list.',
    'Election',
    ...elections.map((election) => election.name),
    selectedElection?.name,
  ].filter(Boolean))

  const selectElection = (id) => {
    const next = new URLSearchParams(searchParams)
    next.set('election', id)
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{translate('Candidate information')}</h1>
        <p className="mt-2 text-slate-600">
          {translate("The candidates on your ballot, from the Washington Secretary of State's official candidate list.")}
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="max-w-xl flex-1">
          <AddressForm
            key={address}
            id="candidates-address"
            initialAddress={address}
            buttonLabel="Find candidates"
            onSubmit={onSearch}
            hint="Currently covers Washington state."
          />
        </div>

        {elections.length > 0 && (
          <div>
            <label htmlFor="election-select" className="mb-1 block text-sm font-semibold text-slate-800">
              {translate('Election')}
            </label>
            <select
              id="election-select"
              value={selectedElection?.id ?? ''}
              onChange={(event) => selectElection(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 lg:w-80"
            >
              {elections.map((election) => (
                <option key={election.id} value={election.id}>
                  {translate(election.name)} ({formatDate(election.electionDay, { month: 'short', day: 'numeric', year: 'numeric' })})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="mt-8 space-y-6" aria-live="polite">
        {!address && (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            <T>Enter your address to see the candidates on your ballot.</T>
          </p>
        )}

        {loading && (
          <p role="status" className="text-sm text-slate-600">
            <T>Looking up the races on your ballot…</T>
          </p>
        )}

        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error.message}
          </div>
        )}

        {data && elections.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            <T>We didn't find upcoming elections for this address in our data. Check with your county elections office.</T>
          </p>
        )}

        {data && selectedElection && (
          <>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">{translate(selectedElection.name)}</h2>
              <p className="text-sm text-slate-600">
                <T>Races for</T> {data.normalizedLocation ?? address} · <T>Election Day</T> {formatDate(selectedElection.electionDay)}
              </p>
            </div>

            {isPartial && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <T>This list may not include every race on your ballot. Statewide, congressional, legislative, county and city races are covered; school, fire, port and other local districts are not yet included. Your official ballot and voter pamphlet are the final word.</T>
              </div>
            )}

            {races.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
                <T>We don't have candidate information for this election at your address yet.</T>
              </p>
            ) : (
              races.map((contest) => <RaceSection key={contest.id} contest={contest} />)
            )}

            <OtherBallotItems measures={measures} resources={resources} />
          </>
        )}
      </div>
    </div>
  )
}

export default CandidatesPage
