# FC-014 — Help confirmation and reputation

Status: completed.
Authorization: AUTO_LOCAL
Depends on: FC-012 (completed). FC-013 messaging is not mutated.

## Schema

No Prisma schema change. No migration.

Current models are sufficient:

- one `HelpConfirmation` per `(requestId, confirmerId, helperId)`
- required credited `responseId` in this task (schema still allows null historically)
- `Contribution` unique on `helpConfirmationId`
- `ContributionTopic` set (no primary topic)
- one `ThankYouNote` per contribution

## Confirmation model

Helper-level uniqueness: one confirmation per requester/helper/request.

`responseId` is required on new writes. Helper is derived from
`RequestResponse.authorId`. Arbitrary `helperId` / `confirmerId` /
`contributorId` / score / rating / admin fields are rejected.

Only `Request.authorId` (ACTIVE_MEMBER) may confirm. Helper cannot confirm
self (`confirmerId` must never equal `helperId`). Unrelated members receive
safe unavailable (`REQUEST_NOT_FOUND`).

## Qualifying evidence

Base (all outcomes):

- response belongs to the request
- `deletedAt = null`
- helper ≠ confirmer
- helper currently member-visible
- request `PUBLISHED` or `RESOLVED`
- no Block either direction

Type rules:

- `ADVICE`: non-deleted advice is enough
- `INTRODUCTION_OFFER`: offer must exist; `HELPED` requires `INTRODUCED`.
  `OFFERED` / `CONSENT_PENDING` / `DECLINED` / `CANCELLED` reject HELPED.
- `PRIVATE_CHAT_OFFER`: request-linked conversation with exactly those two
  participants. `HELPED` also requires at least one non-deleted helper-sent
  `Message`. Empty or requester-only threads reject HELPED.
  Evidence selects `Message.id` only. `Message.body` is never read into
  reputation/events.

## Request states

New/updated confirmation allowed on `PUBLISHED` and `RESOLVED`.
Rejected (safe unavailable) for `DRAFT`, `DELETED_BY_AUTHOR`,
`MODERATED_REMOVED`.

Resolve preserves confirmation/reputation history.

After request delete/moderation: existing Contribution remains. Public
reputation sets `requestAvailable=false` and `requestId=null`. No headline,
context, whoCouldHelp, or request link. Historical `ContributionTopic` rows stay.

After credited response soft-delete: Contribution remains with generic type
label. No new thank-you. Response body is not projected.

## Outcome state machine

- ABSENT → HELPED | STILL_TALKING | NOT_HELPFUL
- HELPED is terminal (no outcome, response, topic, or contribution change)
- STILL_TALKING ↔ NOT_HELPFUL is supported and deterministic
- STILL_TALKING → HELPED
- NOT_HELPFUL → HELPED

Exact effective payload retries return existing state and emit no events.

HELPED with a different response, topic set, or outcome →
`409 HELP_CONFIRMATION_INVALID_STATE`.

Non-helped rows may change `responseId` to another currently qualifying
response from the same helper. Helper swap on an existing row is forbidden.

## Concurrency

Serialize with Request `FOR UPDATE` (same order as FC-011/012/013).
Unique `(requestId, confirmerId, helperId)` plus unique
`Contribution.helpConfirmationId` prevent duplicates.

If STILL/NOT commits first, HELPED may upgrade it.
If HELPED commits first, later non-HELPED conflicts.
Final durable HELPED wins.

Never: non-HELPED confirmation with a Contribution, or orphan Contribution.

No process-memory locks.

## Topics

Approved source for new HELPED `topicIds`: `RequestTopic` rows on this
exact Request. That includes topics later marked inactive/merged on the
global taxonomy, because they were already attached to the request.
Arbitrary global taxonomy IDs are rejected even if currently active.

`topicIds` optional, unique, 0–3. Duplicate ids rejected. Zero topics is
valid (no recognition block). No primary topic; array order is not durable.

Helper expertise does not expand the set.

STILL / NOT: topicIds omitted or empty. No ContributionTopic rows.

Do not rewrite old ContributionTopic rows when taxonomy changes later.
GET ranking may use current canonical label/slug for those stable ids.

## HELPED transaction

Atomic in one Request-locked transaction:

1. HelpConfirmation `outcome=HELPED`
2. Contribution
3. 0–3 ContributionTopic rows

Never HELPED without Contribution or Contribution without HELPED.
Idempotent HELPED retry repairs a missing Contribution if found.
ThankYouNote is a separate POST.
Domain events are collected in-process and emitted only after commit.

## STILL / NOT

Persist HelpConfirmation only. No Contribution. No public reputation.
No public penalty. Helper cannot see these outcomes.

UI:

- STILL: “Recorded — you can update this later.” Back to request. Request unchanged. Owner may later Update help outcome.
- NOT: “Recorded — this does not affect their public reputation.” Back to request. Owner may later upgrade to HELPED.

## Block

Either-direction Block rejects **new** confirmation updates and new thank-you
(`HELP_CONFIRMATION_NOT_ALLOWED`, no direction leak).
Existing confirmation/contribution/thank-you/history remain readable.
FC-017 owns block mutation UI.

FC-014 serializes confirmation/thank-you writes with Request `FOR UPDATE`
only. It does not lock `Block` / `User` rows. A Block inserted after the
in-transaction Block check can still race; this task does not claim
stronger concurrent-block safety than that check.

## Thank-you

`POST /v1/help-confirmations/:id/thank-you` `{ body }` only.
Caller must be confirmer. Requires HELPED + Contribution, request still
PUBLISHED/RESOLVED, credited response not deleted, helper eligible, no Block.

STILL / NOT cannot receive a thank-you (`CONTRIBUTION_NOT_ELIGIBLE`).
Helper/unrelated id → safe unavailable.

If UI Skip note: do not call the endpoint.

When called: body required, trim, min 1, max 500, preserve internal newlines,
HTML remains text, no silent truncation.

First write wins. Same normalized body replay is idempotent.
Different body → `409 THANK_YOU_ALREADY_EXISTS`. No PATCH.

Frontend sequence: POST confirmation, then optional POST thank-you.
If thank-you fails, Contribution stays; typed note is preserved; retry allowed.

Member-visible when confirmer is currently eligible: note body + minimized
confirmer. If confirmer later ineligible: confirmer `null`, thankYou `null`,
copy “A founder confirmed this helped”. Stored note retained.
FC-018 owns anonymization.

Thank-you body is not logged, not placed in domain events, Redis, or error
details.

## Reputation metrics

Derived only from Contribution rows created by HELPED confirmations.

No popularity score. No likes, followers, ratings, levels, or leaderboards.
No count from RequestResponse / Conversation / Message / IntroductionOffer
alone.

- `confirmedHelps` = COUNT(Contribution)
- `foundersHelped` = COUNT(DISTINCT HelpConfirmation.confirmerId) for those contributions
- `introductions` = COUNT(Contribution) whose credited response is
  `INTRODUCTION_OFFER` and IntroductionOffer status is `INTRODUCED`
- repeat founder conversations: **omitted**

Same requester confirming the same helper on 3 requests:
`confirmedHelps += 3`, `foundersHelped += 1`.

Raw INTRODUCED without HELPED does not increment introductions.

Topics: aggregate ContributionTopic only, `count DESC, label ASC, id ASC`,
top 5. `mostRecognizedTopic` is first of that ranking or null.

## History

Deterministic labels only:

- ADVICE → “Advice confirmed helpful”
- INTRODUCTION_OFFER → “Introduction confirmed helpful”
- PRIVATE_CHAT_OFFER → “Private help confirmed helpful”

No request headline. No advice body. No intro personName/reason.
No Message.body / conversation id. No AI summary.

`requestId` only when request is PUBLISHED or RESOLVED and author is
member-visible; otherwise `requestId: null`, `requestAvailable: false`.

Self `/me/reputation` and public `/founders/:id/reputation` share the same
privacy-safe projection plus `isSelf`.
No HelpConfirmation ids, negative outcomes, email, application status,
session data, private content, scores, or admin data.

Pagination: `page` 1-based, `pageSize` default 20 max 50,
`Contribution.createdAt DESC, id DESC`.
Unknown/invalid query keys → `REPUTATION_INVALID_INPUT`.

Empty self copy: “No confirmed contributions yet” with Help another founder → `/home`.
Other founder: “No confirmed contributions yet.” No implication of bad reputation.

GET `/founders/:id/reputation` uses the FC-010 member-visible gate
(`FOUNDER_NOT_FOUND` if unavailable). Integrity rows remain.

GET is side-effect free.

## Surfaces

- Request detail owner CTAs: Confirm help / Update help outcome / Help confirmed / Add thank-you
- Transient confirm + success sheet (no permanent new route)
- `/reputation` self page (not a sixth nav item)
- `/founders/[id]` contribution section via the same reputation API
- No `/reputation/[founderId]`
- Success copy: “+1 confirmed help” (not “+1 founder helped”, because
  `foundersHelped` is DISTINCT confirmer count)

## Events / boundaries

`help.confirmed` on new confirmation/transition.
`contribution.created` on first Contribution.
No duplicate events on exact retry.
IDs + minimal metadata only. Emitted after successful commit.

FC-015: no Notification / NotificationDelivery writes.
FC-017: no block/report UI.
FC-018: no hard-delete/anonymization.
FC-019: no `/admin/reputation`, no score editing.

## Error codes

- HELP_CONFIRMATION_NOT_FOUND
- HELP_CONFIRMATION_INVALID_INPUT
- HELP_CONFIRMATION_NOT_ALLOWED
- HELP_CONFIRMATION_INVALID_STATE
- CONTRIBUTION_NOT_ELIGIBLE
- THANK_YOU_ALREADY_EXISTS
- REPUTATION_INVALID_INPUT
