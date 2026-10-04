# FC-020 — Public marketing and support

**Status:** completed after pre-stage hardening validation.
`tasks/queue.json` FC-020 is `completed`.
**Branch:** `fc-020-public-marketing-support`
**Baseline:** `9874409e0136a35171b684b343755cd7be5940ee`
**No commit / no push / no PR / no deploy.**
**Figma remains READ-ONLY.**
**No Prisma schema change. No migration.**

## Frozen routes

- `/`
- `/how-it-works`
- `/for-founders`
- `/guidelines`
- `/privacy`
- `/terms`
- `/support`
- `/support/new?category=<type>`

Existing auth destinations remain `/signin` and `/signup`. This task
does not rebuild authentication.

## Figma refs used (read-only)

File key `e9oPuzTWFlrz5fmnEZ3ktV`.

- Home desktop `124:2`
- How It Works desktop `124:134`
- For Founders desktop `124:238`
- Home 1024 `126:207`
- How It Works 1024 `126:298`
- Home 390 `126:366`
- How It Works 390 `126:453`
- For Founders 390 `126:500`
- Marketing QA `127:3`
- Legal/support visual system from page 46, using the same marketing
  header/footer rather than a new language

Implementation adapts those frames into project primitives. Absolute
Figma-generated layout is not pasted into production.

## Public support API

`POST /v1/support/cases`

No public list, detail, or guessed-ID lookup.

Request allowlist:

```json
{
  "category": "account|application|safety|privacy|technical|other",
  "email": "...",
  "subject": "...",
  "message": "..."
}
```

Validation:

- category exact allowlist
- email trimmed/lowercased with existing auth `normalizeEmail`, valid,
  max 254
- subject trimmed, non-empty, max 160
- message trimmed, non-empty, max 5000, stored as plain text

Success: HTTP 201 `{ "caseId": "<id>", "status": "OPEN" }`.
The response does not echo the message.

`SupportCase` + first `SupportMessage` are created in one Prisma
transaction. If the first message insert fails, the case does not
commit.

## Session association

Optional. Uses `SessionService.inspect`, not `requireActiveMember`.

- Valid session, non-deleted user: `userId` set, server-known email,
  first message `actorType=USER`, `actorId=user.id`
- No valid session / deleted user / stale cookie: `userId=null`,
  validated submitted email, `actorType=GUEST`, `actorId=null`
- Suspended, unverified, and applicant accounts may file support

## Rate limit

- 5 submissions / 15 minutes
- Redis keys: `support-rate:v1:create:<hashed-client>` and
  `support-rate:v1:email:<hashed-email>`
- Client identity reuses `request.ip` + `hashRateLimitClient`
- Redis failure fails closed (HTTP 429)
- Raw IP is not persisted
- Support bodies are never used as rate-limit keys

## Origin / CSRF

`OriginGuard` on `POST /v1/support/cases` only.

## Legal review

**LEGAL REVIEW REQUIRED BEFORE PRODUCTION** for `/privacy` and `/terms`.

The public pages describe actual MVP product behavior. They do not
invent jurisdiction, DPO, street address, statutory legal bases,
retention durations, certifications, liability caps, arbitration, or
age thresholds.

## Pricing / access

**UNRESOLVED LAUNCH DECISION.** Public copy is only:

> Pricing and access details are not yet published.

Do not invent free-forever, paid plans, subscriptions, trials, prices,
or future billing promises.

## No fabricated traction

Sample request/ask content is labelled illustrative/example and stated
as fictional. No founder counts, country counts, logos, testimonials,
response-rate percentages, or schema.org AggregateRating.

## No schema / migration

Existing `SupportCase` and `SupportMessage` models are reused.

## Testing / validation

Focused:

- API `public-support`: 2 files, 8 passed
  - `public-support.unit.test.ts`
    - normalizes email and rejects unknown fields and oversize text
    - does not leave an orphan case when the first message insert fails
  - `public-support.integration.test.ts`
    - lets a guest create an OPEN case with a GUEST first message
    - associates a signed-in account and ignores a mismatched client email
    - does not require an ACTIVE member and still helps a suspended user
    - rejects invalid categories, unknown fields, and invalid text
    - requires OriginGuard and has no public list or detail browsing
    - allows five submissions and rejects the sixth in the abuse window
- Web: 2 files, 7 passed
  - `marketing.test.tsx` (4)
  - `support.test.tsx` (3)
- UI `components.test.tsx`: included in the 8 UI tests

Phase A `npm run validate` (queue still pending):

- format/lint/typecheck green
- API 33 files / 319 tests
- Web 18 files / 172 tests
- UI 1 file / 8 tests
- contracts/test-utils: passWithNoTests
- build green, including `/`, `/how-it-works`, `/for-founders`,
  `/guidelines`, `/privacy`, `/terms`, `/support`, `/support/new`,
  `/robots.txt`, `/sitemap.xml`
- `npx prisma validate` valid
- `git diff --check` clean
- `git diff -- prisma/schema.prisma` empty
- `git diff -- tasks/queue.json` empty before the completion flip
- index empty

Incidental test harden (not product):
`admin-ops.integration.test.ts` now continues after the last-SUPER_ADMIN
race with whichever remaining SUPER_ADMIN actor won, so a later disable
does not use a revoked cookie.

Hardening Phase A `npm run validate` (queue pending):

- format/lint/typecheck/build green
- API 33 files / 326 tests
- Web 18 files / 172 tests
- UI 1 file / 8 tests
- Prisma schema valid, schema diff empty, no migrations

Completed-state `npm run validate` after the queue flip:

- API 33 files / 326 tests
- Web 18 files / 172 tests
- UI 1 file / 8 tests
- format/lint/typecheck/build green
- Prisma schema valid, schema diff empty, no migrations
- Queue diff is only FC-020 pending → completed versus HEAD
- Nothing staged, committed, or pushed

## Pre-stage hardening

- Optional session: no cookie skips `inspect`. Only
  `AUTH_ERROR_CODES.sessionExpired` becomes guest. Unexpected inspect
  errors propagate.
- Authenticated candidate is locked with `lockUser(tx, userId)` **before**
  SupportCase/SupportMessage writes. Identity is decided from the locked
  re-read + `isDeletedAccount`. Deleted users become guest with the
  submitted email.
- Redis email/IP rate limits stay outside the User lock.
- Success copy uses “email associated with this support request”.
- Unit transaction test verifies same-callback construction only. Prisma
  `$transaction` still provides atomic rollback; no test-only production
  hook was added for a real-DB first-message failure.
- Rate-limit tests use unique emails and delete only this suite’s
  `support-rate:v1:create:*` and `support-rate:v1:email:*` keys.

Concurrent deletion-before-identity-decision is not forced with
`Promise.all` + sleeps. The repo has no `pg_locks` wait harness, and
adding a production test hook or schema trigger is out of scope. Deleted
re-read is covered by a focused service test and an integration test
that leaves a session on an already-deleted User.

## TODOs

- Legal review of `/privacy` and `/terms` before production
- Pricing/access decision remains unpublished
- `/signin` and `/signup` remain existing destinations; this task does
  not add those pages
- FC-021 owns the full E2E/responsive matrix
