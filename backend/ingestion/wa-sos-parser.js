import * as cheerio from 'cheerio'

const MONTHS = new Map([
  ['january', 1], ['february', 2], ['march', 3], ['april', 4],
  ['may', 5], ['june', 6], ['july', 7], ['august', 8],
  ['september', 9], ['october', 10], ['november', 11], ['december', 12],
])

function parseDate(text, year) {
  const match = text.trim().toLowerCase().match(/^([a-z]+)\s+(\d{1,2})/)
  if (!match || !MONTHS.has(match[1])) return null
  const month = String(MONTHS.get(match[1])).padStart(2, '0')
  const day = match[2].padStart(2, '0')
  return `${year}-${month}-${day}`
}

function electionType(heading) {
  const value = heading.toLowerCase()
  if (value.includes('presidential primary')) return 'presidential_primary'
  if (value.includes('special')) return 'special'
  if (value.includes('primary')) return 'primary'
  if (value.includes('general')) return 'general'
  return 'other'
}

function milestoneKind(event) {
  const value = event.toLowerCase()
  if (value.includes('18-day voting period') || value.includes('ballots are mailed')) return 'voting_period_start'
  if (value.includes('online and mail registrations')) return 'registration_online_mail_deadline'
  if (value.includes('registration') && value.includes('in person')) return 'registration_in_person_deadline'
  if (value.includes('deposit your ballot') || value.includes('return voted ballot')) return 'ballot_return_deadline'
  if (value.includes('election') && !value.includes('deadline')) return 'election_day'
  return null
}

function localTime(kind) {
  if (!['registration_in_person_deadline', 'ballot_return_deadline', 'election_day'].includes(kind)) {
    return null
  }
  return '20:00:00'
}

function sectionHeading($, table) {
  return $(table).prevAll('h1, h2, h3, h4').first().text().replace(/\s+/g, ' ').trim()
}

export function parseWashingtonDatesAndDeadlines(html, year) {
  const $ = cheerio.load(html)
  const sections = []

  $('table').each((_index, table) => {
    const heading = sectionHeading($, table)
    if (!/election|primary/i.test(heading)) return

    const rows = []
    $(table).find('tr').each((_rowIndex, row) => {
      const cells = $(row).find('th, td').map((_cellIndex, cell) => (
        $(cell).text().replace(/\s+/g, ' ').trim()
      )).get()
      if (cells.length < 2 || /^date$/i.test(cells[0])) return
      const date = parseDate(cells[0], year)
      if (date) rows.push({ date, event: cells.slice(1).join(' ') })
    })

    if (rows.length > 0) sections.push({ heading, rows })
  })

  return sections.map((section, index) => {
    const type = electionType(section.heading)
    const electionRow = section.rows.find((row) => {
      const lower = row.event.toLowerCase()
      return lower.includes('election') && (
        lower.includes('deposit your ballot') ||
        lower.includes('return voted ballot') ||
        lower === 'primary' ||
        lower === 'general election' ||
        lower.startsWith('general election') ||
        lower.startsWith('special election')
      )
    }) ?? section.rows.at(-1)

    const milestones = section.rows.map((row) => {
      const kind = milestoneKind(row.event)
      if (!kind) return null
      return {
        kind,
        label: row.event,
        occursOn: row.date,
        occursAt: null,
        localTime: localTime(kind),
        datePrecision: localTime(kind) ? 'time' : 'date',
        sourceExcerpt: `${section.heading}: ${row.event}`,
      }
    }).filter(Boolean)

    if (!milestones.some((milestone) => milestone.kind === 'election_day')) {
      milestones.push({
        kind: 'election_day',
        label: `${section.heading} Election Day`,
        occursOn: electionRow.date,
        occursAt: null,
        localTime: null,
        datePrecision: 'date',
        sourceExcerpt: `${section.heading}: Election Day ${electionRow.date}`,
      })
    }

    return {
      externalId: `wa-${electionRow.date}-${type}-${index + 1}`,
      name: `${year} Washington ${section.heading}`,
      type,
      electionDay: electionRow.date,
      milestones,
    }
  })
}
