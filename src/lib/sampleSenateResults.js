// SAMPLE DATA for the Live Results demo. None of these numbers or candidates are real.
// The states listed are the ones with a US Senate race in 2026 (the regular Class 2
// seats plus the Ohio and Florida special elections). Candidate names are invented,
// and the vote counts are simulated so the page looks like an election night count.

export const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
}

// Seats not on the ballot this year, so the balance-of-power bar adds up to 100.
export const SEATS_NOT_UP = { D: 34, R: 31 }
export const SEATS_FOR_MAJORITY = 51

// Sample races: [state, made-up lean toward D in points, expected total votes in thousands].
const RACES = [
  ['AL', -25, 1450], ['AK', -10, 260], ['AR', -30, 900], ['CO', 12, 2500], ['DE', 18, 400],
  ['FL', -10, 7600], ['GA', 1, 3900], ['ID', -35, 600], ['IL', 15, 4100], ['IA', -12, 1250],
  ['KS', -18, 1000], ['KY', -28, 1500], ['LA', -22, 1400], ['ME', -2, 700], ['MA', 30, 2500],
  ['MI', 3, 4300], ['MN', 8, 2500], ['MS', -18, 850], ['MT', -15, 500], ['NE', -15, 700],
  ['NH', 6, 620], ['NJ', 10, 3200], ['NM', 10, 720], ['NC', -1, 3800], ['OH', -7, 4300],
  ['OK', -32, 1150], ['OR', 14, 1900], ['RI', 22, 380], ['SC', -18, 1700], ['SD', -30, 350],
  ['TN', -28, 1800], ['TX', -8, 8000], ['VA', 8, 3100], ['WV', -38, 500], ['WY', -45, 200],
]

const FIRST_NAMES = [
  'Avery', 'Jordan', 'Morgan', 'Riley', 'Casey', 'Taylor', 'Quinn', 'Rowan', 'Harper', 'Elliot',
  'Dana', 'Reese', 'Skyler', 'Emerson', 'Parker', 'Hayden', 'Marlow', 'Sage', 'Logan', 'Blair',
]
const LAST_NAMES = [
  'Whitfield', 'Okafor', 'Delgado', 'Brennan', 'Lindqvist', 'Moreau', 'Castellano', 'Hargrove',
  'Nakamura', 'Ashby', 'Pemberton', 'Valdez', 'Kowalski', 'Thorne', 'Abernathy', 'Fairbanks',
  'Galloway', 'Iverson', 'Rutledge', 'Sandoval', 'Mercer', 'Holloway', 'Kincaid', 'Lockhart',
]

// Small seeded random number generator so every visitor sees the same sample race.
function seeded(seed) {
  let value = seed
  return () => {
    value = (value + 0x6d2b79f5) | 0
    let t = Math.imul(value ^ (value >>> 15), 1 | value)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedFor(text) {
  return [...text].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) | 0, 7)
}

function buildRace([state, lean, thousands], index) {
  const random = seeded(seedFor(state))
  const pick = (list, offset) => list[(Math.floor(random() * list.length) + offset) % list.length]
  const otherShare = 0.015 + random() * 0.025
  const margin = (lean + (random() - 0.5) * 8) / 100
  const dShare = (1 - otherShare + margin) / 2

  return {
    state,
    name: STATE_NAMES[state],
    expectedVotes: thousands * 1000,
    // Where the count starts when the page loads, and how fast it moves (percent per tick).
    startReporting: Math.max(0, Math.floor(random() * 55) - 12),
    speed: 0.6 + random() * 1.4,
    // Early returns lean one way and drift toward the final result as more votes come in.
    earlySkew: (random() - 0.5) * 0.12,
    candidates: [
      { id: 'D', party: 'D', partyName: 'Democratic', name: `${pick(FIRST_NAMES, index)} ${pick(LAST_NAMES, index)}`, finalShare: dShare },
      { id: 'R', party: 'R', partyName: 'Republican', name: `${pick(FIRST_NAMES, index + 7)} ${pick(LAST_NAMES, index + 11)}`, finalShare: 1 - otherShare - dShare },
      { id: 'O', party: 'O', partyName: 'Other', name: 'Other candidates', finalShare: otherShare },
    ],
  }
}

export const SAMPLE_RACES = RACES.map(buildRace)

// The count `tick` steps after the page loaded (one tick every few seconds).
export function raceSnapshot(race, tick) {
  const reporting = Math.min(100, race.startReporting + race.speed * tick)
  const remaining = 1 - reporting / 100
  const skew = race.earlySkew * remaining
  const counted = Math.round(race.expectedVotes * (reporting / 100))

  const candidates = race.candidates.map((candidate) => {
    const share = candidate.party === 'D' ? candidate.finalShare + skew : candidate.party === 'R' ? candidate.finalShare - skew : candidate.finalShare
    return { ...candidate, votes: Math.round(counted * share) }
  })
  const totalVotes = candidates.reduce((sum, candidate) => sum + candidate.votes, 0)
  const withPercent = candidates
    .map((candidate) => ({ ...candidate, percent: totalVotes ? (candidate.votes / totalVotes) * 100 : 0 }))
    .sort((a, b) => b.votes - a.votes)

  const [leader, runnerUp] = withPercent
  const marginPoints = totalVotes ? leader.percent - runnerUp.percent : 0
  // A sample "race call": a big lead with enough votes in, or the count is essentially done.
  const called = totalVotes > 0 && ((reporting >= 30 && marginPoints >= 15) || (reporting >= 60 && marginPoints >= 6) || reporting >= 99)

  return {
    ...race,
    reporting,
    totalVotes,
    candidates: withPercent,
    leader: totalVotes ? leader : null,
    marginPoints,
    status: totalVotes === 0 ? 'waiting' : called ? 'called' : 'counting',
  }
}

export function senateBalance(snapshots) {
  const won = { D: SEATS_NOT_UP.D, R: SEATS_NOT_UP.R }
  let undecided = 0
  for (const race of snapshots) {
    if (race.status === 'called' && won[race.leader.party] !== undefined) won[race.leader.party] += 1
    else undecided += 1
  }
  return { ...won, undecided }
}
