# PollPal

PollPal is a one-stop election information website that tells people which elections are coming up, what they need to do, where they can vote, and when each step is due.

It is being designed for the 2026 Meta Global AI Developer Hackathon under the **Build for Your World** theme.

## The six-minute demo

1. Enter a location and see the next relevant local, county, state, and federal elections.
2. Open an election timeline with registration, ballot-mailing, early-voting, mail-back, and Election Day milestones.
3. Follow official links to register, check registration status, or request and track a mail ballot.
4. Subscribe to personalized email reminders and receive a real reminder email.
5. Find nearby polling places, vote centers, and ballot drop boxes with official hours and directions.
6. When ballot data is available, explore candidates and measures and ask a source-backed question.

PollPal does not register people, verify official registration status, cast ballots, recommend candidates, or claim that a person voted.

## Product principles

- **The next action is always clear:** every election page says what to do now and what comes next.
- **Official sources lead:** registration, deadlines, locations, and voting rules point to election authorities.
- **Complete election lifecycle:** discovery starts before ballots exist and continues through ballot return.
- **Private by default:** exact addresses, registration status, and ballot interests are not social or analytics data.
- **AI supports the product:** AI organizes and explains verified information; it is not the product's identity.
- **Uncertainty is visible:** unavailable, estimated, or conflicting information is never presented as settled fact.

## Proposed stack

- Next.js 15 App Router, React, and TypeScript
- Tailwind CSS and shadcn/ui
- Supabase Postgres, Auth, Row Level Security, Cron, and Edge Functions
- Resend for transactional reminder email during the hackathon
- Google Civic Information API plus official state and local election sources
- Mapbox for geocoding and location maps
- Meta Model API with Muse Spark 1.3 for sourced ballot explanations
- AWS Amplify Hosting for the Next.js application
- Vitest, Testing Library, and Playwright

## Planning documents

- [Product specification](docs/PRODUCT_SPEC.md)
- [Architecture and data model](docs/ARCHITECTURE.md)
- [Six-day build plan](docs/BUILD_PLAN.md)

## Status

Planning. Development is scheduled to begin October 30, 2026.
