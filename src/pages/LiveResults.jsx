import { useEffect, useMemo, useState } from 'react'
import T from '../context/T'
import USMap from '../components/USMap'
import { useTranslation } from '../context/useTranslation'
import {
  SAMPLE_RACES,
  SEATS_FOR_MAJORITY,
  raceSnapshot,
  senateBalance,
} from '../lib/sampleSenateResults'

const TICK_MS = 4000

const PARTY = {
  D: { text: 'text-blue-700', bar: 'bg-blue-600', leading: 'bg-blue-300 text-blue-950', called: 'bg-blue-700 text-white' },
  R: { text: 'text-red-700', bar: 'bg-red-600', leading: 'bg-red-300 text-red-950', called: 'bg-red-700 text-white' },
  O: { text: 'text-slate-600', bar: 'bg-slate-400', leading: 'bg-slate-300 text-slate-900', called: 'bg-slate-600 text-white' },
}

const number = (value) => value.toLocaleString()
const percent = (value) => `${value.toFixed(1)}%`

// ---------- Balance of power ----------

function BalanceBar({ balance }) {
  const total = balance.D + balance.R + balance.undecided
  const majority = balance.D >= SEATS_FOR_MAJORITY ? 'D' : balance.R >= SEATS_FOR_MAJORITY ? 'R' : null

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-3xl font-bold text-blue-700">{balance.D}</p>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500"><T>Democrats</T></p>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-800">
            {majority ? (
              <span className={PARTY[majority].text}>
                {majority === 'D' ? <T>Democrats win control</T> : <T>Republicans win control</T>}
              </span>
            ) : (
              <T>Balance of power</T>
            )}
          </p>
          <p className="text-xs text-slate-500">
            {SEATS_FOR_MAJORITY} <T>seats for a majority</T> · {balance.undecided} <T>undecided</T>
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-red-700">{balance.R}</p>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500"><T>Republicans</T></p>
        </div>
      </div>
      <div className="relative mt-4 flex h-4 overflow-hidden rounded-full bg-slate-200">
        <div className="bg-blue-600 transition-all duration-700" style={{ width: `${(balance.D / total) * 100}%` }} />
        <div className="flex-1" />
        <div className="bg-red-600 transition-all duration-700" style={{ width: `${(balance.R / total) * 100}%` }} />
        <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-slate-900" aria-hidden="true" />
      </div>
    </section>
  )
}

// ---------- One race ----------

function StatusPill({ race }) {
  if (race.status === 'called') {
    return (
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PARTY[race.leader.party].called}`}>
        ✓ <T>Projected winner</T>
      </span>
    )
  }
  if (race.status === 'waiting') {
    return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"><T>Polls closed, waiting</T></span>
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-600" aria-hidden="true" />
      <T>Counting</T>
    </span>
  )
}

function RaceDetail({ race }) {
  return (
    <section id="race-detail" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500"><T>US Senate</T></p>
          <h2 className="text-xl font-bold text-slate-900">{race.name}</h2>
        </div>
        <StatusPill race={race} />
      </div>

      <ul className="mt-5 space-y-4">
        {race.candidates.map((candidate, index) => (
          <li key={candidate.id}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-semibold text-slate-900">
                {index === 0 && race.status === 'called' && <span className="mr-1">✓</span>}
                {candidate.name}
                {candidate.party !== 'O' && (
                  <span className={`ml-1.5 text-xs font-medium ${PARTY[candidate.party].text}`}>({candidate.party})</span>
                )}
              </p>
              <p className="shrink-0 text-sm font-bold tabular-nums text-slate-900">{percent(candidate.percent)}</p>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full transition-all duration-700 ${PARTY[candidate.party].bar}`} style={{ width: `${candidate.percent}%` }} />
            </div>
            <p className="mt-1 text-xs tabular-nums text-slate-500">
              {number(candidate.votes)} <T>votes</T>
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="flex justify-between text-xs text-slate-600">
          <span><T>Estimated vote counted</T></span>
          <span className="font-semibold tabular-nums text-slate-900">{Math.floor(race.reporting)}%</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-slate-700 transition-all duration-700" style={{ width: `${race.reporting}%` }} />
        </div>
        <p className="mt-2 text-xs tabular-nums text-slate-500">
          {number(race.totalVotes)} <T>total votes counted</T>
        </p>
      </div>
    </section>
  )
}

function RaceCard({ race, selected, onSelect }) {
  const [first, second] = race.candidates
  return (
    <button
      type="button"
      onClick={() => onSelect(race.state)}
      aria-pressed={selected}
      className={`w-full rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 ${
        selected ? 'border-slate-900' : 'border-slate-200'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-slate-900">{race.name}</p>
        <StatusPill race={race} />
      </div>
      {race.status === 'waiting' ? (
        <p className="mt-3 text-sm text-slate-500"><T>No votes counted yet</T></p>
      ) : (
        <>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100">
            {[...race.candidates]
              .sort((a, b) => a.party.localeCompare(b.party))
              .map((candidate) => (
                <div key={candidate.id} className={`transition-all duration-700 ${PARTY[candidate.party].bar}`} style={{ width: `${candidate.percent}%` }} />
              ))}
          </div>
          <p className="mt-2 text-xs text-slate-600">
            <span className={`font-semibold ${PARTY[first.party].text}`}>{first.name}</span> +{race.marginPoints.toFixed(1)} <T>over</T>{' '}
            {second.name} · {Math.floor(race.reporting)}% <T>counted</T>
          </p>
        </>
      )}
    </button>
  )
}

// ---------- Page ----------

function LiveResults() {
  const [tick, setTick] = useState(0)
  const [paused, setPaused] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(() => new Date())
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('all')
  const { translate } = useTranslation(['Pause updates', 'Resume updates', 'Restart', 'All races', 'Still counting', 'Called'])

  const snapshots = useMemo(() => SAMPLE_RACES.map((race) => raceSnapshot(race, tick)), [tick])
  const done = snapshots.every((race) => race.reporting >= 100)

  useEffect(() => {
    if (paused || done) return undefined
    const timer = setInterval(() => {
      setTick((value) => value + 1)
      setUpdatedAt(new Date())
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [paused, done])

  const racesByState = Object.fromEntries(snapshots.map((race) => [race.state, race]))
  const balance = senateBalance(snapshots)
  // Default to the closest race that has votes counted.
  const closest = [...snapshots].filter((race) => race.totalVotes > 0).sort((a, b) => a.marginPoints - b.marginPoints)[0]
  const current = racesByState[selected] ?? closest ?? snapshots[0]

  const visible = snapshots
    .filter((race) => filter === 'all' || (filter === 'called' ? race.status === 'called' : race.status !== 'called'))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="bg-gradient-to-b from-blue-50 to-slate-50">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6 sm:py-14">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-red-700">
              <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                {!paused && !done && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />}
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
              </span>
              {done ? <T>Final</T> : paused ? <T>Paused</T> : <T>Live</T>}
            </p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900"><T>US Senate results</T></h1>
            <p className="mt-1 text-sm text-slate-600">
              <T>Updated</T> {updatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
            </p>
          </div>
          <div className="flex gap-2">
            {!done && (
              <button
                type="button"
                onClick={() => setPaused(!paused)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {translate(paused ? 'Resume updates' : 'Pause updates')}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setTick(0)
                setPaused(false)
                setUpdatedAt(new Date())
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {translate('Restart')}
            </button>
          </div>
        </div>

        <div role="note" className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <span aria-hidden="true" className="text-lg leading-none">⚠</span>
          <p>
            <strong><T>Sample data for demonstration only.</T></strong>{' '}
            <T>These are not real election results. Candidates and vote counts are made up and update on a timer to show how live results would look.</T>
          </p>
        </div>

        <BalanceBar balance={balance} />

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:col-span-2">
            <h2 className="mb-4 text-lg font-semibold text-slate-900"><T>Results map</T></h2>
            <USMap racesByState={racesByState} selected={current.state} onSelect={setSelected} />
          </section>
          <RaceDetail race={current} />
        </div>

        <section>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              <T>Every Senate race</T> ({snapshots.length})
            </h2>
            <div className="flex gap-1 rounded-lg bg-slate-200/70 p-1 text-sm">
              {[
                ['all', 'All races'],
                ['counting', 'Still counting'],
                ['called', 'Called'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={`rounded-md px-3 py-1.5 font-medium ${filter === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {translate(label)}
                </button>
              ))}
            </div>
          </div>
          {visible.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500"><T>No races here yet.</T></p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((race) => (
                <RaceCard
                  key={race.state}
                  race={race}
                  selected={race.state === current.state}
                  onSelect={(state) => {
                    setSelected(state)
                    document.getElementById('race-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default LiveResults
