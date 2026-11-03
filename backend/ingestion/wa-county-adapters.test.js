import assert from 'node:assert/strict'
import test from 'node:test'

import {
  parseBallotItems,
  parseBentonLocations,
  parseCountyElection,
  parseFranklinLocations,
  parseKingArcGisLocations,
  parseSnohomishLocations,
} from './wa-county-adapters.js'

test('parses a county election descriptor', () => {
  const election = parseCountyElection(`
    <main><h1>November 3, 2026 General Election</h1></main>
  `)

  assert.deepEqual(election, {
    electionDay: '2026-11-03',
    type: 'general',
    name: '2026 Washington General Election',
    sourceExcerpt: 'November 3, 2026',
  })
})

test('normalizes King County ArcGIS drop boxes', () => {
  const [location] = parseKingArcGisLocations([{
    geometry: { type: 'Point', coordinates: [-122.205, 47.762] },
    properties: {
      NAME: 'Bothell Library Ballot Drop Box',
      ADDRESS: '18215 98th Ave NE',
      CITYZIP: 'Bothell',
      ZIPCODE: '98011',
      DRIVEUP: 'YES\n',
      DESC_NOTES: 'Near the entrance',
    },
  }], '2026-11-03')

  assert.equal(location.name, 'Bothell Library')
  assert.equal(location.driveUp, true)
  assert.deepEqual([location.latitude, location.longitude], [47.762, -122.205])
})

test('parses Snohomish County location accordions', () => {
  const locations = parseSnohomishLocations(`
    <details>
      <summary><strong>Bothell</strong> (1 location)</summary>
      <h3><strong>QFC Parking Lot</strong></h3>
      <p>22833 Bothell Everett Highway<br>Bothell, WA 98021<br>Drive-up accessible</p>
    </details>
  `, '2026-11-03')

  assert.deepEqual(locations[0], {
    name: 'QFC Parking Lot',
    type: 'drop_box',
    address: '22833 Bothell Everett Highway',
    city: 'Bothell',
    postalCode: '98021',
    description: 'Drive-up accessible',
    driveUp: true,
    opensOn: null,
    closesOn: '2026-11-03',
    latitude: null,
    longitude: null,
  })
})

test('parses Benton County location tables and opening dates', () => {
  const locations = parseBentonLocations(`
    <table>
      <tr><th>Name</th><th>Address</th><th>City</th><th>Zip</th><th>Drive Through Drop Box?</th><th>Open Days Before Election</th></tr>
      <tr><td>Kennewick City Hall</td><td>524 S. Auburn St.</td><td>Kennewick</td><td>99336</td><td>Yes</td><td>20</td></tr>
    </table>
  `, '2026-11-03')

  assert.equal(locations[0].opensOn, '2026-10-14')
  assert.equal(locations[0].driveUp, true)
  assert.equal(locations[0].city, 'Kennewick')
})

test('parses Franklin County location cards', () => {
  const locations = parseFranklinLocations(`
    <main>
      <h2>Ballots Drop Boxes will be available starting October 9, 2026</h2>
      <div class="fr-view">
        <h2>Courthouse Parking Lot</h2>
        <p>24-hour drive-up drop site<br><a>1016 N 4th Ave</a><br><a>Pasco, WA 99301</a></p>
      </div>
    </main>
  `, '2026-11-03')

  assert.equal(locations[0].name, 'Courthouse Parking Lot')
  assert.equal(locations[0].opensOn, '2026-10-09')
  assert.equal(locations[0].driveUp, true)
  assert.equal(locations[0].city, 'Pasco')
})

test('extracts official ballot resources and measures', () => {
  const items = parseBallotItems(`
    <main>
      <a href="/sample.pdf">Sample Ballot</a>
      <h3>Fire Protection District No. 3 - Proposition No. 1</h3>
      <p>Emergency medical services levy.</p>
    </main>
  `, 'https://county.example/current')

  assert.equal(items.length, 2)
  assert.equal(items[0].url, 'https://county.example/sample.pdf')
  assert.equal(items[1].type, 'measure')
})
