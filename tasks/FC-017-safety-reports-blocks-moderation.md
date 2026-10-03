# FC-017 — Safety reports, blocks, and moderation

**Status:** completed in `tasks/queue.json` after report-scoped MESSAGE
body evidence + access audit passed validation.
**Branch:** `fc-017-safety-reports-blocks-moderation`
**No commit / no push / no PR.**
**Figma remains READ-ONLY.**
**No Prisma schema change. No migration.**

FC-018 account deletion, FC-019 admin operations, and FC-020 public support
are not implemented here.

## Figma sources (read-only)

- Report 390: `136:167`
- Block 390: `136:189`
- Account Suspended 390: `136:216`
- Button: `12:34`
- Field: `15:43`
- Admin small-screen unsupported: `137:201`

## Approved product decisions

### Schema

Existing `Report`, `Block`, `ModerationAction`, `AuditLog`,
`User.status` / `suspendedUntil` / `suspensionReason`,
`ReportTargetType`, and `ReportStatus` are sufficient.

No schema edit. No migration.

### Member reporting

`POST /v1/reports`

- ACTIVE_MEMBER + OriginGuard
- Redis rate limit, fail-closed: 10 reports / 15 minutes / authenticated user
- Strict unknown-field rejection
- Reporter always `AuthPrincipal.user.id`
- Target must exist and be legitimately visible
- Inaccessible/foreign targets → enumeration-safe `SAFETY_TARGET_NOT_FOUND`
- Status created as `OPEN`
- Confirmation returns report id + status only

Reason codes:

| Code | Figma label |
| --- | --- |
| `SPAM_PROMOTION` | Spam or unwanted promotion |
| `FRAUD_IMPERSONATION` | Fraud or impersonation |
| `HARASSMENT_ABUSE` | Harassment or abuse |
| `UNSAFE_POLICY` | Unsafe / policy violation |
| `OTHER` | Other |

Optional `details` trimmed, max 500. Blank → `null`.

Target rules:

- `USER`: eligible visible founder; no self-report
- `REQUEST`: member-visible under FC-011 (not draft-to-strangers, not deleted/moderated)
- `RESPONSE`: parent request visible; response not hidden; no self-report
- `MESSAGE`: reporter is conversation participant; message belongs to that conversation; no self-report of own message; member APIs never return admin evidence

### Reporter privacy

The reported member never learns reporter id, email, name, or that a
specific person submitted a report.

No member endpoint lists reports against the caller.

Admin detail may include reporter `id` + `displayName` only.

Logs, events, and AuditLog metadata never include reporter free-text
when `reasonCode` + `reportId` is enough, and never include message bodies,
passwords, cookies, tokens, or session hashes.

### Blocking

`GET /v1/me/blocks`
`POST /v1/me/blocks/:userId`
`DELETE /v1/me/blocks/:userId`

- Caller-only list, safe founder summary, `createdAt DESC`
- No self-block
- Target must be an eligible founder
- Idempotent create/delete
- Enumeration-safe not-found for ineligible targets
- OriginGuard on mutations

`/settings/blocked` is real block management, not a placeholder.

### Block invariant

A `Block` in **either direction** stops **new** direct interaction.

Central helper: `areMembersBlocked` in `apps/api/src/safety/block-access.ts`.

Enforced for:

- new help responses / intro offers / private-chat offers
- new conversation create
- new messages on existing conversations
- new help confirmations
- new thank-you notes

Historical records stay intact. Decline/cancel remain safe-exit.

### Moderation RBAC

Permissions:

- `admin.reports.read`
- `admin.reports.moderate`
- `admin.members.suspend`

Role defaults:

- `SUPER_ADMIN`: all existing + safety permissions
- `MODERATOR`: safety permissions only
- `APPLICATION_REVIEWER` / `OPERATIONS`: application permissions only
- `SUPPORT` / `ANALYST_READONLY`: none

No production user provisioning.

### Admin report routes

- `GET /v1/admin/reports`
- `GET /v1/admin/reports/:id`
- `POST /v1/admin/reports/:id/review`
- `POST /v1/admin/reports/:id/dismiss`
- `POST /v1/admin/reports/:id/enforce`

Transitions:

- `OPEN → UNDER_REVIEW`
- `OPEN | UNDER_REVIEW → DISMISSED`
- `OPEN | UNDER_REVIEW → ENFORCED`

Terminal states do not reopen.

### Scoped evidence

USER / REQUEST / RESPONSE evidence may include member-visible metadata
needed to moderate that exact target.

MESSAGE evidence is report-scoped and reachable only through
`GET /v1/admin/reports/:reportId` (or the same detail payload after a
moderation mutation). Human approval was granted for this exact
capability.

Returned MESSAGE fields:

- messageId, conversationId, sender `{ id, displayName }`, createdAt,
  deletedAt, body

The REPORT is the authority: `report.targetId` is the only message
selected. Neighboring messages, conversation history, and arbitrary
message lookup are not implemented. There is no `/admin/messages` route.

Every successful MESSAGE body disclosure writes
`SAFETY_MESSAGE_EVIDENCE_VIEWED` with `reportId` / `messageId` /
`conversationId` only. The body is never copied into AuditLog.

### Enforcement

- USER → `User.status = SUSPENDED`, safe `suspensionReason` category, no reporter identity, no fabricated `suspendedUntil`
- REQUEST → `MODERATED_REMOVED` (row retained)
- RESPONSE → `deletedAt`
- MESSAGE → `deletedAt` without needing the body to perform the action.
  Soft-deleted bodies remain available to authorized report evidence.

Each enforcement writes `ModerationAction` + `AuditLog` in the same
transaction as the mutation.

### Suspension

Server-side: `requireActiveMember` / `SessionService.authenticate` reject
suspended accounts with `AUTH_ACCOUNT_SUSPENDED` after a valid session
is established.

`GET /v1/auth/session` may return `access.state = SUSPENDED` with a
truthful reason category so `/suspended` can render. This does not change
password hashing, cookie policy, token format, or HMAC storage.

No automatic timed restore. No fake appeal/support success (FC-020).
Sign out uses the existing signout path.

### Frontend

- Reusable Report and Block sheets (390 patterns, 44px targets)
- Founder profile: Report founder / Block founder
- Request surfaces: Report request; report/block the relevant founder
- Response/message menus: report that target when a safe control exists
- `/settings/blocked` real list + unblock
- `/suspended` truthful suspended state
- `/admin/reports` and `/admin/reports/[id]` minimum moderation UI
- Primary member nav remains five items
- Admin under ~900px uses existing unsupported pattern

### Out of scope

- FC-018 deletion/anonymization
- FC-019 admin user/role management, global audit browser, member admin
- FC-020 support/legal
- Admin global DM browser
- Neighboring-message or conversation browsing
- Fake notification/privacy preference persistence
