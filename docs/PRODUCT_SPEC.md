# PollPal product specification

## One-line pitch

PollPal puts every election, deadline, voting location, official action, and ballot explanation relevant to a voter in one place.

## Product summary

PollPal is a personalized election information and planning website. After a user enters their location, PollPal finds upcoming elections that apply to them—from local and special elections through state and federal contests—and builds a trustworthy timeline of what happens next.

The website explains the voting process, links to the correct official sites for registration and status checks, shows when ballots are mailed and due, maps polling places and ballot drop boxes, explains how to return a ballot, and sends personalized email reminders. Once ballot information becomes available, users can explore candidates and measures and ask source-backed questions in plain language.

AI is supporting infrastructure, not the product's personality. The primary experience is a clear election dashboard, timeline, map, and action center—not a chatbot.

## Why this should exist

Election information is fragmented across state, county, city, and third-party websites. A voter may need one site to register, another to check status, a PDF for dates, a county page for drop boxes, and separate research for every ballot item. Local and special elections are especially easy to miss.

PollPal solves the continuity problem:

- discover the election before a ballot exists;
- understand every deadline and official action;
- receive reminders at the right moments;
- choose a voting method and find the correct location;
- understand the ballot when it becomes available;
- complete the process without relying on memory or scattered browser tabs.

## Target user

The primary user is a US voter aged 18–29 who uses a phone as their main device, may be voting for the first time or in a new jurisdiction, and does not regularly monitor local election websites.

The first demo locale should be a jurisdiction the team can verify manually. The architecture can support national expansion, but the hackathon demo should be complete and accurate for one real locality rather than shallow everywhere.

## Jobs to be done

1. “Tell me the next election I am eligible to participate in.”
2. “Show me every deadline and explain what I need to do.”
3. “Take me to the correct official site to register or check my status.”
4. “Remind me when registration, ballots, early voting, and Election Day are approaching.”
5. “Show me where and how I can cast or return my ballot.”
6. “When my ballot is available, help me understand its candidates and measures.”

## Primary journey

`Location → upcoming elections → election timeline → official actions → reminders → voting method and locations → ballot explorer → sourced questions → completion`

## Core feature 1: My Elections

After entering a residential address, ZIP code, or saved jurisdiction, the user receives an election dashboard organized around the next election.

The dashboard shows:

- election name, jurisdiction, type, and date;
- whether it is local, county, state, special, primary, or federal;
- the next action and its deadline;
- registration and status-check links;
- ballot availability status;
- voting methods;
- reminder subscription status;
- last-verified date and official source.

Requirements:

- Explain why a precise address may be needed before asking.
- Process an exact address through a protected server route.
- Do not persist the raw street address by default.
- Persist normalized jurisdiction and district identifiers only after consent.
- Never infer eligibility from an address alone.
- Clearly distinguish confirmed election information from estimated or unavailable information.
- Provide a known-good demo location for judges.

## Core feature 2: Election Timeline and Action Center

Every election has a chronological timeline. Each milestone includes a plain-language explanation, official source, last-checked time, and action when applicable.

Potential milestones:

- registration deadline;
- party-affiliation or address-change deadline;
- mail-ballot request window;
- expected ballot-mailing start;
- ballot tracking availability;
- early-voting opening and closing dates;
- recommended mail-back date;
- official mail-ballot receipt or postmark deadline;
- Election Day and poll hours;
- cure or provisional-ballot follow-up deadline when published.

The action center links users to official government pages for:

- registering to vote;
- checking registration status;
- updating name or address;
- requesting a mail ballot;
- tracking a ballot;
- viewing ID and eligibility requirements;
- contacting the appropriate election office.

PollPal must never imply that an official action was completed merely because the user followed a link.

## Core feature 3: Email Reminders

Email reminders are a core part of the product, not stretch scope.

Users can subscribe to all reminders or choose individual categories:

- election announced or added;
- registration deadline approaching;
- mail-ballot request deadline;
- ballots begin mailing;
- ballot should have arrived;
- early voting opens or closes;
- recommended date to mail a completed ballot;
- Election Day approaching;
- final return deadline.

Every reminder includes:

- the election and jurisdiction;
- the relevant date and local time zone;
- a concise next action;
- an official source link;
- a link back to the PollPal timeline;
- notification preferences and one-click unsubscribe.

Reminder rules:

- Never invent a date that the jurisdiction has not published.
- Label expected ballot-arrival dates as estimates.
- Store the source and source revision used to generate each reminder.
- Make sending idempotent so a retry cannot produce duplicate email.
- Keep a delivery log without storing unnecessary political behavior.
- Recompute future reminders if an official deadline changes.

## Core feature 4: Voting Method and Location Finder

The user selects mail, early in-person, or Election Day voting. PollPal then shows the relevant instructions and places.

For in-person voting:

- polling place or vote center name;
- address, distance, hours, and applicable dates;
- accessibility and language information when officially supplied;
- directions link;
- whether the location is assigned or any eligible voter can use it;
- official source and last-verified date.

For mail voting:

- request requirements when applicable;
- official instructions for completing and sealing the ballot;
- postage rules;
- mailing address or permitted return methods;
- recommended mail-back date versus legal receipt/postmark deadline;
- nearby ballot drop boxes and hours;
- official ballot-tracking link.

PollPal must avoid promising that a location applies to a voter unless the election authority data supports that conclusion.

## Core feature 5: Ballot Explorer

When ballot data becomes available, PollPal adds candidates and measures to the election page. Before that point, the UI says when ballot information is expected and lets the user subscribe for an alert.

Users can:

- browse contests and measures;
- read plain-language office and measure explanations;
- choose suggested questions;
- ask a question in their own words;
- compare positions using dated evidence;
- inspect the evidence behind each material claim.

Source categories remain visibly distinct:

1. Election official / government record
2. Candidate or campaign statement
3. Verified legislative or voting record
4. Independent reporting or nonpartisan research
5. AI synthesis

If the evidence is incomplete or incomparable, PollPal says so. It never recommends, ranks, endorses, or predicts candidates.

## Supporting feature: Voting Plan

A user can save their chosen voting method, target date, location, and checklist. The plan connects the election timeline to a concrete personal commitment and can be exported to a calendar.

Completion is self-reported. PollPal does not claim access to the official voter file or verify whether a ballot was cast.

## Supporting feature: Voting Circle

Privacy-conscious social accountability remains valuable but is not required for the hackathon MVP. If built, friends share only progress such as `planning`, `ready`, or `done`. They never share selections, exact addresses, registration status, or official voting records.

## Meta AI role

Muse Spark should improve clarity and coverage without turning PollPal into a bot:

- convert complex official instructions into plain-language explanations while retaining the original link;
- reconcile multiple official pages into a structured election timeline;
- flag missing, inconsistent, or stale information for review;
- help answer voter questions about the process using only the supplied official evidence;
- create source-backed candidate and measure explanations once ballots exist;
- run a second-pass citation and neutrality audit.

Date calculations, reminder scheduling, legal deadlines, and location eligibility are deterministic application logic. The model may explain those facts but must not create them.

## MVP scope

### Must ship

- One verified real jurisdiction with deterministic fixture fallback
- Upcoming-election dashboard spanning at least two election levels in fixture data
- Election timeline with official sources and last-verified dates
- Registration and status-check action links
- Real opt-in, preference management, unsubscribe, and at least one delivered email reminder
- Voting-method instructions
- Map/list of polling places or drop boxes
- Ballot availability state
- One source-backed ballot explanation or Q&A example
- Mobile-first accessible UI
- Deployed demo and backup recording

### Should ship

- Magic-link authentication after the user has seen their dashboard
- Calendar export
- Ballot-arrival notification
- Location filtering and directions
- Cached, reviewed ballot explanation for the demo contest
- Privacy-safe error and funnel telemetry

### Stretch

- Voting Circle
- Voice questions
- Sample-ballot photo or document matching
- Spanish UI
- Push or SMS notifications
- Nationwide ingestion beyond the demo region

### Non-goals for the hackathon

- Submitting voter registration forms
- Querying or storing private official registration records
- Ballot marking or vote casting
- Verifying that someone voted
- Personalized candidate recommendations
- Public political profiles or feeds
- Scraping every US election authority during the event

## Success measures

Hackathon demo success:

- A user finds their next election in under 30 seconds.
- The user can identify the next required action without opening another page.
- All logistics show an official source and last-verified time.
- A real reminder email arrives during the demonstration or a prerecorded delivery is available as backup.
- The user can locate a valid return or voting option in under one minute.
- Ballot Q&A never produces an unsupported material claim.
- The golden path succeeds three times consecutively on the deployed build.

Early product measures:

- location-to-election-dashboard completion;
- reminder opt-in and delivery success;
- official-action link clicks;
- location or directions opens;
- election page return rate across lifecycle milestones;
- ballot-explanation engagement;
- self-reported completion and user-reported clarity.

## Demo narrative

1. “Election information is scattered across government pages and most tools only appear when a major election is already close.”
2. Enter the demo location and reveal the next local election plus later state/federal elections.
3. Open the next election and show the complete timeline, current next action, and official sources.
4. Follow the official registration-status link, then return to PollPal.
5. Subscribe to registration, ballot-mailing, and Election Day reminders; show the delivered email.
6. Select vote by mail and display return instructions and nearby drop boxes on the map.
7. Show the “ballot not available yet” state and the alert the user will receive.
8. Switch to the fixture state after ballot release, open one measure or local race, and ask a sourced question.
9. Close with: “PollPal gives you one trusted place to discover the election, understand every step, and follow through.”
