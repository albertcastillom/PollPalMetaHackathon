# PollPal frontend API integration guide

This guide describes the Express API currently available to the PollPal
frontend. It documents the live request and response contract, supported data,
error behavior, and known limitations.

## Quick start

The frontend and backend run as separate processes.

From the repository root, install and start the backend:

```sh
npm --prefix backend ci
npm --prefix backend start
```

The default backend URL is:

```text
http://localhost:3001
```

Start the Vite frontend in another terminal:

```sh
npm run dev
```

The backend permits requests from the origin configured by `CLIENT_ORIGIN` in
`backend/.env`. The local default is `http://localhost:5173`.

The frontend should define its API URL separately. For example, create a local
frontend `.env` entry:

```text
VITE_API_BASE_URL=http://localhost:3001
```

Do not put `DATABASE_URL` or any other backend secret in a Vite environment
variable. Every variable beginning with `VITE_` is available to browser code.

## Endpoints

### `GET /api/health`

Use this endpoint to verify that the Express process is running. It does not
verify every upstream county website.

Request:

```sh
curl http://localhost:3001/api/health
```

Successful response, HTTP `200`:

```json
{
  "status": "ok"
}
```

### `POST /api/elections`

Resolves one Washington location and returns relevant upcoming elections,
deadlines, jurisdictions, voting locations, ballot resources, sources, and
coverage information.

The JSON body must contain exactly one of:

- `address`
- `coordinates`

Do not send both fields in the same request.

#### Address request

```json
{
  "address": "a complete Washington street address"
}
```

The address must be between 8 and 300 characters. The API sends it to the U.S.
Census geocoder, but does not log or persist the raw address. ZIP-only search is
not currently a supported contract; the frontend should request a complete
Washington street address.

Example:

```js
const response = await fetch(`${API_BASE_URL}/api/elections`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ address }),
})
```

#### Coordinate request

```json
{
  "coordinates": {
    "latitude": 47.7623,
    "longitude": -122.2054
  }
}
```

Coordinate requests bypass the Census geocoder. Latitude must be from `-90` to
`90`, and longitude must be from `-180` to `180`.

## Election response

A successful lookup returns HTTP `200` with this top-level shape:

```json
{
  "provider": "pollpal_washington",
  "normalizedLocation": "normalized address or null",
  "coordinates": {
    "latitude": 47.7623,
    "longitude": -122.2054
  },
  "jurisdictions": [],
  "elections": [],
  "votingLocations": [],
  "contests": [],
  "coverage": [],
  "query": {
    "type": "address or coordinates",
    "resolvedBy": "us_census_geocoder or user_coordinates"
  },
  "retrievedAt": "2026-11-02T20:00:00.000Z"
}
```

Empty arrays are meaningful. Check `coverage` before interpreting an empty
`elections`, `votingLocations`, or `contests` array as proof that no data exists.

### `jurisdictions`

Jurisdictions describe the public boundaries containing the supplied point.

```json
{
  "id": "wa:county:king",
  "name": "King County",
  "type": "county",
  "verifiedAt": "2026-11-03T05:26:09.091Z"
}
```

Possible jurisdiction types currently include:

- `state`
- `county`
- `city`
- `congressional`
- `legislative`
- `precinct`

The `id` is a stable public external identifier. It is not the internal
database UUID.

### `elections`

```json
{
  "id": "database UUID",
  "externalId": "wa:2026:general",
  "name": "2026 Washington General Election",
  "type": "general",
  "electionDay": "2026-11-03",
  "status": "confirmed",
  "timezone": "America/Los_Angeles",
  "verifiedAt": "2026-10-29T23:11:46.634Z",
  "source": {
    "publisher": "Washington Secretary of State",
    "url": "https://www.sos.wa.gov/..."
  },
  "milestones": []
}
```

Possible election types are:

- `special`
- `primary`
- `general`
- `presidential_primary`
- `other`

Only elections whose date is today or later and whose status is `expected` or
`confirmed` are returned.

### `elections[].milestones`

Milestones can power the deadline timeline and next-action card.

```json
{
  "id": "database UUID",
  "kind": "registration_online_mail_deadline",
  "label": "Online and mail registration deadline",
  "occursOn": "2026-10-26",
  "occursAt": null,
  "localTime": null,
  "datePrecision": "date",
  "timezone": "America/Los_Angeles",
  "certainty": "official",
  "sourceExcerpt": "Official source text used for this milestone",
  "verifiedAt": "2026-10-29T23:11:46.634Z"
}
```

Known milestone kinds currently include:

- `voting_period_start`
- `registration_online_mail_deadline`
- `registration_in_person_deadline`
- `ballot_return_deadline`
- `election_day`

Sort milestones by `occursOn`, then `localTime`. Use the election's IANA
`timezone` when displaying dates and times.

### `votingLocations`

Voting locations currently cover King, Snohomish, Benton, and Franklin
counties.

```json
{
  "id": "database UUID",
  "externalId": "wa:2026:general:king:location:bothell-library",
  "electionId": "election database UUID",
  "type": "drop_box",
  "name": "Bothell Library",
  "address": "18215 98th Ave NE",
  "city": "Bothell",
  "postalCode": "98011",
  "description": null,
  "driveUp": false,
  "opensOn": null,
  "closesOn": "2026-11-03",
  "opensTime": null,
  "closesTime": "20:00:00",
  "timezone": "America/Los_Angeles",
  "coordinates": {
    "latitude": 47.761,
    "longitude": -122.209
  },
  "source": {
    "publisher": "King County Elections",
    "url": "https://..."
  },
  "verifiedAt": "2026-11-03T05:26:09.091Z"
}
```

Possible location types are:

- `drop_box`
- `voting_center`
- `election_office`

Important frontend behavior:

- King County locations currently include map coordinates.
- Snohomish, Benton, and Franklin locations may have `coordinates: null`.
- The API returns all applicable locations for the resolved county.
- The API does not yet calculate distance or return only the nearest locations.
- A list view should work for every supported county.
- Only render a map pin when `coordinates` is non-null.
- A directions link can be built from the public address when coordinates are
  unavailable.

### `contests`

Contest coverage is currently partial. The array can contain known measures and
links to authoritative ballot resources.

```json
{
  "id": "database UUID",
  "externalId": "stable external identifier",
  "electionId": "election database UUID",
  "type": "ballot_resource",
  "title": "Sample ballot",
  "description": null,
  "url": "https://official-county-source.example/sample-ballot",
  "metadata": {},
  "source": {
    "publisher": "Benton County Elections",
    "url": "https://official-county-source.example"
  },
  "verifiedAt": "2026-11-03T05:26:12.769Z"
}
```

Possible contest types are:

- `candidate_race`
- `measure`
- `ballot_resource`

The backend does not yet provide complete candidate names, parties,
biographies, or issue positions. The current Candidates page should therefore
render official ballot resources and known measures, or show a clearly labeled
partial-coverage state. Do not turn a `ballot_resource` into a fake candidate
card.

### `coverage`

Coverage tells the frontend whether a component is complete, partial, pending,
unavailable, or stale for a jurisdiction.

```json
{
  "component": "locations",
  "status": "complete",
  "notes": "100 official locations from King County Elections",
  "verifiedAt": "2026-11-03T05:26:09.091Z",
  "jurisdictionId": "wa:county:king"
}
```

Possible components are:

- `calendar`
- `deadlines`
- `locations`
- `contests`
- `precinct_matching`

Possible statuses are:

- `complete`
- `partial`
- `pending`
- `unavailable`
- `stale`

Prefer the most specific jurisdiction's coverage record. For example, a county
may report complete location coverage while statewide location coverage remains
partial.

## Error responses

All handled errors use this shape:

```json
{
  "error": {
    "code": "invalid_location",
    "message": "Provide exactly one of address or coordinates."
  }
}
```

The frontend should branch on `error.code`, not parse the message text.

| HTTP | Code | Meaning |
|---:|---|---|
| `400` | `invalid_location` | Missing location, both address and coordinates supplied, invalid coordinate range, or invalid address length |
| `422` | `address_not_resolved` | Census could not resolve the address |
| `422` | `outside_coverage` | The address or coordinates are outside Washington |
| `502` | `geocoder_unavailable` | Census geocoding is temporarily unavailable |
| `503` | `geocoder_not_configured` | Address geocoding is not configured |
| `500` | `internal_error` | Unexpected backend or database failure |

For HTTP `500` and other server failures, the public message is intentionally
generic even though the error code is preserved.

## Suggested frontend client

Create one shared API module rather than calling `fetch` separately from every
page.

```js
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

export async function findElections(location) {
  const response = await fetch(`${API_BASE_URL}/api/elections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(location),
  })

  const body = await response.json()

  if (!response.ok) {
    const error = new Error(body.error?.message ?? 'Election lookup failed.')
    error.code = body.error?.code ?? 'unknown_error'
    error.status = response.status
    throw error
  }

  return body
}
```

Address usage:

```js
const data = await findElections({ address })
```

Coordinate usage:

```js
const data = await findElections({
  coordinates: { latitude, longitude },
})
```

## Mapping the response to existing pages

### Home page

- Replace sample election cards with `elections`.
- Display the county and city from `jurisdictions`.
- Use the earliest future milestone for a next-action card.
- Display `source.publisher` and `verifiedAt` near election information.
- Preserve the whole response in shared state or route context so the map and
  ballot pages do not repeat address geocoding unnecessarily.

### Ballot map page

- Replace placeholder locations with `votingLocations`.
- Always support a location list.
- Render map pins only for records with coordinates.
- Use `driveUp`, `type`, `closesOn`, and `closesTime` as badges/details.
- Use the official source URL for a “Source” link.
- Do not show fake distance values; distance calculation is not implemented.

### Candidates page

- Treat the page as “What's on the ballot” for now.
- Render `measure` records as ballot items.
- Render `ballot_resource` records as official outbound links.
- Show a partial-coverage notice when the county's `contests` coverage is not
  `complete`.
- Candidate profile cards are not supported by the current API.

### Login and reminders

The current login UI is visual-only. There are no backend endpoints yet for
authentication, saved locations, subscriptions, reminders, or email delivery.
Hide these actions, disable them, or label them “coming soon” until those APIs
exist.

## Current limitations

- Washington is the only supported state.
- County location adapters currently cover King, Snohomish, Benton, and
  Franklin counties.
- Contest coverage is partial and is not yet personalized to an exact ballot.
- ZIP-only lookup is not a supported API contract.
- Location distance and nearest-location ranking are not implemented.
- Most non-King location records do not yet contain coordinates.
- Authentication, reminders, election results, and AI ballot explanations are
  not implemented.
- Upcoming-election queries exclude elections before the database's current
  date. After an election passes, the next election must be ingested before it
  can appear in the frontend.

## Manual test commands

Health:

```sh
curl http://localhost:3001/api/health
```

Bothell coordinate lookup:

```sh
curl -X POST http://localhost:3001/api/elections \
  -H 'Content-Type: application/json' \
  -d '{"coordinates":{"latitude":47.7623,"longitude":-122.2054}}'
```

Kennewick coordinate lookup:

```sh
curl -X POST http://localhost:3001/api/elections \
  -H 'Content-Type: application/json' \
  -d '{"coordinates":{"latitude":46.2087,"longitude":-119.1190}}'
```

Pasco coordinate lookup:

```sh
curl -X POST http://localhost:3001/api/elections \
  -H 'Content-Type: application/json' \
  -d '{"coordinates":{"latitude":46.2396,"longitude":-119.1006}}'
```

## Related backend documentation

- [Washington backend and ingestion](BACKEND_WASHINGTON.md)
- [Architecture and data model](ARCHITECTURE.md)
- [Product specification](PRODUCT_SPEC.md)
