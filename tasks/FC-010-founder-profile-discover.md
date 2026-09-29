# FC-010 — Founder Profile & Discover

**Status:** implemented locally; `tasks/queue.json` remains `pending` until
security review and the requested validation gates pass.
**Branch:** `fc-010-founder-profile-discover`
**No commit / no push / no PR.**
**Figma remains READ-ONLY.**
**No Prisma schema change. No migration.**

FC-011, FC-013, FC-014, FC-016, and FC-019 are not implemented here.

## Figma sources (read-only)

- Discover desktop: `46:2`
- Discover mobile: `38:65`
- Founder profile desktop: `47:4`
- Founder profile mobile: `38:99`
- Responsive policy: `docs/07-responsive-implementation-policy.md`

## Approved product decisions

### Founder identifier

All member founder routes and APIs use `User.id`:

- `GET /v1/founders/:id`
- `POST /v1/founders/:id/save`
- `DELETE /v1/founders/:id/save`
- `/founders/[id]`

`:id` is `User.id`. `FounderProfile.id` is never the public/member identity.
Bottom-nav Profile is `/founders/{authenticated User.id}`.

### Discover self behavior

`GET /v1/founders` excludes the authenticated caller.

The caller may still open their own eligible profile at:

- `/founders/{currentUser.id}`
- `GET /v1/founders/{currentUser.id}`

### Ordering

Default deterministic ordering:

1. `FounderProfile.displayName ASC`
2. `User.id ASC`

Do not rank by followers, saves, contributions, engagement, profile views,
recency, popularity, or any hidden social score.

### Pagination / bounds

`page` and `pageSize` for `GET /v1/founders` and `GET /v1/me/saved-founders`.

- `page` is 1-based and must be `>= 1`
- default `pageSize` = 20
- maximum `pageSize` = 50
- `q` max length = 100
- malformed/out-of-bounds query input is rejected with `FOUNDER_INVALID_QUERY`

Pagination metadata: `page`, `pageSize`, `total`, `totalPages`.

### Search semantics

`q` is trimmed, case-insensitive CONTAINS matching on member-visible fields
only, via Prisma parameterization (no raw SQL concatenation):

- `FounderProfile.displayName`
- `Company.name`
- `FounderProfile.city` / `country`
- `Company.city` / `country` / `industry` / `stage`
- active, non-merged expertise `TaxonomyTopic.label`
- `FounderProfile.customExpertise`

Do **not** search `currentNeedText`, email, application fields (including
`roleTitle` and notes), admin/security fields, or future contribution data.

### Filters and AND semantics

Approved query params, one value per dimension:

- `country`
- `industry`
- `stage`
- `expertiseTopicId`
- `saved`

Across dimensions: **AND**.

Text filters are trimmed, non-empty, bounded by existing onboarding limits,
and case-insensitive exact match.

`expertiseTopicId` must be a stable active `TaxonomyTopic.id` with
`mergedIntoId = null`. Inactive/merged IDs are rejected.

`saved`:

- `true` | `false` only
- `saved=true` restricts to founders saved by the authenticated caller
- `saved=false` means **no saved restriction** (same as omitting `saved`).
  It is not an “unsaved-only” filter.

Figma chips (UAE, Marketplace, Seed, B2B sales, Travel, Saved) are
presentation examples, not backend category types. Wired chips:

- All founders → clear filters
- UAE → `country=UAE`
- Marketplace → `industry=Marketplace`
- Seed → `stage=Seed`
- B2B sales → `expertiseTopicId` of the active topic labeled `B2B sales`
- Saved → `saved=true`

**Travel is not wired.** The taxonomy label is `Travel / mobility`, which is
not an exact map to `Travel`.

### Inactive / merged taxonomy

Historical `FounderExpertise` / `FounderNeed` rows may remain stored.

Member-visible FC-010 behavior:

- omit inactive topics
- omit merged topics (`mergedIntoId != null`)
- exclude them from search and filter options
- do not expose them on public/member profile expertise
- do not rewrite historical relations
- do not auto-map to `mergedIntoId`

GET requests are read-only and never seed taxonomy.

### Self-save

Saving yourself is forbidden.

`POST /v1/founders/{currentUser.id}/save` returns `409 FOUNDER_INVALID_SAVE`.
No `SavedFounder` self-relation is created. Own profile has no Save CTA.

### Unavailable founder privacy

A member-visible target must satisfy all of:

- `User.status = ACTIVE`
- `deletedAt` is null
- `emailVerifiedAt != null`
- `onboardingCompletedAt != null`
- `suspendedUntil` is null or in the past
- `FounderApplication.status = APPROVED`
- `FounderProfile` exists
- `Company` exists

Discover omits ineligible targets.

`GET /v1/founders/:id`, save, and unsave use one safe not-found response
(`404 FOUNDER_NOT_FOUND`, “That founder is not available.”) for nonexistent,
suspended, deleted, unverified, unapproved, onboarding-incomplete, missing
profile, or missing company. The failing condition is never revealed.

Corrupt ACTIVE members missing profile or company are omitted / 404 the same
way. No invariant details leak to clients.

### Stale saved rows

`GET /v1/me/saved-founders` and Discover `savedCount` include only currently
member-visible targets. Stale `SavedFounder` rows are **not** deleted merely
because the target is temporarily unavailable. Stale profile payloads are
never returned.

### Future CTA boundary

Not implemented: Message, Ask for help, request/conversation creation, or
fake message/request modals.

On another founder’s profile: only Save founder / Saved.
On own profile: omit Save, Message, and Ask-for-help.

Member navigation:

- Home → `/home`
- Discover → `/discover`
- Profile → `/founders/{currentUser.id}`
- Ask and Messages remain visually present and `aria-disabled` until their
  owning tasks. No fake `/ask` or `/messages` pages.

### Contribution / reputation

FC-014 owns contribution/reputation. FC-010 omits:

- CONTRIBUTION section
- RECENT CONTRIBUTIONS
- founders-helped / introduction counts
- trusted-for summaries
- thank-you quotes
- zero placeholders

`memberSinceYear` is derived from `User.onboardingCompletedAt` UTC year.
The raw onboarding timestamp is not exposed.

`Company.website` may appear in the member profile JSON. FC-010 does not
render it as a clickable link, so javascript:/data: navigation is not
introduced here.

### Profile editing

FC-010 does not create a profile editor. Post-completion
`PUT /v1/me/profile`, `/expertise`, and `/needs` remain blocked.

The FC-010 profile is member-visible and read-only.

### Profile field mapping

Real persisted data only:

- Hero: `displayName`, `avatarUrl` or initials fallback, `headline` only if
  stored, `Company.name`, location, industry, stage, `Company.description`
  as the company/hero summary when present
- Do not fabricate `Founder at {company}`
- Do not read `FounderApplication.roleTitle`
- ABOUT: `bio` only when non-empty; omit ABOUT otherwise
- Do not duplicate `Company.description` into ABOUT
- CAN HELP WITH: active non-merged expertise + non-empty `customExpertise`
- CURRENTLY LOOKING FOR: non-empty `currentNeedText`; active/non-merged need
  labels may be shown
- Avatar: real `avatarUrl` or initials; no upload; no persisted generated
  avatar

### Origin / CSRF and mass assignment

`OriginGuard` on POST/DELETE save. GET endpoints have no mutation
requirement and no side effects.

Saver identity comes from the session. No request body is accepted for
save/unsave. Unknown bodies cannot set `saverId`, `savedFounderId`,
`userId`, `profileId`, `companyId`, `createdAt`, or other ownership fields.

### Data minimization

Discover, profile, and saved responses do not expose email, passwordHash,
sessions, `emailVerifiedAt`, `User.status`, suspension fields, `deletedAt`,
raw `onboardingCompletedAt`, FounderApplication, review notes, admin roles,
permissions, tokens, or audit logs. `User.id` is intentionally the route
identity. Taxonomy topic IDs may be returned where needed.

## Approved frozen-design deviations

1. Message and Ask-for-help CTAs are omitted from founder profile (FC-011 /
   FC-013).
2. Contribution / recent contributions / help counts are omitted (FC-014).
3. Hero title is stored `headline` or `displayName`, never a fabricated
   “Founder at {company}” line.
4. Travel quick chip is not wired because it does not exactly match an
   approved filter value or taxonomy label.
5. Desktop Profile nav item remains CSS-hidden until 768; desktop uses the
   avatar control to `/founders/{viewer User.id}`.
6. Ask/Messages stay in the five-destination nav but are non-interactive.
7. Native `<dialog showModal()>` is the filter sheet. jsdom tests polyfill
   `open`/`close` and cannot prove inert backdrop or full focus trapping;
   production relies on the browser modal dialog.

## Schema / migration

**NO schema change. NO migration.** `SavedFounder` already exists.

## API contracts

See `packages/contracts` (`DiscoverFoundersResponse`,
`MemberFounderProfileResponse`, `SavedFoundersResponse`,
`SavedFounderMutationResponse`) and `contracts/error-codes.md`.
