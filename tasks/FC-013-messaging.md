# FC-013 Messaging

Status: implemented locally, **pending** in `tasks/queue.json` (not marked completed).

Figma remains read-only. No Prisma schema change. No migration.

## Approved scope

Messaging in MVP FC-013 is **request-linked only**.

A member-created conversation requires an existing `RequestResponse` with
`type: PRIVATE_CHAT_OFFER`. The request author creates the conversation with:

```json
{ "privateChatOfferResponseId": "<RequestResponse.id>" }
```

The helper already opted in by making that offer. There is no second helper
accept step.

Generic founder-profile direct messaging is **out of scope**. The Founder
Profile Message CTA stays omitted/non-functional. That is an approved product
decision, not an unfinished control.

## Participants

Exactly two server-derived participants:

1. `Request.authorId`
2. `PRIVATE_CHAT_OFFER` `RequestResponse.authorId`

No group chats. No client-supplied `participantIds`.

## Conversation uniqueness

Exactly one request-linked conversation per Request + requester + helper pair.

There is **no unique index**. Creation serializes on `SELECT Request FOR UPDATE`
inside a Read Committed transaction (`withMessagingRetry`, 8 attempts).

- Duplicate POST returns the existing conversation.
- Concurrent POSTs leave exactly one Conversation.
- If legacy/corrupt data already has more than one match, return the oldest
  (`createdAt ASC`, then `id ASC`). Do not auto-delete or merge.

## Request states for create

Create is allowed when the parent request is `PUBLISHED` or `RESOLVED`.

Create is rejected for `DRAFT`, `DELETED_BY_AUTHOR`, and `MODERATED_REMOVED`.

The offer must have `deletedAt = null`.

Caller must be `ACTIVE_MEMBER` and the request author. The helper must still
satisfy the FC-010/FC-012 member-visible ACTIVE eligibility predicate. Helper
unavailability is returned as a generic `MESSAGING_NOT_ALLOWED` without leaking
why.

## Block policy

A Block in either direction:

- forbids `POST /conversations`
- forbids `POST /conversations/:id/messages`

Existing conversation/history remains readable. Block does not delete
conversation or messages. No Block UI in FC-013.

FC-017 mutation endpoints are not implemented. FC-013 enforces any Block row
**already committed** before the create/send authorization check.

**BLOCK CONCURRENCY LIMITATION:** FC-013 does **not** serialize create/send
against a Block row inserted concurrently after that check. There is no shared
FC-017 locking contract yet (no User-row lock, no Block-row lock). A Block
committed after the check can still race. Do not claim a stronger guarantee.

Lock order documented for later reuse:

- Create: `Request FOR UPDATE`, re-read Request, re-read/validate offer,
  committed Block check, find oldest exact pair (`createdAt ASC`, `id ASC`),
  create only if absent.
- Send: `Conversation FOR UPDATE` only, then committed Block check.

Process-memory locks are not used.

## Conversation status

New conversations are `ACTIVE`. FC-013 adds no close/reopen API or button.
`CLOSED` is reserved. Participants may read a CLOSED conversation. Sending to
CLOSED returns `409 MESSAGING_INVALID_STATE`.

## After request resolve / delete / moderation

`RESOLVED` does not close an existing conversation. Sends may continue while
the conversation is ACTIVE, both participants remain eligible, and no Block
exists. Visible request context remains available for PUBLISHED/RESOLVED when
the request author is still member-visible.

After `DELETED_BY_AUTHOR` or `MODERATED_REMOVED`:

- conversation/history remains readable
- send may continue if otherwise eligible/unblocked
- request context is `{ available: false }` with copy **Request unavailable**
- no request link
- headline/topics/text are not returned

## Request context privacy

Visible context (PUBLISHED/RESOLVED + eligible author):

`id`, `type`, `status`, `headline`, `topics: [{ id, slug, label }]`

Never returned: full `request.context`, `whoCouldHelp`, email, application
data, internal security/account data.

## Counterpart identity

When eligible: `id`, `displayName`, `avatarUrl`, `companyName`, `city`,
`country`.

When ineligible: `counterpart: null`. UI: **Member unavailable**. View profile
hidden. Sending disabled/rejected. History remains readable. FC-018
anonymization is not invented here.

## API

`ACTIVE_MEMBER` on all endpoints. `OriginGuard` on mutations.

- `GET /v1/conversations`
- `POST /v1/conversations`
- `GET /v1/conversations/:id`
- `GET /v1/conversations/:id/messages`
- `POST /v1/conversations/:id/messages`

Non-participants receive safe `404 CONVERSATION_NOT_FOUND` with no existence,
request id, participant ids, message count, or status leak.

No `/admin/conversations`, `/admin/messages`, admin search, or global inbox.

## Messages

POST body allowlist: `clientMessageId`, `body`.

`body` is required, trimmed, 1–4000 characters, whitespace-only invalid,
internal newlines preserved, HTML stored as text, no silent truncation, no
attachments.

`clientMessageId` is a required canonical UUID v4 generated by the client
(`crypto.randomUUID()`). The server does not mint it for POST send.

Same conversation + same id + same normalized body: return the original
Message (idempotent). Same id + different body: `409 MESSAGING_IDEMPOTENCY_CONFLICT`.
Unique conflicts are handled without exposing Prisma P-codes. Concurrent
same-id sends leave one row.

Exact idempotent replay is resolved **before** consuming a new-message
rate-limit slot.

Send transaction: lock Conversation `FOR UPDATE`, verify
participant/ACTIVE/eligibility/Block, re-check `(conversationId, clientMessageId)`
while holding the lock, then consume **one** Redis new-message slot only if the
id is absent, insert Message, and bump `Conversation.updatedAt` in the same
transaction.

Same-conversation concurrent first sends of the same `clientMessageId` serialize
on that Conversation row, so they consume at most one new-message slot.

## Rate limit

30 **new** messages / 60 seconds / authenticated sender user id.

Redis fixed-window, fail-closed. `429 MESSAGING_RATE_LIMITED`.

Keys are HMAC actor hashes (`messaging-rate:v1:send:<hash>`) via existing
`SessionService.hashRateLimitActor` and `SESSION_SECRET`. They never contain
message body, request text, email, user id plaintext, or private content.

No new environment variable was added for FC-013.

Conversation create has no extra numeric rate limit; it is bounded by
one-per-helper PRIVATE_CHAT_OFFER plus server uniqueness.

Exact replay and same-id/different-body conflict are resolved **before**
consuming a new-message slot, including concurrent first attempts: the
Conversation row lock is taken first, then the unique pair is re-read, then
Redis is charged only for a genuine insert.

## History and list

History: `before?` + `limit?` (default 50, max 100). Newest-first query using
the `(createdAt, id)` tuple, serialized chronological ascending. `nextBefore`
is the oldest returned id when older rows exist. A `before` id from another
conversation is `MESSAGING_INVALID_INPUT` without leaking the foreign thread.

List: caller participant only, page 1-based default 20 max 50, `updatedAt DESC`
then `id DESC`.

Search `q` (trimmed, max 100) matches **currently eligible** counterpart
displayName, **currently eligible** counterpart company name, and **available**
request headline only. It does not search Message.body, deleted message bodies,
DELETED_BY_AUTHOR / MODERATED_REMOVED headlines, stale ineligible names,
emails, applications, advice bodies, or intro personName/reason.

Latest preview uses PostgreSQL `DISTINCT ON ("conversationId")` of non-deleted
messages (preview fields only), or `null` (**No messages yet**). Zero-message
conversations are created without system/offer/request copies.

Soft-deleted messages keep chronological position with `body: null`,
`removed: true`. UI: **Message removed**. Preview ignores deleted rows.

`ConversationParticipant.lastReadAt` is **never written** by FC-013 and is not
selected on GET. There is no read endpoint. All GET endpoints are side-effect
free. Unread/receipts are deferred to FC-015.

Request rows are loaded with a minimized `select` (id/type/status/headline/
author eligibility/topics). `context` and `whoCouldHelp` are not fetched.

## Frontend

- `/messages` inbox
- `/messages/[conversationId]` detail
- 1440 / 1024 split panes
- ~768 / 390 route-based (never both panes on mobile)
- Messages nav enabled, active on `/messages` and `/messages/[id]`
- Empty: **No conversations yet** + Go to Home (`/home`)
- Search-zero: **No conversations found** + Clear search
- Request author: **Start private chat** / **Open private chat**
- Helper: **Open private chat** only when a conversation exists
- General request viewers get no conversation metadata/action
- Composer preserves draft on errors; reuses `clientMessageId` until the body
  changes; inflight ref blocks double POST
- No WebSocket, SSE, typing, presence, or read receipts
- Back from mobile detail defaults to `/messages`
- Request-context link only while `requestContext.available === true`

## Boundaries

Not in FC-013:

- FC-014 reputation / help confirmation
- FC-015 notifications / unread
- FC-017 block/report UI and concurrent-Block serialization
- schema/migration
- Admin global DM browsing
- logging of Message.body
- generic profile DMs
- realtime / WebSocket / SSE
- lastReadAt writes / unread counts / read receipts

## Remaining limitations

- Duplicate JSON object keys are last-wins at `JSON.parse`; Nest does not
  surface a duplicate-key parser error.
- If Redis is charged and the following Message INSERT then fails, that quota
  slot stays consumed (MVP-acceptable). Deadlock retry of a rolled-back insert
  can similarly charge Redis again.
- Soft-deleted history rows are still loaded from PostgreSQL so tombstone
  position can be preserved; `body` is forced to `null` before JSON.
- GET does not mark messages read.
- Block rows inserted after the send check are not serialized (no FC-017 lock).

## Assumptions

- Existing `Conversation.requestId`, participants, and
  `@@unique([conversationId, clientMessageId])` are sufficient.
- Postgres unique allows multiple NULL `clientMessageId` values; FC-013 always
  stores a UUID v4, so the unique constraint is effective.
- If correctness later required a schema change, stop before editing
  `prisma/schema.prisma`.
