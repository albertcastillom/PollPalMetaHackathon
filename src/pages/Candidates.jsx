const candidates = [
  { name: 'Candidate Name', office: 'Office', party: 'Party', sources: ['State election office', 'FEC filings'] },
  { name: 'Candidate Name', office: 'Office', party: 'Party', sources: ['State election office', 'County clerk'] },
  { name: 'Candidate Name', office: 'Office', party: 'Party', sources: ['State election office', 'FEC filings'] },
]

function CandidatesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Candidate information
          </h1>
          <p className="mt-2 text-slate-600">
            Information pulled from government and official sources, so you can see where each detail
            comes from.
          </p>
        </div>
        <div>
          <label htmlFor="election-select" className="mb-1 block text-sm font-semibold text-slate-800">
            Election
          </label>
          <select
            id="election-select"
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 sm:w-64"
            defaultValue="General Election"
          >
            <option>General Election</option>
            <option>County Commissioner Race</option>
            <option>School Board Election</option>
          </select>
        </div>
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {candidates.map((c, i) => (
          <article key={i} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-200 text-slate-400">
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
                  <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5z" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">{c.name}</h2>
                <p className="text-sm text-slate-500">
                  {c.office} · {c.party}
                </p>
              </div>
            </div>

            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="font-medium text-slate-700">Background</dt>
                <dd className="mt-2 h-3 w-full rounded bg-slate-200" />
                <dd className="mt-1.5 h-3 w-2/3 rounded bg-slate-200" />
              </div>
              <div>
                <dt className="font-medium text-slate-700">Positions</dt>
                <dd className="mt-2 h-3 w-full rounded bg-slate-200" />
                <dd className="mt-1.5 h-3 w-1/2 rounded bg-slate-200" />
              </div>
            </dl>

            <div className="mt-5 flex flex-wrap gap-2">
              {c.sources.map((s) => (
                <span key={s} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                  {s}
                </span>
              ))}
            </div>
            <button className="mt-5 w-full rounded-lg border border-slate-300 bg-white py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              View full profile
            </button>
          </article>
        ))}
      </div>
    </div>
  )
}

export default CandidatesPage