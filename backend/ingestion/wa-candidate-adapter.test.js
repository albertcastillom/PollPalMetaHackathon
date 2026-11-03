import assert from 'node:assert/strict'
import test from 'node:test'

import { parseVoteWaCandidateCsv } from './wa-candidate-adapter.js'

const header = '"District Type","District","Race","Term Type","Term Length","Name","Mailing Address","Email","Phone","Filing Date","Party Preference","Status","Election Status","Ballot Order"\n'

test('maps official candidate rows to address-resolvable Washington jurisdictions', () => {
  const csv = `${header}"Congressional","Congressional District 1","U.S. Representative","Regular","2","Suzan DelBene","private","private@example.com","private","date","DEMOCRATIC","Active","","1"\n"Legislative","Legislative District 1","State Representative Pos. 1","Regular","2","Davina Duerr","private","private@example.com","private","date","DEMOCRATIC","Active","","2"\n"Countywide","County","Prosecuting Attorney","Regular","4","Example Candidate","private","private@example.com","private","date","NONPARTISAN","Active","","1"\n"Judicial","Supreme Court","Justice Position 1","Regular","6","Example Justice","private","private@example.com","private","date","NONPARTISAN","Active","","1"`

  const candidates = parseVoteWaCandidateCsv(csv, { countyExternalId: 'wa:county:king' })

  assert.deepEqual(candidates.map((candidate) => candidate.jurisdictionExternalId), [
    'wa:congressional:1',
    'wa:legislative:1',
    'wa:county:king',
    'ocd-division/country:us/state:wa',
  ])
  assert.equal(candidates[0].party, 'Democratic')
})

test('excludes withdrawn candidates and districts without safe boundary matching', () => {
  const csv = `${header}"Council","County Council District No. 2","Councilmember","Regular","4","Not Exact","private","private@example.com","private","date","NONPARTISAN","Active","","1"\n"City/Town","City of Bothell","Mayor","Regular","4","Withdrawn Person","private","private@example.com","private","date","NONPARTISAN","Withdrawn","","1"`

  assert.deepEqual(parseVoteWaCandidateCsv(csv, { countyExternalId: 'wa:county:king' }), [])
})

test('handles quoted commas without retaining contact fields', () => {
  const csv = `${header}"City/Town","City of Richland","Mayor","Regular","4","Jane Doe","PO BOX 1, RICHLAND, WA","jane@example.com","(509) 555-0000","date","NO PARTY PREFERENCE","Active","","1"`
  const [candidate] = parseVoteWaCandidateCsv(csv, { countyExternalId: 'wa:county:benton' })

  assert.equal(candidate.name, 'Jane Doe')
  assert.equal(candidate.jurisdictionExternalId, 'wa:city:richland')
  assert.equal(Object.hasOwn(candidate, 'email'), false)
  assert.equal(Object.hasOwn(candidate, 'mailingAddress'), false)
})

test('accepts pre-ballot exports that do not include ballot order', () => {
  const preBallotHeader = '"District Type","District","Race","Term Type","Term Length","Name","Mailing Address","Email","Phone","Filing Date","Party Preference","Status","Election Status"\n'
  const csv = `${preBallotHeader}"City/Town","City of Kennewick","Councilmember","Regular","4","Jane Doe","private","private@example.com","private","date","NONPARTISAN","Active",""`

  const [candidate] = parseVoteWaCandidateCsv(csv, { countyExternalId: 'wa:county:benton' })

  assert.equal(candidate.name, 'Jane Doe')
  assert.equal(candidate.ballotOrder, null)
})
