# PollPal architecture

## Recommended stack

| Layer | Choice | Reason |
| --- | --- | --- |
| Web app | Next.js 15 App Router + React + TypeScript | One codebase for the mobile dashboard and protected server routes; version 15 is supported by AWS Amplify Hosting. |
| UI | Tailwind CSS + shadcn/ui + Lucide | Fast composition with accessible primitives and full visual control. |
| Forms/contracts | React Hook Form + Zod | Shared validation for forms, external data, APIs, and model output. |
| Server | Next.js Route Handlers and Server Actions | Keeps civic, map, and Meta keys off the client without adding another app service. |
| Database | Hosted Supabase Postgres | Relational fit for elections, milestones, locations, subscriptions, and delivery history. |
| Auth | Supabase Auth with `@supabase/ssr` | Cookie sessions and low-friction magic-link sign-in. |
| Scheduling | Supabase Cron + one Edge Function | Hourly, observable processing of due reminders near the stored data. |
| Email | Resend for the hackathon | Simple transactional API, domain verification, delivery events, and unsubscribe support. |
| Election data | Google Civic Information API + official jurisdiction sources | Address-based data where supported, supplemented by authoritative state/local information. |
| Maps | Mapbox | Geocoding, maps, markers, and directions handoff. |
| AI | Meta Model API, `muse-spark-1.3`, Responses API | Structured extraction and sourced explanations without making the UI chatbot-first. |
| Deployment | AWS Amplify Hosting | Managed Next.js 15 SSR, API routes, CDN, environment variables, and logs. |
| Testing | Vitest + Testing Library + Playwright | Unit/contract tests and a deterministic deployed golden path. |

Pin all dependency versions and commit the lockfile. Do not upgrade framework versions during the event.

## System flow

```text
Browser
  │
  ├── location ──> /api/elections
  │                    ├── geocoder / civic lookup
  │                    ├── official-source adapters
  │                    └── normalized elections, milestones, and links
  │
  ├── map request ─> /api/locations ─> official polling/drop-box data
  │
  ├── reminder preferences ─> Supabase user-scoped tables
  │                                  │
  │                           hourly Supabase Cron
  │                                  │
  │                           reminder Edge Function ─> Resend
  │                                  │
  │                           delivery log / retry state
  │
  └── ballot question ─> /api/explain
                              ├── approved evidence set
                              ├── Muse Spark structured explanation
                              └── citation / neutrality audit

Next.js holds interactive API secrets. The reminder Edge Function holds the
email provider secret. The browser receives only publishable client keys.
```

## Data strategy

### Upcoming election discovery

No single public API is guaranteed to provide every local, special, state, and federal election. Treat discovery as an adapter system rather than tying the UI to one provider.

For the hackathon:

1. Use Google Civic election and voter-information data where available.
2. Curate one authoritative demo jurisdiction from its state/county/city election authority.
3. Normalize live and fixture data into the same PollPal domain types.
4. Show a visible source and `verified_at` time for every election and milestone.
5. Use an explicitly labeled fixture when a provider is unavailable; never silently substitute it for live data.

Post-hackathon, add jurisdiction-specific adapters and a review queue for changed dates or conflicting sources.

### Registration and official actions

PollPal stores links and explanatory metadata, not private registration records. A user leaves PollPal to register, check status, request a ballot, or track a ballot on the official website. Returning from a link does not mark the action complete automatically.

### Milestones and reminders

Store published facts separately from personalized delivery schedules:

- `election_milestones` contains the authoritative event, date/time, time zone, certainty, source, and revision.
- `reminder_rules` defines offsets such as seven days before registration or morning of early-voting opening.
- `scheduled_reminders` is materialized from user preferences plus current milestones.
- When a milestone changes, pending reminders are canceled and regenerated.
- A deterministic idempotency key prevents duplicate sends.

Dates must retain the jurisdiction's IANA time zone. Do not reduce election deadlines to UTC-only strings in the UI.

### Locations

Normalize polling places, vote centers, election offices, and drop boxes. Preserve:

- location type;
- applicability rule (`assigned`, `vote_center`, `jurisdiction_wide`, or `unknown`);
- address and coordinates;
- operating date ranges and daily hours;
- accessibility/language notes supplied by the authority;
- official source and verification time.

Do not use straight-line proximity as proof that a voter may use a location. Proximity is a sorting aid only.

### Ballot evidence

Candidate and measure explanations appear only when ballot data is available. Curate a small verified evidence set for the demo. Live grounded search may supplement the set but must not be the only path that makes the demo work.

Preferred source order:

1. election authority and government records;
2. candidate/campaign statements, labeled as self-authored;
3. legislative roll calls and public records;
4. reputable local reporting and nonpartisan research;
5. no answer rather than a weak source.

### Privacy

- Treat an exact residential address and email as sensitive data.
- Disable body logging on location, reminder, and ballot-question routes.
- Normalize to jurisdiction/district IDs and discard the street address unless the user explicitly saves it.
- Never send an address or email to the model.
- Keep reminder delivery data separate from ballot questions and interests.
- Do not store official registration status or vote choices.
- Redact email addresses and tokens from application logs.

## Core database model

### Reference and provenance

- `jurisdictions(id, name, type, state_code, timezone)`
- `elections(id, jurisdiction_id, external_id, name, type, election_day, status, verified_at)`
- `official_links(id, jurisdiction_id, election_id, action_type, url, label, verified_at)`
- `sources(id, url, publisher, title, category, published_at, retrieved_at, content_hash)`
- `election_milestones(id, election_id, kind, occurs_at, date_precision, certainty, source_id, revision)`
- `voting_locations(id, election_id, type, name, address_json, coordinates, applicability, source_id, verified_at)`
- `location_hours(id, location_id, opens_at, closes_at)`

### Ballot data

- `contests(id, election_id, external_id, type, title, district)`
- `options(id, contest_id, external_id, name, party, image_url)`
- `claims(id, option_id, topic, text, confidence, generated_at)`
- `claim_sources(claim_id, source_id, evidence_excerpt)`

### Private user data

- `profiles(user_id, display_name, home_jurisdiction_id, created_at)`
- `notification_subscriptions(id, user_id, election_id, email, status, timezone, verified_at)`
- `notification_preferences(subscription_id, reminder_kind, enabled, lead_time)`
- `scheduled_reminders(id, subscription_id, milestone_id, scheduled_for, status, idempotency_key)`
- `notification_deliveries(id, scheduled_reminder_id, provider_id, status, attempted_at, delivered_at, error_code)`
- `voting_plans(id, user_id, election_id, method, target_at, location_id, status)`
- `plan_steps(id, plan_id, type, label, due_at, completed_at, official_url)`

### AI audit data

- `explanations(id, election_id, contest_id, question_hash, output_json, model, prompt_version, created_at)`
- `explanation_sources(explanation_id, source_id)`
- `ai_audits(id, explanation_id, passed, coverage_score, flags_json, created_at)`

Do not store raw street addresses. Store raw questions only with explicit product-research consent; use a keyed hash for cache lookup otherwise.

## RLS and API exposure

Enable RLS on every table in an exposed schema. New Supabase projects do not automatically expose new tables to the Data API, so migrations must include deliberate `GRANT` statements in addition to RLS policies.

- Public reference tables: explicit read grants to the required roles and no client write grants.
- Profiles: a user can select/update only `user_id = auth.uid()`.
- Subscriptions and preferences: a user can access only their own rows.
- Scheduled reminders and deliveries: no direct browser writes; expose a safe user-scoped read view only if needed.
- Plans and steps: ownership policies through the parent plan.
- AI audit internals: private schema; expose only the safe explanation receipt.
- Any view exposed to users uses `security_invoker = true`.

Never put a service-role or secret key in the browser. Never authorize from editable user metadata. `UPDATE` policies require `USING`, `WITH CHECK`, and a corresponding `SELECT` policy.

## Reminder delivery design

1. User verifies their email through auth or a dedicated confirmation link.
2. Preferences create or update one subscription.
3. Application materializes future reminders from confirmed milestones.
4. Supabase Cron invokes one Edge Function hourly. Store the invocation credential in Supabase Vault.
5. The function atomically claims a small batch of due reminders.
6. It calls Resend with the reminder idempotency key.
7. It records provider response and final delivery status.
8. Failures retry with bounded backoff; permanent failures stop and surface to the user.
9. Unsubscribe tokens are high-entropy, hashed at rest, and scoped to one subscription.

The function should remain under the documented Cron execution limits and avoid function-to-function fan-out. One worker handles a bounded batch.

## Server endpoints

### `POST /api/elections`

Input: `{ address?: string, zip?: string }`

Output: normalized upcoming elections, next actions, source state, and retrieval time.

### `GET /api/elections/[id]`

Returns election details, milestones, official links, ballot availability, and available voting methods.

### `GET /api/elections/[id]/locations`

Returns normalized voting and return locations. Filters by type/date and clearly describes applicability.

### `POST /api/reminders/subscribe`

Creates a pending or verified subscription, preferences, and future schedule. Rate-limited and protected from address/email enumeration.

### `POST /api/reminders/preferences` and `GET /unsubscribe/[token]`

Updates reminder choices or disables the scoped subscription.

### `POST /api/explain`

Accepts an election, contest, and question only after ballot data exists. Returns a schema-validated, citation-audited explanation.

### `GET /api/calendar/[planId]`

Returns an `.ics` file after verifying ownership.

## AI boundary

Muse Spark may extract and explain information already retrieved from approved sources. It does not decide:

- whether an election applies to an address;
- whether a user is registered or eligible;
- the legal value of a deadline;
- which location a voter is allowed to use;
- when a reminder should be scheduled;
- which candidate is preferable.

Model output is structured and source-addressed. Nonexistent citations, recommendations, unsupported claims, or unequal framing cause rejection or an evidence-only response.

## Test strategy

### Election and reminder contracts

- Live and fixture adapters produce the same domain type.
- Missing milestone fields remain unavailable rather than being estimated silently.
- Jurisdiction time zones survive storage and display around daylight-saving transitions.
- A changed official deadline cancels and regenerates pending reminders.
- Reprocessing the same due reminder does not send twice.
- Unsubscribe stops all future sends for the selected subscription.
- Bounced or permanently failed email is not retried forever.

### Location and ballot contracts

- A nearby location with unknown applicability is not presented as assigned.
- Closed locations are excluded for the selected date.
- A fake model citation is rejected.
- A recommendation or unsupported ballot claim is rejected.

### Security tests

- User A cannot read User B's email, preferences, plan, or deliveries.
- Browser clients cannot insert reference data or mark reminders delivered.
- Expired confirmation/unsubscribe tokens fail safely.
- Logs and analytics contain no address, email, auth token, or vote choice.
- Public bundles contain no server secrets.

### End-to-end tests

The deterministic Playwright path covers location → election → timeline → reminder opt-in → locations → ballot explanation. Test the provider email path separately and keep a recorded fallback for the live demo.

## Deployment notes

Use Node.js 22 and Next.js 15 for Amplify compatibility. Avoid edge API routes and unsupported response-streaming assumptions. The Next.js app runs on Amplify; Supabase hosts data, Cron, and the reminder worker.

Required secrets include:

- `MODEL_API_KEY`
- `GOOGLE_CIVIC_API_KEY`
- `MAPBOX_ACCESS_TOKEN` or server token as appropriate
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- server-only Supabase secret when required
- `RESEND_API_KEY`

Use a verified sending domain rather than a personal address. Configure SPF, DKIM, unsubscribe behavior, and a development recipient allowlist before enabling scheduled delivery.
