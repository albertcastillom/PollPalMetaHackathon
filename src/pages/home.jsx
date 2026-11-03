import { Link } from 'react-router-dom'

const sampleElections = [
  { name: 'General Election', level: 'Federal & State', date: 'Date to be shown', type: 'General' },
  { name: 'County Commissioner Race', level: 'County', date: 'Date to be shown', type: 'Local' },
  { name: 'School Board Election', level: 'Local', date: 'Date to be shown', type: 'Local' },
]

function HomePage() {
  return (
    <div className="bg-gradient-to-b from-blue-50 to-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        {/* Election finder */}
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Find elections in your area
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Enter your address or ZIP code to see the elections you can vote in.
          </p>
        </div>

        <form
          onSubmit={(e) => e.preventDefault()}
          className="mx-auto mt-10 max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
        >
          <label htmlFor="address" className="text-sm font-semibold text-slate-800">
            Address or ZIP code
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input
              id="address"
              type="text"
              placeholder="e.g. 123 Main Street or 98001"
              className="w-full flex-1 rounded-lg border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
            <button
              type="submit"
              className="rounded-lg bg-blue-700 px-6 py-3 font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
            >
              Find elections
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            No account needed. We only use your address to show elections for your area.
          </p>
        </form>

        {/* Example results */}
        <div className="mx-auto mt-10 max-w-3xl">
          <h2 className="mb-3 text-sm font-medium text-slate-500">Example results</h2>
          <ul className="space-y-3">
            {sampleElections.map((election) => (
              <li
                key={election.name}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900">{election.name}</p>
                    <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                      {election.type}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">
                    {election.level} · {election.date}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    to="/candidates"
                    className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
                  >
                    See candidates
                  </Link>
                  <Link
                    to="/map"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Drop-off sites
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Other features */}
        <div className="mx-auto mt-16 max-w-3xl">
          <h2 className="mb-3 text-sm font-medium text-slate-500">More tools</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              to="/map"
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-300"
            >
              <p className="font-semibold text-slate-900">Ballot drop-off map</p>
              <p className="mt-1 text-sm text-slate-600">
                See where you can drop off your ballot near you.
              </p>
              <span className="mt-3 inline-block text-sm font-medium text-blue-700">Open the map</span>
            </Link>
            <Link
              to="/candidates"
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

export default HomePage