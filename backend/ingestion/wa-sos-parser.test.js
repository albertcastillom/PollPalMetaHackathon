import assert from 'node:assert/strict'
import test from 'node:test'

import { parseWashingtonDatesAndDeadlines } from './wa-sos-parser.js'

const html = `
  <h2>General Election</h2>
  <table>
    <tr><th>Date</th><th>Event</th></tr>
    <tr><td>October 16</td><td>Start of 18-day voting period (through Election Day). Ballots are mailed out.</td></tr>
    <tr><td>October 26</td><td>Online and mail registrations must be received 8 days before Election Day.</td></tr>
    <tr><td>November 3</td><td>Deadline for Washington State voter registration or updates (in person only).</td></tr>
    <tr><td>November 3</td><td>General Election - Deposit your ballot in an official drop box by 8 p.m. on Election Day.</td></tr>
  </table>
`

test('extracts a Washington election and voter-facing milestones', () => {
  const [election] = parseWashingtonDatesAndDeadlines(html, 2026)

  assert.equal(election.type, 'general')
  assert.equal(election.electionDay, '2026-11-03')
  assert.deepEqual(
    election.milestones.map((milestone) => milestone.kind),
    [
      'voting_period_start',
      'registration_online_mail_deadline',
      'registration_in_person_deadline',
      'ballot_return_deadline',
      'election_day',
    ],
  )
  assert.equal(
    election.milestones.find((item) => item.kind === 'ballot_return_deadline').localTime,
    '20:00:00',
  )
})
