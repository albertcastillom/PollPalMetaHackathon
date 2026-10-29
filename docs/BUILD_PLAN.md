# PollPal six-day build plan

The submission deadline is Wednesday, November 4, 2026 at 9:00 PM Eastern / 6:00 PM Pacific. Development starts Friday, October 30. The plan prioritizes the one-stop election lifecycle; ballot AI is added after discovery, process guidance, reminders, and locations work.

## Before coding: 60-minute lock-in

- Confirm indie vs startup track and all participant-portal requirements.
- Choose one demo jurisdiction, one known-good non-sensitive address, and its IANA time zone.
- Identify a next election plus a later election so the dashboard demonstrates local-to-federal discovery.
- Verify which fields Google Civic supplies and collect official state/county/city sources for missing data.
- Collect registration, status-check, ballot-request, ballot-tracking, polling, and drop-box URLs.
- Verify an email sending domain and choose the single address used for the live reminder demonstration.
- Create Meta, Google, Mapbox, Supabase, Resend, and AWS credentials.

## Friday, October 30 — election discovery and deployed dashboard

Outcome: a production site turns the demo location into an upcoming-election dashboard.

- Scaffold and pin Next.js 15, TypeScript, Tailwind, UI primitives, linting, Vitest, and Playwright.
- Establish environment validation and log redaction.
- Define normalized jurisdiction, election, milestone, official-link, and data-provenance types.
- Implement the civic provider adapter and authoritative fixture fallback.
- Build the mobile landing page and “My Elections” dashboard.
- Show the next election, election type, next action, official source, and last-verified time.
- Include at least two election levels in fixture data to communicate local-to-federal coverage.
- Deploy to AWS Amplify before the end of the day.

Exit test: fresh production browser → demo location → upcoming elections → next action, with no raw address in logs.

## Saturday, October 31 — timeline, official actions, and locations

Outcome: one election page explains the process and shows where to act or vote.

- Build the chronological election timeline and current-next-action card.
- Add official links for registration, status check, address updates, mail-ballot requests, tracking, and local election contact.
- Show clear “opens official website” behavior and never imply an action was completed.
- Add voting-method selection: mail, early in-person, and Election Day.
- Normalize polling place, vote-center, election-office, and drop-box data.
- Build a map/list view with date, hours, applicability, accessibility data, official source, and directions.
- Add mail-return instructions and distinguish the recommended mail date from the legal deadline.
- Create checked-in election and location fixtures for deterministic testing.

Exit test: a user can identify the next deadline, open the correct official action, choose mail voting, and find a valid return option.

## Sunday, November 1 — real reminder system and private data

Outcome: a user can opt in and receive a real, deduplicated election reminder email.

- Create Supabase migrations for jurisdictions, elections, milestones, sources, subscriptions, preferences, schedules, deliveries, and plans.
- Include explicit Data API grants and enable RLS on every exposed table.
- Add magic-link auth or dedicated email confirmation.
- Build reminder preference selection and verified unsubscribe.
- Materialize reminders from milestone dates and user offsets.
- Enable Supabase Cron and schedule one hourly Edge Function through a Vault-held credential.
- Integrate Resend with a verified sender and development recipient allowlist.
- Implement atomic claim, idempotency key, delivery log, and bounded retry behavior.
- Send and inspect a real registration, ballot-mailing, or Election Day reminder.
- Add tests for duplicate prevention, deadline changes, time zones, and cross-user isolation.

Exit test: a verified user subscribes, one due reminder sends exactly once, delivery is logged, and unsubscribe prevents a later send.

## Monday, November 2 — ballot availability and sourced explanation

Outcome: the lifecycle continues naturally when the ballot becomes available.

- Add ballot availability states: unavailable, expected, available, and stale.
- Let users subscribe specifically to “ballot available” or “ballots begin mailing.”
- Curate sources for one demo contest or measure.
- Define Zod schemas for sources, claims, explanations, and audits.
- Connect `muse-spark-1.3` from a protected server route.
- Use Meta AI to simplify official process language and answer one ballot question from supplied evidence.
- Validate every source ID and reject recommendations or unsupported claims.
- Build a conventional ballot explorer with suggested questions and an optional free-text field; do not make chat the home screen.
- Cache one reviewed demo explanation as a visibly dated fallback.

Exit test: pre-ballot state offers an alert; post-ballot state answers the demo question with inspectable sources and rejects a fake citation.

## Tuesday, November 3 — complete journey, trust, and polish

Outcome: judges understand PollPal as a one-stop election service and the demo survives external failures.

- Join dashboard, election page, timeline, actions, reminders, map, voting method, and ballot explorer into one flow.
- Add empty, unavailable, changed-date, stale-source, email-failure, and unsupported-election states.
- Accessibility pass: keyboard, focus, labels, contrast, map alternative, and reduced motion.
- Test small-phone and laptop layouts.
- Manually verify every visible date, official link, location, instruction, and time zone.
- Add privacy-safe telemetry for funnel stages and errors only.
- Add a deployed Playwright golden path using fixtures.
- Record a clean backup video including the received reminder email.
- Draft submission copy, architecture visual, and narration.
- If and only if the golden path is stable before midday, add calendar export or simple Voting Circle progress—not both.

Exit test: three people complete the flow without coaching and correctly describe PollPal as an election information/reminder hub, not a chatbot.

## Wednesday, November 4 — freeze and submit

Outcome: submit well before 6:00 PM Pacific.

- Fix only demo blockers, inaccurate information, privacy issues, and critical accessibility problems.
- Run unit, contract, RLS, build, and deployed browser checks.
- Verify production quotas, secrets, sending-domain health, Cron job history, and fixture fallback.
- Rehearse the six-minute demo with live, email-delayed, and network-failure branches.
- Capture final screenshots/video and complete the submission.
- Target submission by 3:00 PM Pacific, leaving three hours for portal or upload trouble.
- Tag the submitted commit and stop deployment unless the submitted build is broken.

## Feature cut line

Cut in this order if behind:

1. Voting Circle
2. voice and sample-ballot upload
3. Spanish localization
4. calendar export
5. OAuth providers beyond magic link
6. open-ended ballot questions beyond one reviewed example
7. map interaction polish while retaining an accessible location list

Do not cut upcoming-election discovery, the timeline, official links, real email reminders, voting locations, mail-return instructions, source dates, privacy boundaries, or the deterministic demo path.

## Suggested issue breakdown

### Foundation

- `FND-01` Scaffold and pin toolchain
- `FND-02` Environment validation and sensitive-data log redaction
- `FND-03` Amplify production deployment
- `FND-04` CI: lint, typecheck, unit, and build

### Elections and process

- `ELC-01` Jurisdiction and election domain types
- `ELC-02` Civic provider adapter
- `ELC-03` Official fixture and provenance model
- `ELC-04` Upcoming-election dashboard
- `ELC-05` Timeline and next-action logic
- `ELC-06` Official action center

### Locations and methods

- `LOC-01` Voting-location adapter and fixtures
- `LOC-02` Map and accessible list
- `LOC-03` Applicability, hours, and directions
- `LOC-04` Mail-return instructions

### Reminders

- `REM-01` Subscription, preference, schedule, and delivery schema
- `REM-02` Explicit grants and RLS policies
- `REM-03` Confirmation and unsubscribe flows
- `REM-04` Schedule materialization and deadline revision handling
- `REM-05` Cron-triggered Edge Function
- `REM-06` Resend delivery, idempotency, and retry
- `REM-07` Reminder and cross-user isolation tests

### Ballot explanations

- `BAL-01` Ballot availability states
- `BAL-02` Contest and measure UI
- `AI-01` Curated evidence pack
- `AI-02` Structured explanation and citation validation
- `AI-03` Neutrality/evidence audit

### Ship

- `SHIP-01` Accessibility and responsive pass
- `SHIP-02` Production golden-path test
- `SHIP-03` Backup email/video/screenshots
- `SHIP-04` Submission story and final verification

## Daily operating rhythm

- First 15 minutes: choose the day's single exit test.
- Midday: deploy the working slice, even if visually incomplete.
- Final 45 minutes: test production, update known risks, and record a short progress clip.
- No new infrastructure after Sunday.
- No new feature after Tuesday midday.
- Keep election, location, and email fixtures healthy at every commit.

## Definition of done

- Production URL works in a fresh browser.
- Demo location reveals the next election and at least one later election.
- Every deadline, instruction, and location exposes its official source and verification date.
- Registration and status-check actions route to the correct official websites.
- A real reminder can be scheduled, sent exactly once, observed, and unsubscribed.
- Mail voting explains both return methods and the distinction between recommended and legal deadlines.
- Ballot-unavailable and ballot-available states both work.
- The AI explanation contains inspectable evidence or clearly reports that evidence is insufficient.
- No exact address, email, registration status, vote choice, or secret appears in logs or analytics.
- Explicit Supabase grants and RLS isolation tests pass.
- Golden-path browser test and backup fixtures pass.
- Submission is complete and acknowledged by the portal.
