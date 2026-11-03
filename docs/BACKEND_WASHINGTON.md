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
npm run ingest:wa:candidates -- 2026 general 899
npm run dev
```

PollPal's local Supabase services use ports `55321`–`55329` so they can run
alongside another project using Supabase's default `5432x` ports.

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

## Phase 2 county adapters

Phase 2 adds official county election and voting-location ingestion for:

- King County
- Snohomish County
- Benton County (Kennewick, Richland, and West Richland)
- Franklin County (Pasco and the rest of Franklin County)

Run all county adapters:

```sh
cd backend
npm run ingest:wa:counties -- 2026
```

Run a subset by adapter key:

```sh
npm run ingest:wa:counties -- 2026 benton franklin
```

The API response now includes `votingLocations` and `contests`. Location
coverage is complete for each supported county when its live parser passes the
minimum-record safety check. Contest coverage remains explicitly `partial`
because some counties publish only an address-specific VoteWA guide or a PDF
rather than a complete machine-readable contest list. In those cases PollPal
returns the official ballot resource instead of inferring missing contests.

Current Phase 2 sources include King County's official ballot-drop-box GIS
layer and the official election/location pages maintained by Snohomish, Benton,
and Franklin counties.

## Candidate ingestion

PollPal imports the official VoteWA CSV candidate list outside request time and
stores normalized races and candidates in Postgres. The current adapters cover
King, Snohomish, Benton, and Franklin counties, including Bothell and the
Tri-Cities. The same statewide, congressional, or legislative candidate can
appear in multiple county exports; ingestion groups and de-duplicates those
records before writing them.

```sh
cd backend
npm run ingest:wa:candidates -- 2026 general 899
```

The final number is VoteWA's election id. Known 2026 defaults are configured in
the script (`899` general and `898` primary), so it can be omitted for those
elections. Run the SOS calendar ingestion first so the matching election exists.

The importer persists names, party preferences, filing status, optional ballot
order, source, verification time, and official voters' guide profiles when
submitted. Profiles include the official photo, candidate statement, elected
experience, professional experience, education, community service, campaign
website, and campaign-finance link. Candidate-submitted fields retain the
official disclaimer that the Secretary of State does not verify them for truth
or fact. The importer deliberately discards mailing addresses, phone numbers,
and email addresses from both sources. Only
active candidates are exposed by `POST /api/elections` under each
`candidate_race` record's `candidates` array.

Candidate cards can use the nested `profile` object returned with contest
candidates. A full profile is also available from `GET /api/candidates/:id`,
and its `photoUrl` points to `GET /api/candidates/:id/photo`. The photo endpoint
serves the official image with a fixed image content type; clients do not need
direct database or storage credentials.

Coverage remains partial. PollPal currently matches only jurisdiction types for
which it has safe address-resolution boundaries: state Supreme Court,
congressional, legislative, countywide, and city/town races. It excludes port,
PUD, school, fire, county-council, and similar district races until their exact
boundaries are imported.

## Phase 3 reminders

Phase 3 adds Supabase Auth-backed reminder subscriptions and a Resend delivery
worker. The database migration creates owner-scoped subscriptions and
preferences, materialized schedules, delivery history, RLS policies, explicit
Data API grants, and service-role-only claim/completion functions.

Required Express environment variables:

```sh
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
UNSUBSCRIBE_TOKEN_SECRET=a-random-secret-with-at-least-32-characters
APP_URL=http://localhost:5173
```

The frontend signs in through Supabase Auth and sends the session access token
to `GET`, `POST`, and `DELETE /api/reminders` as a bearer token. See
`docs/FRONTEND_API_GUIDE.md` for request and response examples.

The worker lives at `supabase/functions/reminder-worker/index.ts`. Configure
these hosted Edge Function secrets before deploying it:

```sh
RESEND_API_KEY=re_...
REMINDER_FROM_EMAIL="PollPal <reminders@your-verified-domain.example>"
REMINDER_CRON_SECRET=a-second-random-secret
UNSUBSCRIBE_TOKEN_SECRET=the-same-value-used-by-the-express-api
APP_URL=https://your-frontend.example
REMINDER_RECIPIENT_ALLOWLIST=demo@example.com
```

Supabase injects `SUPABASE_URL` and `SUPABASE_SECRET_KEYS` into the hosted Edge
Function automatically; do not create or commit those values yourself.

`REMINDER_RECIPIENT_ALLOWLIST` is optional but recommended during development.
Deploy the function, store its invocation credential in Supabase Vault, and
schedule one hourly invocation with Supabase Cron. Send the
`x-cron-secret: <REMINDER_CRON_SECRET>` header. Do not commit any of these
values or expose the secret key in the frontend.

The worker atomically claims at most 25 due reminders, uses each schedule's
stable idempotency key with Resend, records every attempt, and retries failures
with bounded backoff up to three attempts. Claims left behind by a crashed
worker are recoverable after 15 minutes. Unsubscribe cancels unsent work. When
an official milestone revision changes, future unsent schedules are
recalculated by a database trigger.

## Privacy

Raw user addresses are sent only to the Census geocoder, are not logged, and are
not persisted. Only coordinates and resolved public jurisdiction identifiers are
used for election matching. Coordinate input avoids address transmission.
