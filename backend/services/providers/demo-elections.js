import { createHash } from 'node:crypto'

// SAMPLE DATA for demos. Builds a believable ballot for any US address outside Washington:
// the 2026 general election with US Senate, Governor, US House and county races, made-up
// candidates with short statements, and sample ballot drop-off sites near the address.
// Which offices are on the ballot is real for 2026; every candidate, statement, date label
// and location is invented and labeled as sample data.

const PUBLISHER = 'PollPal sample data'
const ELECTION_DAY = '2026-11-03'

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

// States with a US Senate race in 2026 (Class 2 seats plus the Ohio and Florida specials).
const SENATE_2026 = new Set([
  'AL', 'AK', 'AR', 'CO', 'DE', 'FL', 'GA', 'ID', 'IL', 'IA', 'KS', 'KY', 'LA', 'ME', 'MA', 'MI', 'MN', 'MS',
  'MT', 'NE', 'NH', 'NJ', 'NM', 'NC', 'OH', 'OK', 'OR', 'RI', 'SC', 'SD', 'TN', 'TX', 'VA', 'WV', 'WY',
])
// States electing a governor in 2026.
const GOVERNOR_2026 = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'FL', 'GA', 'HI', 'ID', 'IL', 'IA', 'KS', 'ME', 'MD', 'MA', 'MI',
  'MN', 'NE', 'NV', 'NH', 'NM', 'NY', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'VT', 'WI', 'WY',
])

const FIRST_NAMES = [
  'Avery', 'Jordan', 'Morgan', 'Riley', 'Casey', 'Taylor', 'Quinn', 'Rowan', 'Harper', 'Elliot', 'Dana',
  'Reese', 'Skyler', 'Emerson', 'Parker', 'Hayden', 'Marlow', 'Sage', 'Logan', 'Blair', 'Camille', 'Theo',
  'Priya', 'Mateo', 'Naomi', 'Darius', 'Lena', 'Omar', 'Grace', 'Isaac',
]
const LAST_NAMES = [
  'Whitfield', 'Okafor', 'Delgado', 'Brennan', 'Lindqvist', 'Moreau', 'Castellano', 'Hargrove', 'Nakamura',
  'Ashby', 'Pemberton', 'Valdez', 'Kowalski', 'Thorne', 'Abernathy', 'Fairbanks', 'Galloway', 'Iverson',
  'Rutledge', 'Sandoval', 'Mercer', 'Holloway', 'Kincaid', 'Lockhart', 'Ramaswamy', 'Osei', 'Lindgren',
]

// Every candidate gets the same statement structure; only the topics differ, so no candidate
// is described more favorably than another.
const PRIORITIES = [
  ['lowering housing costs', 'work with builders and local governments to speed up permits for new homes'],
  ['making child care easier to find and afford', 'expand grants for licensed child care providers'],
  ['supporting small businesses', 'simplify licensing and cut filing fees for new small businesses'],
  ['repairing roads and bridges', 'publish a yearly list of road and bridge repairs with cost and timeline'],
  ['lowering health care costs', 'require clearer price information from hospitals and insurers'],
  ['protecting clean water', 'fund upgrades to aging water and sewer systems'],
  ['public safety', 'fund more training and staffing for emergency responders'],
  ['expanding rural broadband', 'help bring high-speed internet to areas that still lack it'],
  ['careful budgeting', 'post every major spending decision online in plain language'],
  ['supporting veterans', 'shorten wait times for veterans seeking benefits and care'],
  ['job training', 'partner with community colleges on apprenticeship programs'],
  ['helping farmers and ranchers', 'protect water rights and open new markets for local products'],
]
const CAREERS = [
  ['small business owner', 'Owned and operated a family hardware store for 14 years.'],
  ['nurse', 'Registered nurse in emergency and rural clinics for 16 years.'],
  ['teacher', 'Public school teacher and department head for 12 years.'],
  ['engineer', 'Civil engineer working on water and transportation projects for 18 years.'],
  ['attorney', 'Attorney in private practice focused on small businesses and families.'],
  ['farmer', 'Third-generation farmer and co-op board member.'],
  ['firefighter', 'Firefighter and paramedic for 20 years, retired as battalion chief.'],
  ['accountant', 'Certified public accountant serving local governments and nonprofits.'],
  ['veteran', 'U.S. Army veteran and logistics manager.'],
  ['software developer', 'Software developer and founder of a regional technology company.'],
]
const DEGREES = [
  'B.A., Political Science, state university', 'B.S., Nursing', 'M.Ed., Education Leadership',
  'B.S., Civil Engineering', 'J.D., law school; B.A., History', 'B.S., Agricultural Business',
  'A.A.S., Fire Science', 'B.S., Accounting', 'B.A., Economics', 'B.S., Computer Science',
]
const SERVICE = [
  'Volunteer youth sports coach', 'Food bank board member', 'Habitat for Humanity volunteer',
  'Library foundation volunteer', 'Rotary Club member', 'Volunteer firefighter',
  'Neighborhood association president', 'Mentor with a local reading program',
]

const PARTIES_STATEWIDE = ['Democratic', 'Republican', 'Libertarian']
const PARTIES_TWO = ['Democratic', 'Republican']

const LOCATION_TEMPLATES = [
  { type: 'election_office', name: 'Elections Office', miles: 1.2, opensTime: '08:00:00', closesTime: '17:00:00', driveUp: false },
  { type: 'drop_box', name: 'Public Library Drop Box', miles: 0.7, driveUp: false },
  { type: 'drop_box', name: 'City Hall Drop Box', miles: 1.8, driveUp: true },
  { type: 'drop_box', name: 'Community Center Drop Box', miles: 2.6, driveUp: true },
  { type: 'drop_box', name: 'Shopping Plaza Drop Box', miles: 3.9, driveUp: true },
  { type: 'drop_box', name: 'Park & Ride Drop Box', miles: 5.4, driveUp: true },
  { type: 'voting_center', name: 'High School Voting Center', miles: 2.2, opensTime: '07:00:00', closesTime: '20:00:00', driveUp: false },
]

function hash(text) {
  return createHash('sha256').update(text).digest()
}

// Stable RFC 4122-shaped (version 5 style) UUID, so the same address always produces the
// same IDs and the existing UUID-checked routes accept them.
function stableUuid(text) {
  const bytes = hash(`pollpal-demo:${text}`)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function seeded(text) {
  let value = hash(text).readUInt32LE(0)
  return () => {
    value = (value + 0x6d2b79f5) | 0
    let t = Math.imul(value ^ (value >>> 15), 1 | value)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickDistinct(random, list, count) {
  const pool = [...list]
  const picked = []
  while (picked.length < count && pool.length > 0) picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0])
  return picked
}

function joinList(items) {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

function buildCandidate({ random, id, name, party, office, area }) {
  const [career, careerText] = CAREERS[Math.floor(random() * CAREERS.length)]
  const priorities = pickDistinct(random, PRIORITIES, 3)
  const statement = [
    `I am running for ${office} because families in ${area} deserve leaders who listen and get results.`,
    `As a ${career}, I have spent my career solving practical problems.`,
    `My top priorities are ${joinList(priorities.map(([topic]) => topic))}.`,
    `If elected, I will ${priorities[0][1]}, and I will ${priorities[1][1]}.`,
    'I will hold regular town halls and answer every message from constituents.',
  ].join(' ')

  return {
    id,
    externalId: `demo:${id}`,
    name,
    party,
    ballotOrder: null,
    filingStatus: 'active',
    profileUrl: null,
    profile: {
      voterGuideUrl: null,
      electedExperience: random() < 0.5 ? 'None.' : `Served two terms on a local ${random() < 0.5 ? 'city council' : 'school board'}.`,
      professionalExperience: careerText,
      education: DEGREES[Math.floor(random() * DEGREES.length)],
      communityService: SERVICE[Math.floor(random() * SERVICE.length)],
      statement,
      campaignWebsite: null,
      campaignFinanceUrl: null,
      photoUrl: null,
      submitted: true,
      attribution: `${PUBLISHER}. This candidate and statement are made up for a demo.`,
      disclaimer: 'Sample candidate for demonstration only.',
      verifiedAt: null,
    },
    verifiedAt: null,
  }
}

function milestones(electionKey, timezone) {
  return [
    ['ballots_mailed', 'Mail ballots sent and early voting begins (sample date)', '2026-10-14'],
    ['registration_deadline', 'Registration deadline for online and mail registration (sample date)', '2026-10-19'],
    ['absentee_request_deadline', 'Last day to request a mail ballot (sample date)', '2026-10-27'],
    ['early_voting_ends', 'Early in-person voting ends (sample date)', '2026-11-01'],
    ['election_day', 'Election Day: polls close and mail ballots must be returned (sample date)', ELECTION_DAY],
  ].map(([kind, label, occursOn]) => ({
    id: stableUuid(`${electionKey}:milestone:${kind}`),
    kind,
    label,
    occursOn,
    occursAt: null,
    localTime: kind === 'election_day' ? '20:00:00' : null,
    datePrecision: 'day',
    timezone,
    certainty: 'sample',
    sourceExcerpt: null,
    verifiedAt: null,
  }))
}

function offsetCoordinates({ latitude, longitude }, miles, angle) {
  const dLat = (miles * Math.cos(angle)) / 69
  const dLon = (miles * Math.sin(angle)) / (69 * Math.cos((latitude * Math.PI) / 180))
  return { latitude: latitude + dLat, longitude: longitude + dLon }
}

function districtLabel(state, district) {
  if (state === 'DC') return 'Delegate to the U.S. House of Representatives'
  if (!district || district.atLarge || district.number == null) return `U.S. Representative, ${STATE_NAMES[state]} At-Large`
  return `U.S. Representative, ${STATE_NAMES[state]} District ${district.number}`
}

export function createDemoElectionProvider({ maxRemembered = 500 } = {}) {
  // Contests handed out recently, so the comparison endpoint can look them up by ID.
  const remembered = new Map()

  function remember(contest) {
    if (remembered.has(contest.id)) remembered.delete(contest.id)
    remembered.set(contest.id, contest)
    if (remembered.size > maxRemembered) remembered.delete(remembered.keys().next().value)
  }

  return {
    name: 'pollpal_demo',

    findUpcoming({ geocoded, asOf }) {
      const state = geocoded.state
      const stateName = STATE_NAMES[state] ?? geocoded.stateName ?? state
      const countyName = geocoded.county?.name ?? null
      const city = geocoded.city ?? null
      const area = city ?? countyName ?? stateName
      const coordinates = { latitude: geocoded.latitude, longitude: geocoded.longitude }
      const source = { publisher: PUBLISHER, url: null }
      const electionKey = `${state}:${ELECTION_DAY}`
      const electionId = stableUuid(`election:${electionKey}`)
      const timezone = null
      const usedNames = new Set()

      function uniqueName(random) {
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const name = `${FIRST_NAMES[Math.floor(random() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(random() * LAST_NAMES.length)]}`
          if (!usedNames.has(name)) {
            usedNames.add(name)
            return name
          }
        }
        return `Candidate ${usedNames.size + 1}`
      }

      const races = []
      if (state === 'DC') {
        races.push({ key: 'mayor', title: 'Mayor of the District of Columbia', districtType: 'city/town', district: 'District of Columbia', parties: PARTIES_TWO, office: 'Mayor' })
      }
      if (SENATE_2026.has(state)) {
        races.push({ key: 'senate', title: 'U.S. Senator', districtType: 'federal', district: stateName, parties: PARTIES_STATEWIDE, office: 'the U.S. Senate' })
      }
      if (GOVERNOR_2026.has(state)) {
        races.push({ key: 'governor', title: 'Governor', districtType: 'statewide', district: stateName, parties: PARTIES_STATEWIDE, office: 'Governor' })
      }
      const house = districtLabel(state, geocoded.congressionalDistrict)
      races.push({
        key: `house:${geocoded.congressionalDistrict?.number ?? 'at-large'}`,
        title: house.startsWith('Delegate') ? house : 'U.S. Representative',
        districtType: 'congressional',
        district: house,
        parties: PARTIES_TWO,
        office: 'Congress',
      })
      if (countyName && state !== 'DC') {
        races.push({
          key: `county:${geocoded.county.fips}`,
          title: `${countyName} Commissioner, Position 1`,
          districtType: 'county',
          district: countyName,
          parties: PARTIES_TWO,
          office: `${countyName} Commissioner`,
          scope: geocoded.county.fips,
        })
      }

      const contests = races.map((race) => {
        // Statewide races depend only on the state, so everyone in the state sees the same
        // candidates; district and county races depend on that district or county.
        const contestKey = `${electionKey}:${race.key}`
        const random = seeded(contestKey)
        const id = stableUuid(`contest:${contestKey}`)
        const candidates = race.parties.map((party, index) => buildCandidate({
          random,
          id: stableUuid(`candidate:${contestKey}:${index}`),
          name: uniqueName(random),
          party,
          office: race.office,
          area: race.districtType === 'county' || race.districtType === 'congressional' ? area : stateName,
        }))

        const contest = {
          id,
          externalId: `demo:${contestKey}`,
          electionId,
          type: 'candidate_race',
          title: race.title,
          description: race.district,
          url: null,
          metadata: { districtType: race.districtType, district: race.district, sample: true },
          candidates,
          source,
          verifiedAt: null,
        }
        remember({
          id,
          title: contest.title,
          description: contest.description,
          url: null,
          metadata: contest.metadata,
          candidates: candidates.map(({ id: candidateId, name, party, profile }) => ({ id: candidateId, name, party, profile })),
          notices: {
            candidateStatement: 'Sample statement written for this demo. This candidate is not real.',
            officialFiling: 'Sample party preference for this demo.',
            aiSummary: 'Short summaries are written by AI (Muse Spark) only from each sample candidate\'s statement, and each one is checked against the exact quotes shown. They do not rank or recommend anyone.',
          },
        })
        return contest
      })

      if (countyName && state !== 'DC') {
        contests.push({
          id: stableUuid(`measure:${electionKey}:${geocoded.county.fips}`),
          externalId: `demo:measure:${geocoded.county.fips}`,
          electionId,
          type: 'measure',
          title: `${countyName} Proposition 1 (sample)`,
          description: 'Sample measure: a 10-year property tax levy to extend public library hours and fund repairs to library buildings.',
          url: null,
          metadata: { districtType: 'county', district: countyName, sample: true },
          candidates: [],
          source,
          verifiedAt: null,
        })
      }

      const placeRandom = seeded(`${geocoded.normalizedAddress}:locations`)
      const baseAngle = placeRandom() * Math.PI * 2
      const prefix = city ?? (countyName ? countyName.replace(/ (County|Parish|Borough|Census Area|Municipality)$/i, '') : stateName)
      const votingLocations = LOCATION_TEMPLATES.map((template, index) => {
        const angle = baseAngle + index * 2.4 + placeRandom() * 0.6
        const name = template.type === 'election_office'
          ? `${countyName ?? stateName} Elections Office (sample)`
          : `${prefix} ${template.name} (sample)`
        return {
          id: stableUuid(`location:${geocoded.normalizedAddress}:${index}`),
          externalId: null,
          electionId,
          type: template.type,
          name,
          address: 'Sample location, not a real ballot drop-off site',
          city: city ?? countyName ?? stateName,
          postalCode: null,
          description: template.type === 'drop_box'
            ? 'Sample 24-hour ballot drop box for this demo.'
            : 'Sample location for this demo.',
          driveUp: template.driveUp,
          opensOn: '2026-10-14',
          closesOn: ELECTION_DAY,
          opensTime: template.opensTime ?? null,
          closesTime: template.closesTime ?? '20:00:00',
          timezone,
          coordinates: offsetCoordinates(coordinates, template.miles * (0.8 + placeRandom() * 0.4), angle),
          source,
          verifiedAt: null,
        }
      })

      return {
        provider: this.name,
        normalizedLocation: geocoded.normalizedAddress,
        coordinates,
        jurisdictions: [
          { id: `demo:state:${state}`, name: stateName, type: 'state', verifiedAt: null },
          ...(geocoded.county ? [{ id: `demo:county:${geocoded.county.fips}`, name: countyName, type: 'county', verifiedAt: null }] : []),
        ],
        elections: [{
          id: electionId,
          externalId: `demo:${electionKey}`,
          name: `${stateName} 2026 General Election`,
          type: 'general',
          electionDay: ELECTION_DAY,
          status: 'confirmed',
          timezone,
          verifiedAt: null,
          source,
          milestones: milestones(electionKey, timezone),
        }],
        votingLocations,
        contests,
        coverage: [{
          component: 'sample_data',
          status: 'sample',
          notes: `PollPal has official data for Washington only. Everything shown for ${stateName} is sample data for a demo.`,
          verifiedAt: null,
          jurisdictionId: `demo:state:${state}`,
        }],
        demo: {
          sample: true,
          asOf,
          notice: `Sample data. PollPal's official data covers Washington only, so the candidates, dates and drop-off sites shown for ${stateName} are made up for this demo. The offices on the ballot match the real 2026 election.`,
        },
      }
    },

    findContestForComparison(contestId) {
      return remembered.get(contestId) ?? null
    },
  }
}
