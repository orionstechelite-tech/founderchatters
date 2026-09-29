# FC-011 — Requests core

**Status:** implemented locally; `tasks/queue.json` remains `pending`.
**Branch:** `fc-011-requests-core`
**No commit / no push / no PR.**
**Figma remains READ-ONLY.**
**No Prisma schema change. No migration.**

FC-012 (responses), FC-013 (messaging), FC-014 (reputation), notifications,
and admin moderation are not implemented here.

## Figma sources (read-only)

- Compose desktop: `20:2`
- Preview desktop: `20:52`
- Published detail desktop: `20:85`
- Mobile Ask: `38:35`
- Mobile request detail: `59:480`
- 1024 request detail (inspected if present): `96:94`
- Reusable Button: `12:34`
- Reusable Field: `15:43`

## Approved product decisions

### Open request limit

Maximum open requests per founder: **3**.

Only `PUBLISHED` counts. Do not count `DRAFT`, `RESOLVED`,
`DELETED_BY_AUTHOR`, or `MODERATED_REMOVED`.

Implemented as the code constant `REQUEST_LIMITS.openPublished = 3`.
No `PlatformSetting` runtime behavior in FC-011.

`docs/16-open-decisions.md` no longer lists the exact open-request limit as
unresolved.

### One draft per author

MVP permits one `Request` with status `DRAFT` per author at a time.

`/ask` resumes that draft if it exists. After it becomes `PUBLISHED` or is
deleted, the founder may create a new `DRAFT`.

No database unique index. Enforced service-side with `SELECT … FOR UPDATE` on
the author `User` row inside a PostgreSQL serializable transaction with
bounded retry, so concurrent `POST /requests` cannot leave multiple drafts.

If a draft already exists, `POST /v1/requests` returns `409 REQUEST_INVALID_STATE`
instead of creating a second draft.

### Request identity

`:id` is `Request.id` for:

- `GET /v1/requests/:id`
- `PATCH /v1/requests/:id`
- `POST /v1/requests/:id/publish`
- `POST /v1/requests/:id/resolve`
- `DELETE /v1/requests/:id`
- `/requests/[id]`

### GET `/v1/requests` is not a feed

It returns only the authenticated founder’s **own** requests for draft recovery
and own-request state. No all-member feed, Home matching, or recommendation
engine.

- optional `status`
- `page` 1-based
- `pageSize` default 20, max 50
- default order: `updatedAt DESC`, then `Request.id DESC`
- default member-relevant states: `DRAFT`, `PUBLISHED`, `RESOLVED`
- `DELETED_BY_AUTHOR` and `MODERATED_REMOVED` omitted
- duplicate/malformed query params rejected with `REQUEST_INVALID_INPUT`

Response also includes `availableTopics` (active, non-merged taxonomy) for the
compose selector. GET does not seed or mutate taxonomy.

### GET `/v1/requests/:id` visibility

All callers: `ACTIVE_MEMBER`.

| Status | Visibility |
| --- | --- |
| `DRAFT` | author only; non-owner gets safe `REQUEST_NOT_FOUND` |
| `PUBLISHED` | all ACTIVE members, if author remains FC-010 eligible |
| `RESOLVED` | all ACTIVE members, if author remains FC-010 eligible |
| `DELETED_BY_AUTHOR` | safe unavailable / not-found |
| `MODERATED_REMOVED` | safe unavailable / not-found |

Hidden states are not distinguishable to unauthorized callers.

### Author eligibility / privacy

For a non-owner viewing `PUBLISHED` / `RESOLVED`, the author must still satisfy
FC-010 member-visible ACTIVE eligibility (active, not deleted, verified,
approved, onboarded, unsuspended, profile + company present). Otherwise the
request is hidden with the same safe unavailable response.

Do not leak stale profile identity. FC-018 may later introduce anonymized
historical behavior; account-deletion policy is not implemented here.

Author snapshot is minimized:

- `User.id`
- `displayName`
- `avatarUrl`
- company name
- city
- country

Never returned: email, password/session, application (including `roleTitle`),
admin/security fields, suspension details, raw internal profile/company IDs.
Do not fabricate `"Founder"` or application `roleTitle`.

### POST `/v1/requests`

Creates a `DRAFT` owned by the authenticated `User.id`. Caller must be
`ACTIVE_MEMBER`. `authorId` comes only from the session.

Allowed body: `type`, `headline`, `context`, `whoCouldHelp`, `urgency`,
`topicIds`. `type` is required. UI default is `ASK`.

Because Prisma `headline` / `context` are non-null, a draft may persist `""`
for incomplete fields. Do not fabricate content.

Mass assignment is rejected: `authorId`, `status`, `publishedAt`, `resolvedAt`,
`deletedAt`, `createdAt`, `updatedAt`, `responseCount`, and unknown keys.

### Save draft / preview

Save draft persists server-side (`POST` if none, `PATCH` if one exists). It
does not publish and does not count toward the open limit. Incomplete
required-for-publish fields are allowed; max lengths and enum validity still
apply.

Preview stays inside `/ask`. No `/requests/preview` route. Preview persists
the current draft first, then renders Preview. Actions: Publish request, Edit
request. Edit returns to compose on the same persisted draft.

Refresh is guaranteed to preserve draft fields. Preview-vs-compose UI mode
does not need to survive refresh. No `localStorage`.

A failed publish leaves status `DRAFT` and preserves saved draft content.
Network errors must not clear the in-memory form. `REQUEST_LIMIT_REACHED`
preserves the draft.

Multi-tab concurrent draft `PATCH` in FC-011: last successful write wins. No
versioning schema.

### PATCH `/v1/requests/:id`

Author only.

| Status | Editability |
| --- | --- |
| `DRAFT` | fully editable content |
| `PUBLISHED` | only if non-deleted `responseCount` = 0 |
| `PUBLISHED` with responses | `REQUEST_INVALID_STATE` |
| `RESOLVED` | not editable |
| `DELETED_BY_AUTHOR` | not editable |
| `MODERATED_REMOVED` | unavailable |

Editable fields: `type`, `headline`, `context`, `whoCouldHelp`, `urgency`,
`topicIds`.

For `PUBLISHED` edits: resulting values must satisfy publish validation;
`publishedAt` and `Request.id` remain unchanged; existing future relations
remain attached. No edit-history table.

### Validation

Persist trimmed text.

Draft maximums:

- headline 0–160
- context 0–2000
- whoCouldHelp optional, max 300
- topicIds 0–3
- type exact `RequestType`
- urgency if supplied: `TODAY` \| `THIS_WEEK` \| `NO_RUSH`

Blank optional strings become `null`.

Publish requirements:

- headline 10–160
- context 30–2000
- whoCouldHelp optional max 300
- urgency **required**
- type required valid enum
- topics 0–3 valid topic IDs

No additional invented minimums. Field errors use `REQUEST_INVALID_INPUT`.

### Urgency

Canonical persisted values: `TODAY`, `THIS_WEEK`, `NO_RUSH`.

Display: Today, This week, No rush.

Schema remains `String?`. No Prisma enum / migration. Null is allowed in
`DRAFT`. Required to publish. Editable while the request is editable.

### Topics

Compose has one approved Figma deviation: an explicit optional Topics selector
using existing `TaxonomyTopic` rows.

Write rules:

- 0–3 topic IDs
- only `isActive=true`
- `mergedIntoId=null`
- stable `TaxonomyTopic.id`
- no custom topic creation, AI, keyword parsing, deriving topics from request
  text, or copying founder needs

Preview/detail show only actually selected (active, non-merged) topic labels.
Urgency is separate and is not stored as `RequestTopic`.

Historical inactive/merged `RequestTopic` rows remain stored. GET omits them
from chips and does not rewrite them. Topic replacement on PATCH is atomic and
retains historical inactive/merged relations.

GET does not seed or mutate taxonomy.

### Publish

`POST /v1/requests/:id/publish` — author only, OriginGuard, ACTIVE member.

`DRAFT` → `PUBLISHED`. Server validates publish requirements, enforces
`openPublished = 3`, sets `publishedAt` once, leaves `resolvedAt` /
`deletedAt` null.

Already `PUBLISHED`: idempotent success, same request, do **not** reset
`publishedAt`.

Other states: `REQUEST_INVALID_STATE` (or safe unavailable for hidden states).

### Publish limit concurrency

PostgreSQL serializable transaction + `User` row lock + bounded retry.

Concurrent publish of two different drafts by the same author at the final
available slot: one succeeds, the other receives `REQUEST_LIMIT_REACHED`, and
the author never has more than 3 `PUBLISHED` requests.

Concurrent duplicate publish of the same request: safe/idempotent, one
`publishedAt`, no raw Prisma P-code, no 500.

No process-memory lock.

### Resolve

`POST /v1/requests/:id/resolve` — author only, OriginGuard.

`PUBLISHED` → `RESOLVED`. `resolvedAt` set server-side once. Already
`RESOLVED`: idempotent success, original `resolvedAt` preserved.

`DRAFT`: `REQUEST_INVALID_STATE`. Deleted/moderated: safe unavailable.

Resolved requests cannot be edited, cannot be author-deleted in FC-011, and
remain member-visible history.

**FC-012 contract:** future help-response endpoints must not accept new
responses on `RESOLVED` requests. That endpoint is not implemented here.

### Delete

`DELETE /v1/requests/:id` — author only, OriginGuard.

| Status | Behavior |
| --- | --- |
| `DRAFT` | hard delete (never entered the member network) |
| `PUBLISHED` | `DELETED_BY_AUTHOR`, `deletedAt` set, row/content/relations retained |
| `RESOLVED` | `REQUEST_INVALID_STATE` |
| `DELETED_BY_AUTHOR` repeated by same author | idempotent success |
| `MODERATED_REMOVED` | member API treats as unavailable |

Never hard-delete a published request.

Delete confirmation UI:

- Title: `Delete request?`
- Body: `This removes the request from the member network. This can’t be undone.`
- Actions: Cancel, Delete request
- Mobile follows existing near-full-width dialog / bottom-sheet policy
- Escape, focus return, visible focus, labelled dialog

### Response boundary

FC-011 may expose `responseCount` (non-deleted `RequestResponse` rows only).

Must **not** expose response bodies, response authors, introduction offers, or
private-chat offers.

Do not implement `GET /requests/:id/responses` or any response mutation.

`responseCount = 0`: frozen empty-state copy may be shown.
`responseCount > 0`: show the count only; do not fabricate response previews.

### Owner / non-owner detail

PUBLISHED owner, `responseCount = 0`: Edit, Mark resolved, Share, Delete.
PUBLISHED owner, `responseCount > 0`: no editing; Mark resolved, Share, Delete.
RESOLVED owner: read-only; Share allowed; no Edit / Delete / Resolve.
DRAFT is managed through `/ask` compose/preview.

Non-owner FC-011 detail is **read-only**. Omit I can help, Message, and sample
response rows. Do not render fake or disabled FC-012/013 buttons.

### Share request

Owner Share copies the canonical authenticated member URL:

`{WEB_URL}/requests/{Request.id}`

or the browser-relative equivalent (`window.location.origin`). This does not
create a public request page. `/requests/[id]` remains `ACTIVE_MEMBER`-only.
Clipboard API with accessible success/failure feedback. No backend mutation.

### Mobile completeness

Mobile `INTRO` is a presentation abbreviation for `INTRODUCTION`. The
`RequestType` enum is unchanged.

At 390, all four request types remain reachable: ASK, FEEDBACK, INTRODUCTION,
COLLABORATION. Urgency and Save draft are also preserved, wrapping/stacking
below the compact Figma crop. Do not hide product functionality to mimic the
crop.

### Approved Figma deviations

1. Explicit optional Topics selector added because `RequestTopic` exists but no
   assignment mechanism exists and AI inference is forbidden.
2. Collaboration / Urgency / Save draft retained on mobile below the compact
   frame.
3. “matching experience and geography” visibility copy must not claim a
   matching engine in FC-011.
4. Non-owner I can help / Message omitted until FC-012/013.
5. Response bodies/previews omitted until FC-012.

### Member navigation

Ask → `/ask`. Home → `/home`. Discover → `/discover`.
Profile → `/founders/{viewerUserId}`.
Messages remains visually present but non-navigable / `aria-disabled` until
FC-013. No `/messages` behavior.

### Frontend `/ask`

On ACTIVE load:

1. fetch own `DRAFT` through `GET /requests?status=DRAFT`
2. if found, hydrate compose
3. otherwise display a fresh form with `RequestType ASK` selected

Do not auto-create a DB row merely by visiting `/ask`.

Successful publish navigates to `/requests/{id}`. Limit failure remains in
preview/compose with the draft preserved.

### Frontend `/requests/[id]`

Render real API data. No runtime Figma fixtures. Status: `PUBLISHED` → Open,
`RESOLVED` → Resolved. Long text wraps. No HTML injection /
`dangerouslySetInnerHTML`.

### Security

All endpoints server-authorized. Unsafe mutations use OriginGuard. Ownership
from session only. Explicit whitelist request bodies. Cross-user mutation and
draft enumeration fail safely. No raw Prisma P-codes / SQL / stack traces.

GET `/requests` and GET `/requests/:id` cause no request, taxonomy, or profile
writes, no automatic cleanup, and no timestamp changes.

### Concurrency strategy

`prisma.$transaction` with **Read Committed**, author `User` row
`FOR UPDATE`, owned `Request` row `FOR UPDATE` after ownership is proven, and
bounded retry (max 8) on deadlock/`P2034` only. `ApiError` and
validation/authorization failures are not retried. Exhausted conflicts return
`REQUEST_PUBLISH_FAILED`, never a raw Prisma P-code. No process-memory lock.
No schema/migration.

Serializable SSI was not used for these writes because concurrent inserts of
**different authors’** requests can abort each other with false serialization
failures. Same-author one-draft and open-limit correctness come from locking
the author `User` row before the existence/count check and insert/update.

Draft create locks the author `User` row (`SELECT id FROM "User" … FOR UPDATE`)
**before** looking for an existing `DRAFT` and inserting. Different authors
lock different user rows and do not block each other.

Author mutations (PATCH / publish / resolve / delete) lock the author `User`
row, verify ownership, then lock the `Request` row (`SELECT id FROM "Request"
… FOR UPDATE`) and re-read it before applying the state change. Cross-user
callers never lock another founder’s request row.

**FC-012 response creation MUST lock/serialize against `Request` (`FOR UPDATE`
on the request row) before inserting a `RequestResponse`.** FC-011 published
edits count non-deleted responses under that request lock; without a matching
FC-012 lock, a future help-response insert could race a published edit.

Same-author resolve vs delete: both serialize on the user then request lock.
The first committed transition wins. If resolve commits, delete sees
`RESOLVED` and returns `REQUEST_INVALID_STATE`. If delete commits, resolve
sees `DELETED_BY_AUTHOR` and returns safe `REQUEST_NOT_FOUND`. Never both
logical transitions.

Republish of an already `PUBLISHED` request is idempotent **before** the
open-limit count. Repeating publish at 3 open requests still succeeds and
does not change `publishedAt`.

`topicIds: ["x","x"]` is rejected with `REQUEST_INVALID_INPUT` (choose each
topic only once). Historical inactive/merged `RequestTopic` rows are retained
on PATCH replacement and do not count toward the 3 selected active topics.

If GET `status=DRAFT` ever returns more than one row (legacy/corrupt data),
`/ask` hydrates `requests[0]` from the list order (`updatedAt DESC`, `id DESC`)
and does not merge or auto-create another draft.

Multi-tab draft PATCH remains last successful write wins.

**Status:** implemented locally; `tasks/queue.json` remains `pending`.
