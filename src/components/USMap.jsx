import { useEffect, useRef, useState } from 'react'
import { geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import T from '../context/T'
import { useTranslation } from '../context/useTranslation'
import { STATE_NAMES } from '../lib/sampleSenateResults'

// US state outlines, already projected (Albers USA, with Alaska and Hawaii inset) into a
// 975 × 610 box. Loaded on demand so the boundary data only downloads on this page.
const WIDTH = 975
const HEIGHT = 610
const ABBR_BY_NAME = Object.fromEntries(Object.entries(STATE_NAMES).map(([abbr, name]) => [name, abbr]))

// States too small to click on the map get a labeled box beside the East Coast, like
// printed election maps.
const CALLOUTS = ['VT', 'NH', 'MA', 'RI', 'CT', 'NJ', 'DE', 'MD', 'DC']
const CALLOUT = { x: 918, y: 196, width: 40, height: 20, gap: 6 }
// Nudge a few labels to where the eye expects them.
const LABEL_OFFSETS = { FL: [12, 6], MI: [10, 18], LA: [-8, 0], KY: [4, 3], HI: [10, 8], AK: [0, 6], ID: [0, 15], CA: [-8, 0] }

let shapesPromise
function loadShapes() {
  shapesPromise ??= import('us-atlas/states-albers-10m.json').then(({ default: topology }) => {
    const path = geoPath()
    return feature(topology, topology.objects.states).features.map((state) => {
      const abbr = ABBR_BY_NAME[state.properties.name]
      const [x, y] = path.centroid(state)
      const [dx, dy] = LABEL_OFFSETS[abbr] ?? [0, 0]
      return { abbr, d: path(state), label: [x + dx, y + dy] }
    })
  })
  return shapesPromise
}

const FILL = {
  D: { leading: '#93c5fd', called: '#1d4ed8' },
  R: { leading: '#fca5a5', called: '#b91c1c' },
  O: { leading: '#cbd5e1', called: '#475569' },
}
const NO_RACE = '#f1f5f9'
const WAITING = '#cbd5e1'

function fillFor(race) {
  if (!race) return NO_RACE
  if (race.status === 'waiting') return WAITING
  return FILL[race.leader.party][race.status === 'called' ? 'called' : 'leading']
}

function labelColor(race) {
  if (!race) return '#94a3b8'
  return race.status === 'called' ? '#ffffff' : '#0f172a'
}

const MAP_LEGEND = [
  [FILL.D.called, 'Democrat won'],
  [FILL.D.leading, 'Democrat leading'],
  [FILL.R.called, 'Republican won'],
  [FILL.R.leading, 'Republican leading'],
  [WAITING, 'No votes counted yet'],
  [NO_RACE, 'No Senate race'],
]

function USMap({ racesByState, selected, onSelect }) {
  const [shapes, setShapes] = useState(null)
  const [failed, setFailed] = useState(false)
  const [hover, setHover] = useState(null)
  const wrapper = useRef(null)
  const { translate } = useTranslation(['No Senate race this year', 'Waiting for results', 'counted', 'Loading map…', 'The map could not load.'])

  useEffect(() => {
    let active = true
    loadShapes()
      .then((result) => active && setShapes(result))
      .catch(() => active && setFailed(true))
    return () => {
      active = false
    }
  }, [])

  function describe(abbr) {
    const race = racesByState[abbr]
    if (!race) return `${STATE_NAMES[abbr]}: ${translate('No Senate race this year')}`
    if (!race.leader) return `${race.name}: ${translate('Waiting for results')}`
    return `${race.name}: ${race.leader.name} ${race.leader.percent.toFixed(1)}%`
  }

  function track(abbr, event) {
    const box = wrapper.current?.getBoundingClientRect()
    if (!box) return
    setHover({ abbr, x: event.clientX - box.left, y: event.clientY - box.top, width: box.width })
  }

  // Shared props that make a state (or its callout box) clickable when it has a race.
  function interactive(abbr) {
    if (!racesByState[abbr]) {
      return { onMouseMove: (event) => track(abbr, event), onMouseLeave: () => setHover(null) }
    }
    return {
      role: 'button',
      tabIndex: 0,
      'aria-label': describe(abbr),
      'aria-pressed': selected === abbr,
      className: 'cursor-pointer outline-none transition-opacity hover:opacity-80 focus-visible:opacity-80',
      onClick: () => onSelect(abbr),
      onKeyDown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(abbr)
        }
      },
      onMouseMove: (event) => track(abbr, event),
      onMouseLeave: () => setHover(null),
    }
  }

  if (failed) return <p className="py-16 text-center text-sm text-slate-500">{translate('The map could not load.')}</p>
  if (!shapes) {
    return (
      <div className="flex aspect-[975/610] items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
        {translate('Loading map…')}
      </div>
    )
  }

  // Draw the selected state last so its outline sits on top of its neighbors.
  const ordered = [...shapes].sort((a, b) => (a.abbr === selected) - (b.abbr === selected))
  const hoverRace = hover && racesByState[hover.abbr]

  return (
    <div ref={wrapper} className="relative">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="group" aria-label="US Senate results map">
        {ordered.map((shape) => {
          const isSelected = shape.abbr === selected
          return (
            <path
              key={shape.abbr}
              d={shape.d}
              fill={fillFor(racesByState[shape.abbr])}
              stroke={isSelected ? '#0f172a' : '#ffffff'}
              strokeWidth={isSelected ? 2.5 : 0.75}
              strokeLinejoin="round"
              style={{ transition: 'fill 0.6s ease' }}
              {...interactive(shape.abbr)}
            />
          )
        })}

        {/* State abbreviations on the larger states */}
        <g pointerEvents="none" fontFamily="system-ui, sans-serif" fontSize="11" fontWeight="600" textAnchor="middle">
          {shapes
            .filter((shape) => !CALLOUTS.includes(shape.abbr))
            .map((shape) => (
              <text key={shape.abbr} x={shape.label[0]} y={shape.label[1] + 4} fill={labelColor(racesByState[shape.abbr])}>
                {shape.abbr}
              </text>
            ))}
        </g>

        {/* Small Northeast states */}
        {CALLOUTS.map((abbr, index) => {
          const race = racesByState[abbr]
          const y = CALLOUT.y + index * (CALLOUT.height + CALLOUT.gap)
          const isSelected = abbr === selected
          return (
            <g key={abbr} {...interactive(abbr)}>
              <rect
                x={CALLOUT.x}
                y={y}
                width={CALLOUT.width}
                height={CALLOUT.height}
                rx="3"
                fill={fillFor(race)}
                stroke={isSelected ? '#0f172a' : race ? 'none' : '#e2e8f0'}
                strokeWidth={isSelected ? 2.5 : 1}
                style={{ transition: 'fill 0.6s ease' }}
              />
              <text
                x={CALLOUT.x + CALLOUT.width / 2}
                y={y + CALLOUT.height / 2 + 4}
                textAnchor="middle"
                fontFamily="system-ui, sans-serif"
                fontSize="11"
                fontWeight="600"
                fill={labelColor(race)}
                pointerEvents="none"
              >
                {abbr}
              </text>
            </g>
          )
        })}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-56 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg"
          style={{
            left: Math.min(Math.max(hover.x - 112, 0), hover.width - 224),
            top: hover.y + 16,
          }}
        >
          <p className="font-semibold text-slate-900">{STATE_NAMES[hover.abbr]}</p>
          {!hoverRace ? (
            <p className="mt-1 text-slate-500">{translate('No Senate race this year')}</p>
          ) : !hoverRace.leader ? (
            <p className="mt-1 text-slate-500">{translate('Waiting for results')}</p>
          ) : (
            <>
              <ul className="mt-1.5 space-y-1">
                {hoverRace.candidates.slice(0, 2).map((candidate) => (
                  <li key={candidate.id} className="flex justify-between gap-2">
                    <span className="truncate text-slate-700">
                      {candidate.name} ({candidate.party})
                    </span>
                    <span className="font-semibold tabular-nums text-slate-900">{candidate.percent.toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-slate-500">
                {Math.floor(hoverRace.reporting)}% {translate('counted')}
              </p>
            </>
          )}
        </div>
      )}

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
        {MAP_LEGEND.map(([color, label]) => (
          <li key={label} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border border-slate-200" style={{ backgroundColor: color }} aria-hidden="true" />
            <T>{label}</T>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default USMap
