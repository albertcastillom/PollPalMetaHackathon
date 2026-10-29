# Washington election data backend

The backend is an independent Express service in `backend/`. It owns a
Washington-first election dataset rather than depending on Google Civic at
request time.

## Phase 1 components

- Washington Secretary of State dates-and-deadlines collector
- Washington precinct and city boundary collectors from official ArcGIS layers
- Census address geocoder integration; coordinate input bypasses geocoding
- Postgres/PostGIS schema with source snapshots, revisions, coverage, and RLS
- Address/coordinate to jurisdiction lookup
- Upcoming-election lookup with explicit coverage status

The API never scrapes an official site during a user request. Scheduled jobs
refresh Postgres, and requests use the last verified database revision.

## Local setup

Requirements:

- Node.js 22+
- Docker Desktop for the local Supabase stack, or a Supabase/Postgres connection
- Supabase CLI

```sh
cd backend
npm install
cp .env.example .env
cd ..
supabase start
supabase db reset
cd backend
npm run ingest:wa:sos -- 2026
npm run ingest:wa:boundaries
npm run dev
```

The boundary import is intentionally a background operation. The statewide
precinct source is tens of megabytes and is paginated into local storage.

## API

### Health

```http
GET /api/health
```

### Upcoming elections

```http
POST /api/elections
Content-Type: application/json

{
  "address": "a complete Washington street address"
}
```

Coordinates can be used without transmitting a street address to a geocoder:

```json
{
  "coordinates": {
    "latitude": 47.7623,
    "longitude": -122.2054
  }
}
```

The response includes resolved jurisdictions, applicable elections, milestones,
official sources, verification timestamps, and per-component coverage. Missing
county adapters are reported as `pending`; an empty result is never presented as
proof that no local election exists.

## Source adapters

Current official sources:

- Washington SOS dates and deadlines:
  `https://www.sos.wa.gov/elections/elections-calendar/dates-and-deadlines`
- Washington SOS/WaTech statewide precincts ArcGIS FeatureServer
- Washington Department of Revenue city boundaries ArcGIS MapServer
- U.S. Census Geocoding Services for address normalization

Phase 2 adds King and Snohomish election, contest, and voting-location adapters.

## Privacy

Raw user addresses are sent only to the Census geocoder, are not logged, and are
not persisted. Only coordinates and resolved public jurisdiction identifiers are
used for election matching. Coordinate input avoids address transmission.
