import * as cheerio from 'cheerio'

export const VOTE_WA_CANDIDATE_URL = 'https://voter.votewa.gov/CandidateList.aspx'

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
  return { csv, url, status: response.status, contentType: response.headers.get('content-type') }
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
