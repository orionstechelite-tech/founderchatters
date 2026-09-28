# FC-009 — Onboarding

**Status:** implemented; queue remains `pending` until security review and full validation pass.
**Branch:** `fc-009-onboarding`
**No commit / no push.**

## Four steps

| Step | Heading | Collects | Persist |
| --- | --- | --- | --- |
| 1 | What are you building? | Display name, company, industry, stage, city, country, one-line description | `PUT /v1/me/profile` |
| 2 | What can you help another founder with? | Taxonomy chips + optional custom expertise | `PUT /v1/me/expertise` |
| 3 | What do you need help with right now? | Required current-need prose + optional common areas | `PUT /v1/me/needs` |
| 4 | You’re ready to enter the network. | Preview of persisted data | `POST /v1/me/onboarding/complete` |

Actions:

- Step 1: Continue, Skip for now
- Steps 2–3: Continue, Back
- Step 4: Enter FounderChatters (Ask the community is deferred)

## Figma sources (read-only)

- Step 1 desktop: `19:2` (form `19:11`)
- Step 2 desktop: `19:40`
- Step 3 desktop: `19:88`
- Step 4 desktop: `19:129`
- Mobile pattern: `67:53`
- Responsive matrix: `135:69`–`135:73`

390 uses the 67:53 layout pattern for **all** steps. Chip **data** is the desktop union, not the compact seven-chip subset.

## Approved frozen-design deviations

1. Step 1 collects **Display name** (required for completion; not on frame `19:2`).
2. Figma Location is implemented as grouped **City** + **Country** (FC-007 pattern).
3. Step 4 **Ask the community** CTA is not implemented. Deferred to FC-011 with `/ask`.
4. No avatar upload. Step 4 shows initials generated in the UI from displayName. `avatarUrl` stays null.
5. Mobile shows the full canonical taxonomy, not only the seven chips on `67:53`.

## Display name

`FounderProfile.displayName` remains required in Prisma.

- Collected on Step 1
- Trimmed, collapsed whitespace, 2–100 characters
- Never derived from email, company, or placeholders
- Skip for now does not fabricate a name
- Completion and Step 4 send the user back to Step 1 if it is still missing

## Application prefill

FounderApplication is immutable admission history. Prefill only:

| Application | Profile / company |
| --- | --- |
| companyName | Company.name |
| website | Company.website |
| buildingSummary | Company.description |
| city | FounderProfile.city and Company.city |
| country | FounderProfile.country and Company.country |
| roleTitle | Step 4 preview only (`applicationRoleTitle`) |

Onboarding edits never write back to FounderApplication.

## Skip for now

- Does not complete onboarding
- If displayName is present, persists Step 1 (optional industry/stage may stay blank)
- If displayName is absent, advances without creating a profile
- Company.name still comes from the approved application when the founder does not edit it
- GET `/me/profile` returns application prefill until a profile exists

## Schema migration

`prisma/migrations/20260929013000_onboarding_profile_fields`

```sql
ALTER TABLE "FounderProfile" ADD COLUMN "customExpertise" TEXT;
ALTER TABLE "FounderProfile" ADD COLUMN "currentNeedText" TEXT;
ALTER TABLE "Company" ADD COLUMN "industry" TEXT;
```

No other schema changes. Historical migrations untouched.

## Profile / company persistence

`GET` / `PUT /v1/me/profile`

Profile fields: displayName, city, country
Company fields: name, website, description, stage, city, country, industry

Safe upsert on `userId` / `founderProfileId`. Concurrent first saves resolve to one profile and one company.

## Industry and stage

- `Company.industry` optional string (new column)
- `Company.stage` optional free-text matching Figma (“Pre-launch / MVP” is placeholder copy, not an enum)
- Neither required for completion

## Expertise

`PUT /v1/me/expertise` `{ topicIds, customExpertise }`

- Atomic replace of `FounderExpertise` + `customExpertise` in one transaction
- Topic IDs only; duplicates rejected; inactive/merged IDs rejected (no silent rewrite)
- Custom text: trim, max 120, blank → null, **never** creates `TaxonomyTopic`
- Meaningful selections: each topic + non-empty custom count as 1; total **1–5**

## Needs

`PUT /v1/me/needs` `{ topicIds, currentNeedText }`

- Atomic replace of `FounderNeed` + `currentNeedText`
- `currentNeedText` required, 20–500 characters
- Topic chips optional, **0–3**
- Prose is not a taxonomy row

## Taxonomy canonical labels / slugs

Union of desktop Step 2 + Step 3, upserted by slug, labels not overwritten on rerun:

| slug | label | used by |
| --- | --- | --- |
| b2b-sales | B2B sales | expertise |
| marketplace-gtm | Marketplace GTM | expertise |
| product | Product | both |
| engineering-hiring | Engineering hiring | expertise |
| fundraising | Fundraising | both |
| operations | Operations | expertise |
| india-market | India market | expertise |
| travel-mobility | Travel / mobility | expertise |
| growth-marketing | Growth marketing | expertise |
| partnerships | Partnerships | expertise |
| pricing | Pricing | both |
| founder-operations | Founder operations | expertise |
| gtm | GTM | needs |
| hiring | Hiring | needs |
| tech | Tech | needs |
| introductions | Introductions | needs |
| market-entry | Market entry | needs |

Seed: explicit only. HTTP handlers and AppModule never upsert taxonomy.

- Helper: `apps/api/src/onboarding/taxonomy-seed.ts` (`ensureOnboardingTaxonomy`)
- Operational command: `npx prisma db seed` (configured in `prisma.config.ts` as `npx tsx prisma/seed.ts`)
- Tests call the helper in `beforeAll`
- Idempotent upsert by slug; `update: {}` so admin-edited labels are not overwritten
- Does not create topics from `customExpertise` / `currentNeedText`
- No founder/user rows

GET `/me/profile` is read-only and must not change `TaxonomyTopic` rows.

## Post-completion writes

After `User.onboardingCompletedAt` is set:

- GET `/me/profile` remains readable
- POST `/me/onboarding/complete` remains idempotent
- PUT `/me/profile`, PUT `/me/expertise`, PUT `/me/needs` return `AUTH_FORBIDDEN`

Later profile editing belongs to FC-010.

## Completion

`POST /v1/me/onboarding/complete` is **idempotent**.

Required:

- authenticated ACTIVE user, verified email, APPROVED application
- FounderProfile with non-empty displayName
- Company with non-empty name
- ≥1 meaningful expertise
- currentNeedText 20–500

Not required: industry, stage, website, avatar, headline, bio, need chips.

Server sets `User.onboardingCompletedAt`. Repeat calls return the original timestamp. Concurrent completes share one timestamp. Application status, submittedAt, decidedAt, and FC-008 audit are unchanged.

## Access state

- APPROVED + incomplete → `ONBOARDING`
- APPROVED + complete → `ACTIVE`
- `/onboarding` redirects ACTIVE users to `/home`
- `/home` is a **minimal ACTIVE gate**, not FC-010 Home / Discover. It only checks `/auth/session` and shows a transitional signed-in landing. No member feed, fake founders, or requests.

`assertActiveMember` is the reusable server helper. No placeholder member feature pages.

## Authorization

All `/me/profile`, `/me/expertise`, `/me/needs`, `/me/onboarding/complete` routes require session, ACTIVE account, verified email, APPROVED application.

OriginGuard on all mutations. GET is read-only and side-effect free. Explicit field whitelist. Prisma `select` only.

Test timeouts (test-only, documented in vitest configs):
- `apps/api/vitest.config.ts`: `hookTimeout` 60s / `testTimeout` 15s because parallel Nest integration files share one Postgres and default 10s hooks fail bootstrap
- `apps/web/vitest.config.mts`: `testTimeout` 15s because axe + multi-step userEvent exceeds the 5s default
- FC-008 `application-review` no longer has a file-level hook timeout; it uses the suite config

## Deferred

- FC-010 public profile, discover, saved founders, settings profile editing
- FC-011 `/ask` and the Step 4 Ask the community CTA
- Avatar upload
- FC-019 admin taxonomy
