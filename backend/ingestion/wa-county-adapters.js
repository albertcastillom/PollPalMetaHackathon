import * as cheerio from 'cheerio'

const MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}

const MONTH_PATTERN = Object.keys(MONTHS).join('|')
export const KING_DROP_BOX_GIS_URL = 'https://services.arcgis.com/Ej0PsM5Aw677QF1W/ArcGIS/rest/services/BALLOT_DROPBOX_POINT_2759/FeatureServer/0'

export const WA_COUNTY_ADAPTERS = [
  {
    key: 'king',
    name: 'King County',
    jurisdictionExternalId: 'wa:county:king',
    publisher: 'King County Elections',
    electionUrl: 'https://kingcounty.gov/en/home/dept/elections',
    locationUrl: KING_DROP_BOX_GIS_URL,
    locationParser: 'king_arcgis',
  },
  {
    key: 'snohomish',
    name: 'Snohomish County',
    jurisdictionExternalId: 'wa:county:snohomish',
    publisher: 'Snohomish County Elections',
    electionUrl: 'https://snohomishcountywa.gov/5721/Important-Election-Dates-and-Information',
    ballotUrl: 'https://snohomishcountywa.gov/5722/Candidates-and-Measures-on-the-Ballot',
    locationUrl: 'https://snohomishcountywa.gov/5726/Find-a-Ballot-Drop-Box',
    locationParser: 'snohomish_html',
  },
  {
    key: 'benton',
    name: 'Benton County',
    jurisdictionExternalId: 'wa:county:benton',
    publisher: 'Benton County Elections',
    electionUrl: 'https://www.bentoncountywa.gov/government/elected_officials/auditor/elections/current_election/index.php',
    locationUrl: 'https://www.bentoncountywa.gov/government/elected_officials/auditor/elections/current_election/drop_boxes.php',
    locationParser: 'benton_table',
  },
  {
    key: 'franklin',
    name: 'Franklin County',
    jurisdictionExternalId: 'wa:county:franklin',
    publisher: 'Franklin County Elections',
    electionUrl: 'https://www.franklincountywa.gov/338/Current-Election',
    locationUrl: 'https://www.franklincountywa.gov/215/Ballot-Drop-Box-Locations',
    locationParser: 'franklin_html',
  },
]

export function slug(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function normalize(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function isoDate(month, day, year) {
  return `${year}-${String(MONTHS[month.toLowerCase()]).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function electionType(value) {
  const normalized = value.toLowerCase()
  if (normalized.includes('presidential')) return 'presidential_primary'
  if (normalized.includes('primary')) return 'primary'
  if (normalized.includes('special')) return 'special'
  if (normalized.includes('general')) return 'general'
  return 'other'
}

export function parseCountyElection(html, defaultYear = new Date().getFullYear()) {
  const $ = cheerio.load(html)
  const text = normalize($('main').text() || $('body').text())
  const typeText = text.match(/(Presidential Primary|General|Primary|Special) Election/i)?.[1] ?? 'Election'
  const monthFirst = text.match(new RegExp(`(${MONTH_PATTERN})\\s+(\\d{1,2}),\\s*(20\\d{2})`, 'i'))
  const withoutYear = text.match(new RegExp(`(${MONTH_PATTERN})\\s+(\\d{1,2})\\s+(?:Presidential Primary|General|Primary|Special) Election`, 'i'))

  const dateMatch = monthFirst ?? withoutYear
  if (!dateMatch) throw new Error('County election parser could not find an election date.')

  const year = monthFirst ? Number(dateMatch[3]) : defaultYear
  const electionDay = isoDate(dateMatch[1], Number(dateMatch[2]), year)
  const type = electionType(typeText)
  const displayType = type === 'presidential_primary'
    ? 'Presidential Primary'
    : `${type.charAt(0).toUpperCase()}${type.slice(1)}`

  return {
    electionDay,
    type,
    name: `${year} Washington ${displayType} Election`,
    sourceExcerpt: dateMatch[0],
  }
}

function parseAddressHtml(html, cityNames = []) {
  const withLineBreaks = String(html ?? '').replace(/<br\b[^>]*>/gi, '\n')
  const lines = cheerio.load(withLineBreaks).text().split(/\n+/).map(normalize).filter(Boolean)

  for (let index = 0; index < lines.length - 1; index += 1) {
    const cityMatch = lines[index + 1].match(/^([A-Za-z .'-]+),\s*WA\s*(\d{5})$/i)
    if (!cityMatch) continue
    return {
      address: lines[index],
      city: normalize(cityMatch[1]),
      postalCode: cityMatch[2],
    }
  }

  for (const line of lines) {
    for (const city of cityNames) {
      const marker = new RegExp(`\\s+${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},\\s*WA\\s*(\\d{5})$`, 'i')
      const match = line.match(marker)
      if (!match) continue
      return {
        address: normalize(line.slice(0, match.index)),
        city,
        postalCode: match[1],
      }
    }
  }

  return null
}

function daysBefore(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - Number(days))
  return date.toISOString().slice(0, 10)
}

export function parseKingArcGisLocations(features, electionDay) {
  return features.map((feature) => {
    const properties = feature.properties ?? {}
    const coordinates = feature.geometry?.coordinates
    return {
      name: normalize(properties.NAME).replace(/ Ballot Drop Box$/i, ''),
      type: 'drop_box',
      address: normalize(properties.ADDRESS),
      city: normalize(properties.CITYZIP),
      postalCode: normalize(properties.ZIPCODE),
      description: normalize(properties.DESC_NOTES) || null,
      driveUp: normalize(properties.DRIVEUP).toLowerCase() === 'yes',
      opensOn: null,
      closesOn: electionDay,
      latitude: Array.isArray(coordinates) ? coordinates[1] : Number(properties.LAT) || null,
      longitude: Array.isArray(coordinates) ? coordinates[0] : Number(properties.LON) || null,
    }
  }).filter((location) => location.name && location.address)
}

export function parseSnohomishLocations(html, electionDay) {
  const $ = cheerio.load(html)
  const locations = []

  $('details h3').each((_, heading) => {
    const name = normalize($(heading).text()).replace(/^NEW!\s*-\s*/i, '')
    const paragraph = $(heading).nextAll('p').first()
    const address = parseAddressHtml(paragraph.html())
    if (!name || !address) return

    locations.push({
      name,
      type: 'drop_box',
      ...address,
      description: normalize(paragraph.text()).includes('Drive-up accessible') ? 'Drive-up accessible' : null,
      driveUp: /drive-up accessible/i.test(paragraph.text()),
      opensOn: null,
      closesOn: electionDay,
      latitude: null,
      longitude: null,
    })
  })

  return locations
}

export function parseBentonLocations(html, electionDay) {
  const $ = cheerio.load(html)
  const locations = []

  $('table tr').each((_, row) => {
    const cells = $(row).find('th,td').map((__, cell) => normalize($(cell).text())).get()
    if (cells.length < 6 || /^name$/i.test(cells[0])) return
    const [name, address, city, postalCode, driveThrough, openDays] = cells
    if (!name || !address || !city) return

    locations.push({
      name,
      type: /inside|center/i.test(name) ? 'voting_center' : 'drop_box',
      address,
      city,
      postalCode,
      description: openDays ? `Opens ${openDays} days before Election Day` : null,
      driveUp: /^yes$/i.test(driveThrough),
      opensOn: /^\d+$/.test(openDays) ? daysBefore(electionDay, openDays) : null,
      closesOn: electionDay,
      latitude: null,
      longitude: null,
    })
  })

  return locations
}

export function parseFranklinLocations(html, electionDay) {
  const $ = cheerio.load(html)
  const locations = []
  const pageText = normalize($('main').text() || $('body').text())
  const openingMatch = pageText.match(new RegExp(
    String.raw`starting\s+(${MONTH_PATTERN})\s+(\d{1,2}),\s*(20\d{2})`,
    'i',
  ))
  const opensOn = openingMatch
    ? isoDate(openingMatch[1], Number(openingMatch[2]), Number(openingMatch[3]))
    : null

  $('.fr-view').each((_, block) => {
    const headings = $(block).find('h2,h3').map((__, heading) => normalize($(heading).text())).get()
    const name = headings.find((heading) => /elections division/i.test(heading)) ?? headings[0] ?? ''
    const paragraphHtml = $(block).find('p').map((__, paragraph) => $(paragraph).html()).get().join('<br>')
    const address = parseAddressHtml(paragraphHtml, ['Pasco', 'Connell', 'Mesa', 'Kahlotus'])
    if (!name || !address || /ballot drop box locations|general election/i.test(name)) return

    const text = normalize($(block).text())
    locations.push({
      name,
      type: /election center|elections division/i.test(name) ? 'election_office' : 'drop_box',
      ...address,
      description: text.replace(name, '').replace(`${address.address} ${address.city}, WA ${address.postalCode}`, '').trim() || null,
      driveUp: /drive-up/i.test(text),
      opensOn,
      closesOn: electionDay,
      latitude: null,
      longitude: null,
    })
  })

  return locations
}

export function parseBallotItems(html, baseUrl) {
  const $ = cheerio.load(html)
  const items = []
  const seen = new Set()
  const resourcePattern = /candidate|ballot measure|sample ballot|voters?[’']? (?:guide|pamphlet)|notice of election/i

  $('main a, .content a, #content a').each((_, anchor) => {
    const title = normalize($(anchor).text())
    const href = $(anchor).attr('href')
    if (!title || !href || !resourcePattern.test(title)) return
    const url = new URL(href, baseUrl).toString()
    const key = `${title}|${url}`
    if (seen.has(key)) return
    seen.add(key)
    items.push({ type: 'ballot_resource', title, description: null, url })
  })

  $('h2,h3,h4').each((_, heading) => {
    const title = normalize($(heading).text())
    if (!/(Proposition|Initiative|Referendum|Resolution)(?:\s+No\.)?/i.test(title)) return
    if (/submitted|ballot measures|resolutions$/i.test(title)) return
    const key = `measure|${title}`
    if (seen.has(key)) return
    seen.add(key)
    items.push({ type: 'measure', title, description: normalize($(heading).next('p').text()) || null, url: baseUrl })
  })

  return items
}

export function parseCountyLocations(parser, payload, electionDay) {
  switch (parser) {
    case 'king_arcgis': return parseKingArcGisLocations(payload, electionDay)
    case 'snohomish_html': return parseSnohomishLocations(payload, electionDay)
    case 'benton_table': return parseBentonLocations(payload, electionDay)
    case 'franklin_html': return parseFranklinLocations(payload, electionDay)
    default: throw new Error(`Unsupported county location parser: ${parser}`)
  }
}
