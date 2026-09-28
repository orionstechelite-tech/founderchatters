# AGENTS.md — FounderChatters

This file is the primary instruction set for autonomous coding agents working on FounderChatters.

# Figma Design Source of Truth

FounderChatters Figma file:
https://www.figma.com/design/e9oPuzTWFlrz5fmnEZ3ktV

Figma file key:
e9oPuzTWFlrz5fmnEZ3ktV

The Figma MCP server is connected and MUST be used for UI implementation.

## Figma usage policy

For any frontend, UI, responsive, interaction, or visual task:

1. Read the relevant authoritative Figma frame through Figma MCP before coding.
2. Inspect the canonical desktop frame.
3. Inspect the corresponding responsive/mobile source where one exists.
4. Inspect the canonical component/design-system source.
5. Read the Responsive Completion contract before making responsive decisions.
6. Implement from those sources instead of guessing from screenshots or prose.

Do NOT modify the Figma file unless the human explicitly asks for a Figma change.

Treat Figma as READ-ONLY during normal engineering implementation.

If implementation reveals a design ambiguity:
- do not silently invent new product behavior,
- document the ambiguity,
- create a QA/design issue,
- continue only where the approved responsive/design contracts are sufficient.

## Design priority

For responsive implementation:

1. Exact breakpoint-specific Figma frame
2. Approved pattern in 49 — Responsive Completion
3. Responsive Behavior Matrix
4. Canonical desktop design

Never hide required product information merely to make the screen fit.

## Primary Figma source pages

05 — Foundations
06 — Components
10 — Marketing Website
11 — Authentication
12 — Application
13 — Onboarding
20 — Home
21 — Requests
22 — Discover
23 — Founder Profiles
24 — Messages
25 — Reputation
26 — Notifications
27 — Settings
30 — Trust & Safety
32 — Admin Operations
33 — Admin Operational States
34 — Admin QA & Responsive
35 — MVP Freeze & Coverage
40 — Empty & System States
41 — Mobile
42 — Core Interaction States
43 — Recovery & Safety States
44 — Member QA & Responsive
45 — Member Edge & Validation States
46 — Legal & Public Utility
47 — Build Acceptance & QA
48 — Marketing QA & Responsive
49 — Responsive Completion
50 — Prototype
51 — Developer Handoff

Do not implement from:
31 — Admin · Legacy / Superseded
99 — Archive / Old Wireframes
or any frame explicitly named LEGACY / Do Not Implement.

## 1. Mission

Build the frozen FounderChatters MVP faithfully:

> A global founder-to-founder support network where founders ask for help, share what they know, make useful introductions, continue conversations, thank helpers, and build topic-specific contribution reputation.

Core loop:

`ASK → DISCOVER → HELP → CONVERSATION → THANK → REPUTATION`

## 2. Scope discipline

### In MVP
- Public marketing site
- Authentication and email verification
- Founder application / review
- Onboarding
- Founder profile
- Structured requests
- Discover/search/filter
- Request responses / help offers
- Consent-based introductions
- 1:1 request-linked messaging
- Notifications
- Help confirmation / thank-you
- Topic-specific contribution history
- Saved founders
- Settings/privacy/security
- Reporting/blocking
- Public support
- Admin operations, RBAC, audit, moderation, application review, taxonomy, notification delivery, system health

### Out of MVP
- Social feed
- Stories/reels
- Follower/following system
- Likes
- Generic content publishing
- Events
- Jobs marketplace
- Fundraising/investor marketplace
- Paid communities
- Courses
- Groups/spaces
- Company pages
- Native video
- AI user-facing features
- Billing/subscriptions
- Advanced recommendation engine
- CRM/marketing automation
- Mobile Admin

Do not add out-of-scope features without explicit human approval.

## 3. Responsive implementation priority

1. Exact breakpoint-specific Figma frame
2. Approved responsive pattern on `49 — Responsive Completion`
3. Responsive Behavior Matrix
4. Canonical desktop frame

Do not invent a new mobile interaction pattern if an approved one exists.
Do not hide product information merely to make layouts fit.
If ambiguity remains, create a QA issue.

## 4. Frontend rules

- Next.js App Router
- TypeScript strict mode
- Tailwind using design tokens mapped from Figma foundations
- Reusable components before route-specific duplication
- 44px minimum interactive target on touch layouts
- Visible focus states
- Text status must not rely on color alone
- Loading, empty, filtered-zero, error, permission-denied are distinct states
- User input/drafts must survive recoverable errors whenever technically possible
- Member mobile navigation follows existing Figma bottom-nav pattern
- Admin is 1440 canonical + 1024 supported; under ~900px show the approved unsupported-small-screen state

## 5. Backend rules

- NestJS modules by bounded domain
- PostgreSQL is source of truth
- Prisma migrations are reviewed artifacts
- Redis only for cache, rate limit, ephemeral sessions/jobs; never authoritative business state
- Mutations must be idempotent where retries are expected
- Sensitive state changes write immutable audit entries
- Soft delete moderation records where history must be retained
- Account deletion follows anonymization contract; do not silently hard-delete integrity records

## 6. Security/privacy rules

- Passwords: Argon2id
- Sessions: server-side session records, secure HttpOnly cookies
- Rotate sessions after password change and other sensitive account events
- CSRF/origin protection on unsafe browser mutations
- Rate limit auth, messaging, reporting, support and public forms
- Never log passwords, reset tokens, auth cookies, private message bodies, or provider secrets
- Private DMs are not globally browseable by Admin
- Safety access to message evidence must be report-scoped and audited
- Intro contact details are never exposed without consent
- Reporter's identity is protected from the reported member

## 7. Reputation rule

A contribution record may only be created when:
- there is a real help interaction tied to a request, AND
- the requester explicitly confirms that the help was useful.

`STILL_TALKING` does not create reputation.
`NOT_HELPFUL` does not create reputation.
Admins do not manually edit contribution scores because there is no editable score.

## 8. Work execution

Before starting a task:
- read its task file / queue entry
- inspect dependent completed tasks
- verify Figma source IDs
- state assumptions in the PR/task log
- do not broaden scope

After implementation:
- run unit tests
- run route/component tests
- run responsive checks where applicable
- run Playwright for changed golden paths
- record migration/schema changes
- update task status only after acceptance passes

## 9. Approval gates

Human approval required before:
- production deployment
- destructive production migration
- changing public privacy/terms semantics
- changing auth/session security model
- introducing new external providers with persistent data
- changing frozen product behavior
- deleting/anonymizing real user data
- enabling any admin capability that broadens access to private content

## 10. Branch/commit discipline

Recommended:
- task branch: `fc/<task-id>-short-name`
- small focused commits
- no unrelated refactors inside feature tasks
- migrations committed with schema changes
- generated clients committed only if repository policy requires it
