# FC-012 — Help responses

**Status:** implemented locally; `tasks/queue.json` remains `pending`.
**Branch:** `fc-012-help-responses`
**No commit / no push / no PR.**
**Figma remains READ-ONLY.**
**No Prisma schema change. No migration.**

FC-013 (conversations / request-linked DMs / Messages navigation), FC-014
(help confirmation / reputation), notifications, admin moderation UI, and
FC-017 block UI are not implemented here.

## Figma sources (read-only)

- I Can Help chooser: `59:507`
- Share Advice: `59:534`
- Offer Introduction: `67:80`
- Mobile request detail: `59:480`
- Desktop help: `59:2`, `59:36`, `59:65`
- 1024 request detail: `96:94`
- Request owner detail: `20:85`
- Prototype: `39:2`
- Freeze: `92:3`
- Build Acceptance: `113:3`

Implemented as request-detail sheets/dialogs using existing Field/Button
tokens. Absolute Figma positioning is not copied.

## Schema

No Prisma schema change and no migration.

Uses existing:

- `RequestResponse`
- `IntroductionOffer`
- `ResponseType` (`ADVICE` | `INTRODUCTION_OFFER` | `PRIVATE_CHAT_OFFER`)
- `IntroductionStatus`
- `Block`

`permissionConfirmed` is a submission requirement only. It is not persisted
in a new column. `RequestResponse.deletedAt` is unused for member delete
(reserved for later safety/moderation).

If a schema change had been required, implementation would have stopped.

## Endpoints

All require `ACTIVE_MEMBER`. Unsafe mutations use `OriginGuard`.

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/v1/requests/:id/responses/advice` | 201 |
| `POST` | `/v1/requests/:id/responses/introduction` | 201 |
| `POST` | `/v1/requests/:id/responses/private-chat` | 201 |
| `GET` | `/v1/requests/:id/responses` | side-effect free |
| `POST` | `/v1/introductions/:id/consent` | 200 |
| `POST` | `/v1/introductions/:id/decline` | 200 |
| `POST` | `/v1/introductions/:id/cancel` | 200 |

No `PATCH /responses/:id`. No `DELETE /responses/:id`. Member responses are
immutable in FC-012.

## Self-response

A request author may not create `ADVICE`, `INTRODUCTION_OFFER`, or
`PRIVATE_CHAT_OFFER` on their own request.

Returns `403 HELP_RESPONSE_NOT_ALLOWED` with a generic message. The body
does not distinguish ownership, block, or other ineligibility reasons.

## Multiplicity / idempotency

At most **one response per type per helper per request**.

The same helper may therefore have at most:

- 1 `ADVICE`
- 1 `INTRODUCTION_OFFER`
- 1 `PRIVATE_CHAT_OFFER`

on one request. This is not one-response-total.

There is no database unique index. Duplicate protection is enforced under
the Request row lock:

1. `SELECT Request … FOR UPDATE`
2. `findFirst` matching `requestId + authorId + type`, **including** rows
   with `deletedAt != null`
3. if a row exists, return it unchanged
4. otherwise validate and insert

A duplicate POST of the same `requestId` / `authorId` / `type` is
idempotent: the original body/personName/reason are preserved. Concurrent
duplicate POSTs leave exactly one matching `RequestResponse`. Historical
deleted rows still block a new insert so later moderation cannot be
bypassed by reposting.

No new response rate limiter. Existing platform/auth protections remain.

## Request-row locking

Every response creation:

1. `requireActiveMember`
2. load the request safely
3. enter a Read Committed transaction (`withRequestRowRetry`)
4. `SELECT Request … FOR UPDATE` (same helper as FC-011)
5. re-read the request
6. require `PUBLISHED`
7. enforce self-response
8. enforce Block in either direction
9. check same helper/request/type duplicate (including deleted rows)
10. validate input
11. insert
12. commit

This serializes with published request edit, resolve, delete, and other
response inserts. No process-memory lock.

## Request state

New responses: `PUBLISHED` only.

| Status | Create | GET history | Pending intro actions |
| --- | --- | --- | --- |
| `PUBLISHED` | allowed | readable if FC-011 visible | consent / decline / cancel |
| `RESOLVED` | rejected | readable if FC-011 visible | consent / decline / cancel |
| `DRAFT` | safe unavailable for non-owner; invalid-state for owner | no thread endpoint | unavailable |
| `DELETED_BY_AUTHOR` | safe unavailable | safe unavailable | unavailable |
| `MODERATED_REMOVED` | safe unavailable | safe unavailable | unavailable |

`RESOLVED` may finish an introduction that was created while `PUBLISHED`.
New responses after resolve are forbidden.

## Advice

Required trimmed body, 20–2000 characters. Whitespace-only fails.

Persisted in `RequestResponse.body`. Type `ADVICE`. No edit/delete.

## Introduction input

`POST …/responses/introduction` body:

- `personName` required, trimmed, 2–160; name / role / company only
- `reason` optional, trimmed, max 500; blank → `null`
- `permissionConfirmed` must be literal `true`

Unknown keys and contact-detail fields (`email`, `phone`, `linkedIn`,
handles, URLs) are rejected.

`RequestResponse.body` for `INTRODUCTION_OFFER` is `null`. Introduction
values live only on `IntroductionOffer`.

## Permission attestation / initial state

Figma checkbox “I have their permission to make this intro” means the
helper attests that the third party has already given permission to offer
the introduction to this requester.

The boolean is required at submission and is **not** stored in a new
column. The durable invariant is: an FC-012-created introduction reaches
`CONSENT_PENDING` only through an API mutation that required
`permissionConfirmed=true`.

Creation is the conceptual transition `OFFERED → CONSENT_PENDING`
atomically. Persisted `IntroductionOffer.status` is `CONSENT_PENDING`.

## Intro privacy

Before requester consent:

| Viewer | Sees helper | personName | reason | controls | contact |
| --- | --- | --- | --- | --- | --- |
| General active member | yes | no | no | no | never |
| Request author | yes | no | yes | Accept / Decline | never |
| Helper who created it | yes | yes | yes | Cancel while pending | never |

After `INTRODUCED`, the request author may also see `personName`. General
viewers still do not. No viewer ever receives phone / email / LinkedIn /
contact details because FC-012 does not collect them.

GET field minimization:

- general viewer: `introduction: null` (generic card only)
- requester: `reason`, status, `canConsent` / `canDecline`; `personName`
  only if `INTRODUCED`
- helper: own `personName` / `reason` / status; `canCancel` when pending
  (`CONSENT_PENDING` or legacy `OFFERED`)

## Intro consent / decline / cancel

Actors are authorized **before** the Request row lock: the introduction is
loaded, `deletedAt` on the parent response is rejected, and the caller must
be the request author or the helper. Strangers receive
`INTRODUCTION_NOT_FOUND` without locking a foreign Request.

Lock order inside a transaction:

1. Request row `FOR UPDATE`
2. IntroductionOffer row `FOR UPDATE`
3. re-read, reject deleted responses, and authorize again

First committed terminal transition wins. The loser receives
`INTRODUCTION_INVALID_STATE`. No raw Prisma P-codes. No last-write-wins
terminal corruption.

### Consent — request author only

Require ACTIVE_MEMBER, OriginGuard, request `PUBLISHED` or `RESOLVED`, not
deleted/moderated, no Block in either direction, status `CONSENT_PENDING`.

`CONSENT_PENDING → INTRODUCED`. Sets `consentedAt` and `introducedAt` to
the same server timestamp.

Repeated consent after `INTRODUCED`: idempotent success, original
timestamps preserved.

Does not create a Conversation or expose contact details.

### Decline — request author only

`CONSENT_PENDING → DECLINED`. No fake consent/introduction timestamps.
Repeated decline is idempotent. `INTRODUCED` / `CANCELLED` are invalid.
Block does **not** prevent decline (safe-exit).

### Cancel — helper who created the offer only

`CONSENT_PENDING → CANCELLED`. Also `OFFERED → CANCELLED` for legacy rows.
Repeated cancel is idempotent. `INTRODUCED` / `DECLINED` are invalid.
Block does **not** prevent cancel (safe-exit).

Unauthorized actors receive safe `INTRODUCTION_NOT_FOUND`.

## Contact details

FC-012 never collects, stores, returns, or reveals phone, email,
LinkedIn/contact URL, or other external contact details for the third
party. After consent, only `personName` may become visible to the
requester. Actual connecting/channel behavior is deferred to FC-013.

## Private chat offer

`POST …/responses/private-chat` creates only:

```
RequestResponse { type: PRIVATE_CHAT_OFFER, body: null }
```

No body input, no textarea, no note. No `Conversation`,
`ConversationParticipant`, or `Message`.

Chooser action “Chat privately” submits this offer directly.

Visible card for every request viewer:

`{helper} · Private help offered`

No private content exists. Request author gets no accept/message action in
FC-012.

**FC-013 decides how `PRIVATE_CHAT_OFFER` becomes a request-linked
conversation.** Messages navigation stays disabled exactly as before.

## GET `/v1/requests/:id/responses`

- ACTIVE_MEMBER
- request must be member-visible under FC-011
- statuses: `PUBLISHED` and `RESOLVED` only; `DRAFT` has no thread
  endpoint; deleted/moderated are safe unavailable
- `page` 1-based; `pageSize` default 20, max 50
- order: `createdAt ASC`, then `RequestResponse.id ASC` (oldest-first)
- exclude `deletedAt != null`
- duplicate/array/malformed query params: `HELP_RESPONSE_INVALID_INPUT`
- side-effect free

Also returns `viewerResponseTypes` (including historically deleted rows of
the caller, so used chooser options stay disabled) and `canOfferHelp`.

## Response visibility by type

- `ADVICE`: all viewers get id, type, createdAt, minimized helper, body
- `INTRODUCTION_OFFER`: see Intro privacy
- `PRIVATE_CHAT_OFFER`: all viewers get id, type, createdAt, helper,
  generic private-help presentation; no body

## Response author payload

Minimized FC-010/FC-011 identity:

`id`, `displayName`, `avatarUrl`, `companyName`, `city`, `country`

Never: email, `emailVerifiedAt`, status, suspension fields, application,
`roleTitle`, admin/security, sessions, tokens, internal profile/company
ids.

If the helper later becomes ineligible, serialize `author: null`. Frontend
renders “Member unavailable”. Historical rows are not deleted or rewritten.
FC-018 owns final account-deletion/anonymization policy.

## Block policy

A Block in **either** direction forbids new `ADVICE`, `INTRODUCTION_OFFER`,
and `PRIVATE_CHAT_OFFER`, and forbids intro consent.

Decline and cancel remain allowed (safe-exit). Historical responses are
not deleted or rewritten. FC-017 block UI is not implemented here.

## Error codes

- `HELP_RESPONSE_INVALID_INPUT`
- `HELP_RESPONSE_NOT_ALLOWED`
- `INTRODUCTION_NOT_FOUND`
- `INTRODUCTION_INVALID_STATE`

Inaccessible request/introduction resources use a safe 404. No raw Prisma
P-code / SQL / stack output. Ownership/state distinctions are not leaked
through error bodies.

## Frontend — `/requests/[id]`

Upgrades response-count-only UI to a chronological thread.

- Non-owner of `PUBLISHED`: **I can help**, unless blocked/ineligible
- Owner: never I can help
- `RESOLVED`: never I can help
- Chooser `59:507`: Share advice / Offer introduction / Chat privately
- Used types disabled; unused remain available; if all three exist, I can
  help is not offered
- Advice sheet `59:534`: 20–2000 textarea, Publish advice, Cancel; typed
  text preserved on validation/network error
- Intro sheet `67:80`: personName, reason, permission checkbox, privacy
  copy “Name, role or company only. Do not include phone, email or contact
  links.”
- Chat privately: direct POST, no composer; in-flight ref prevents double
  submit before busy re-render
- Requester pending: Accept introduction / Decline
- Helper pending: Cancel offer
- Accessible confirmation before terminal intro actions
- 44px targets, visible focus, keyboard/Escape
- No fabricated Figma sample records
- No `/messages`, no conversation creation

## Out of scope (explicit)

- FC-013 conversations, messages, private-chat acceptance, Messages nav
- FC-014 HelpConfirmation / Contribution / ThankYouNote / reputation
- Schema/migration
- New response rate limiter
- Member edit/delete of responses
- Admin moderation of responses
- Contact-detail storage
