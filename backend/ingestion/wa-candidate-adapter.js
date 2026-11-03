import * as cheerio from 'cheerio'

export const VOTE_WA_CANDIDATE_URL = 'https://voter.votewa.gov/CandidateList.aspx'
export const VOTE_WA_GUIDE_API_URL = 'https://voter.votewa.gov/elections'

export const SUPPORTED_CANDIDATE_COUNTIES = [
  { code: '3', externalId: 'wa:county:benton', name: 'Benton County' },
  { code: '11', externalId: 'wa:county:franklin', name: 'Franklin County' },
  { code: '17', externalId: 'wa:county:king', name: 'King County' },
  { code: '31', externalId: 'wa:county:snohomish', name: 'Snohomish County' },
]

function normalize(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function slug(value) {
  return normalize(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function parseCsvRows(csv) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
    } else if (character === '"') {
      quoted = true
    } else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''))
      rows.push(row)
      row = []
      field = ''
    } else {
      field += character
    }
  }

  if (field || row.length > 0) {
    row.push(field.replace(/\r$/, ''))
    rows.push(row)
  }
  return rows
}

function partyName(value) {
  const party = normalize(value)
  if (!party) return null
  return party.toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase())
}

function jurisdictionFor({ districtType, district }, countyExternalId) {
  const type = normalize(districtType).toLowerCase()
  const name = normalize(district)

  if (type === 'congressional') {
    const number = name.match(/district\s+(\d+)/i)?.[1]
    return number ? `wa:congressional:${Number(number)}` : null
  }
  if (type === 'legislative') {
    const number = name.match(/district\s+(\d+)/i)?.[1]
    return number ? `wa:legislative:${Number(number)}` : null
  }
  if (type === 'countywide') return countyExternalId
  if (type === 'county') {
    const county = name.match(/^(.+?)\s+county$/i)?.[1]
    return county ? `wa:county:${slug(county)}` : null
  }
  if (type === 'city/town') {
    const city = name.replace(/^city\s+of\s+/i, '').replace(/^town\s+of\s+/i, '')
    return city ? `wa:city:${slug(city)}` : null
  }
  if (type === 'judicial' && /^supreme court$/i.test(name)) {
    return 'ocd-division/country:us/state:wa'
  }
  return null
}

export async function fetchVoteWaCandidateCsv({ electionId, countyCode, fetchImpl = fetch }) {
  const url = `${VOTE_WA_CANDIDATE_URL}?e=${encodeURIComponent(electionId)}&c=${encodeURIComponent(countyCode)}`
  const headers = { 'user-agent': 'PollPal election data collector/0.3' }
  const page = await fetchImpl(url, { headers, signal: AbortSignal.timeout(20_000) })
  const html = await page.text()
  if (!page.ok) throw new Error(`VoteWA candidate page returned HTTP ${page.status}`)

  const $ = cheerio.load(html)
  const body = new URLSearchParams()
  $('input[type="hidden"][name]').each((_index, input) => {
    body.set($(input).attr('name'), $(input).attr('value') ?? '')
  })
  const exportField = 'ctl00$ContentPlaceHolder1$grdCandidates$ctl00$ctl02$ctl00$ExportToCsvButton'
  body.set(exportField, ' ')

  const cookies = typeof page.headers.getSetCookie === 'function'
    ? page.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
    : ''
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      ...headers,
      accept: 'text/csv',
      'content-type': 'application/x-www-form-urlencoded',
      ...(cookies ? { cookie: cookies } : {}),
    },
    body,
    signal: AbortSignal.timeout(30_000),
  })
  const csv = await response.text()
  if (!response.ok || !response.headers.get('content-type')?.includes('text/csv')) {
    throw new Error(`VoteWA candidate export failed with HTTP ${response.status}`)
  }
  return { csv, html, url, status: response.status, contentType: response.headers.get('content-type') }
}

export function parseVoteWaCandidateGuideLinks(html, { electionId, countyCode }) {
  const $ = cheerio.load(html)
  const links = []

  $('a[href*="genericvoterguide.aspx"][href*="#/candidates/"]').each((_index, anchor) => {
    const href = $(anchor).attr('href') ?? ''
    const match = href.match(/#\/candidates\/(\d+)\/(\d+)/i)
    if (!match) return

    const cells = $(anchor).closest('tr').find('td').map((_cellIndex, cell) => normalize($(cell).text())).get()
    if (cells.length < 6) return

    links.push({
      districtType: cells[0],
      district: cells[1],
      race: cells[2],
      name: normalize($(anchor).text()),
      raceId: match[1],
      ballotId: match[2],
      countyCode: String(countyCode),
      voterGuideUrl: new URL(
        `/genericvoterguide.aspx?e=${encodeURIComponent(electionId)}&c=${encodeURIComponent(countyCode)}#/candidates/${match[1]}/${match[2]}`,
        VOTE_WA_CANDIDATE_URL,
      ).toString(),
    })
  })

  return links
}

function profileKey({ district, race, name }) {
  return [district, race, name].map((value) => normalize(value).toLowerCase()).join('|')
}

export function attachVoteWaCandidateGuideLinks(candidates, links) {
  const linksByCandidate = new Map(links.map((link) => [profileKey(link), link]))
  return candidates.map((candidate) => ({
    ...candidate,
    voterGuide: linksByCandidate.get(profileKey(candidate)) ?? null,
  }))
}

function htmlToText(html) {
  if (!normalize(html)) return null
  const $ = cheerio.load(`<body>${html}</body>`)
  $('br').replaceWith('\n')
  $('p, div, li, h1, h2, h3, h4, strong, b').each((_index, element) => {
    $(element).prepend('\n').append('\n')
  })
  const text = $('body').text()
    .split(/\n+/)
    .map(normalize)
    .filter(Boolean)
    .join('\n')
  return text || null
}

const PROFILE_HEADINGS = [
  ['electedExperience', ['Elected Experience', 'Legal/Judicial Experience']],
  ['professionalExperience', ['Other Professional Experience', 'Professional/Work Experience']],
  ['education', ['Education']],
  ['communityService', ['Community Service']],
  ['statement', ['Statement']],
]

export function parseVoteWaStatementSections(statementHtml) {
  const text = htmlToText(statementHtml)
  const sections = Object.fromEntries(PROFILE_HEADINGS.map(([key]) => [key, null]))
  if (!text) return sections

  const aliases = new Map()
  for (const [key, headings] of PROFILE_HEADINGS) {
    for (const heading of headings) aliases.set(heading.toLowerCase(), key)
  }

  let currentKey = null
  const values = new Map(PROFILE_HEADINGS.map(([key]) => [key, []]))
  for (const line of text.split('\n')) {
    const key = aliases.get(line.replace(/:$/, '').toLowerCase())
    if (key) {
      currentKey = key
    } else if (currentKey) {
      values.get(currentKey).push(line)
    }
  }

  for (const [key, lines] of values) sections[key] = normalize(lines.join('\n')) || null
  if (!Object.values(sections).some(Boolean)) sections.statement = text
  return sections
}

function safeWebsite(value) {
  const website = normalize(value)
  if (!website) return null
  try {
    const url = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

function decodePhoto(value) {
  const encoded = normalize(value).replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '')
  if (!encoded) return null
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('VoteWA candidate photo is not valid base64.')
  const photo = Buffer.from(encoded, 'base64')
  if (photo.length > 5 * 1024 * 1024) throw new Error('VoteWA candidate photo exceeds 5 MB.')
  if (photo.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return { bytes: photo, mimeType: 'image/jpeg' }
  }
  if (photo.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { bytes: photo, mimeType: 'image/png' }
  }
  if (photo.subarray(0, 4).toString('ascii') === 'RIFF' && photo.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { bytes: photo, mimeType: 'image/webp' }
  }
  throw new Error('VoteWA candidate photo has an unsupported image format.')
}

export function parseVoteWaCandidateProfile(payload, voterGuide) {
  const raw = Array.isArray(payload) ? payload[0]?.statement : payload?.statement ?? payload
  if (!raw || typeof raw !== 'object') throw new Error('VoteWA candidate profile response is missing statement data.')
  const sections = parseVoteWaStatementSections(raw.Statement)
  const photo = decodePhoto(raw.Photo)
  const federal = ['fed', 'con'].includes(normalize(raw.RaceJurisdictionTypeID).toLowerCase())

  return {
    ...sections,
    campaignWebsite: safeWebsite(raw.OrgWebsite),
    campaignFinanceUrl: federal
      ? 'https://www.fec.gov/data/'
      : raw.CandidateCode ? `https://www.pdc.wa.gov/sos/rd.aspx?id=${encodeURIComponent(raw.CandidateCode)}` : null,
    photo: photo?.bytes ?? null,
    photoMimeType: photo?.mimeType ?? null,
    submitted: Boolean(photo || Object.values(sections).some(Boolean)),
    voterGuideUrl: voterGuide.voterGuideUrl,
  }
}

export async function fetchVoteWaCandidateProfile({
  electionId,
  voterGuide,
  fetchImpl = fetch,
  apiBaseUrl = VOTE_WA_GUIDE_API_URL,
}) {
  const url = new URL('candidate.ashx', `${apiBaseUrl.replace(/\/$/, '')}/`)
  url.search = new URLSearchParams({
    e: String(electionId),
    r: voterGuide.raceId,
    b: voterGuide.ballotId,
    la: 'en-us',
    c: voterGuide.countyCode,
  })
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json', 'user-agent': 'PollPal election data collector/0.4' },
    signal: AbortSignal.timeout(20_000),
  })
  const body = await response.text()
  if (!response.ok) throw new Error(`VoteWA candidate profile returned HTTP ${response.status}`)
  let payload
  try {
    payload = JSON.parse(body)
  } catch {
    throw new Error('VoteWA candidate profile did not return JSON.')
  }
  return parseVoteWaCandidateProfile(payload, voterGuide)
}

export function parseVoteWaCandidateCsv(csv, { countyExternalId }) {
  const rows = parseCsvRows(csv)
  const header = rows.shift()?.map(normalize) ?? []
  const expected = ['District Type', 'District', 'Race', 'Name', 'Party Preference', 'Status']
  if (!expected.every((name) => header.includes(name))) {
    throw new Error('VoteWA candidate export is missing required columns.')
  }
  const index = Object.fromEntries(header.map((name, position) => [name, position]))

  return rows.map((row) => {
    const status = normalize(row[index.Status]).toLowerCase()
    const districtType = normalize(row[index['District Type']])
    const district = normalize(row[index.District])
    const jurisdictionExternalId = jurisdictionFor({ districtType, district }, countyExternalId)
    return {
      districtType,
      district,
      race: normalize(row[index.Race]),
      name: normalize(row[index.Name]),
      party: partyName(row[index['Party Preference']]),
      filingStatus: status === 'active' ? 'active' : status === 'withdrawn' ? 'withdrawn' : 'other',
      ballotOrder: index['Ballot Order'] === undefined
        ? null
        : Number.parseInt(row[index['Ballot Order']], 10) || null,
      jurisdictionExternalId,
    }
  }).filter((candidate) => (
    candidate.name && candidate.race && candidate.jurisdictionExternalId && candidate.filingStatus === 'active'
  ))
}
