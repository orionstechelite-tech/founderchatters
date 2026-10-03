# FC-018 — Account deletion

**Status:** completed after local validation.
**Branch:** `fc-018-account-deletion`
**No commit / no push / no PR.**
**Figma remains READ-ONLY.**
**No Prisma schema change. No migration.**

Human approval covers **implementation and testing of this workflow using
test fixtures only**. It does **not** authorize production or real-user
deletion, deployment, or destructive production migrations.

FC-019 admin operations and FC-020 public legal/support are out of scope.

## Figma sources (read-only)

- Delete Account 390: `136:200`
- Button: `12:34`
- Field: `15:43`

## Approval boundary

- ACTIVE_MEMBER self-service deletion only.
- Suspended-user deletion / privacy-request handling is **not** implemented.
  Documented under Legal TODO.
- No admin-initiated user deletion (FC-019).
- No real/production accounts.

## API

`POST /v1/me/account/delete`

Body:

```json
{ "confirmation": "DELETE" }
```

- ACTIVE_MEMBER + OriginGuard
- Caller identity from the session only
- Strict unknown-field rejection
- Confirmation is trimmed, then must equal exactly `DELETE`
- Case variants and other strings cause **no mutation**
- Success: `204 No Content` and the session cookie is cleared

No current-password confirmation (Figma specifies typed DELETE only).

## Transaction

In one transaction where practical:

1. `User.status = DELETED`, `User.deletedAt = now`
2. Email → collision-resistant `deleted-<random hex>@deleted.invalid`
   (never derived from the former email or user id; uniqueness is
   re-checked inside the deletion transaction)
3. Password hash replaced by hashing an unguessable random secret via the
   existing Argon2id `PasswordHasher`
4. Revoke **all** sessions (`revokedAt = now`)
5. Mark unused email-verification and password-reset tokens `usedAt = now`
6. Anonymize `FounderProfile` / `Company`
7. Remove `FounderExpertise` / `FounderNeed`
8. Remove `SavedFounder` rows where the user is saver **or** saved
9. Scrub optional `FounderApplication` identity fields; keep id/status/timestamps/events
10. Remove `UserAdminRole` assignments for this user only
11. Fail queued/retry `NotificationDelivery` rows for this user with
    `ACCOUNT_DELETED` (no provider send)
12. Clear in-app notification `href` values that point at `/founders/<id>`
13. Write `AuditLog` action `ACCOUNT_DELETED`

The User row is **not** hard-deleted.

## Anonymization

Profile:

- `displayName` = `Deleted founder`
- clear headline, bio, city, country, avatarUrl, customExpertise, currentNeedText

Company (if present):

- `name` = `Deleted account`
- clear website, description, stage, industry, city, country

Application optional PII cleared: eligibilityRole, companyName, roleTitle,
website, city, country, buildingSummary.

Tombstone email is never shown as a member-facing identity.

## Blocks (FC-017)

**Retain** `Block` rows for safety/integrity review.

Deleted accounts are **excluded** from `GET /v1/me/blocks` so they do not
appear as browsable founders in member UI.

## Historical integrity (retained)

Requests, responses, conversations, participants, messages, help
confirmations, contributions, thank-you notes, reports, moderation
actions, audit logs, application status events.

Message bodies are not rewritten and are never copied into AuditLog.

Member serializers that still display an author/sender/helper for a
deleted user return a generic tombstone (`Deleted founder` /
`Deleted account`, no avatar/city/email). The live founder profile and
discover surfaces continue to treat DELETED as not found / ineligible.

Published/resolved request history remains GET-visible to other members
with that tombstone author. New help, introductions, messaging, and
confirmations still require an eligible ACTIVE counterpart — a deleted
account cannot receive new interactions.

## Notifications

- Delivery worker must not send when `User.status === DELETED` or
  `deletedAt` is set.
- Pending EMAIL deliveries are terminally `FAILED` with `ACCOUNT_DELETED`.
- Outbound EMAIL send and account deletion share `User FOR UPDATE`.
  The provider call is made while that lock is held so a committed
  deletion is always visible before a send starts, and an in-flight
  send finishes under the pre-deletion address before deletion can
  commit.
- No provider call to the former address after committed deletion.
- Former email is not logged.

## Frontend

`/settings/account` keeps the existing account details and adds a
separated danger zone. “Delete account” opens the Figma 390 confirmation
sheet (project Button/Field/safety-sheet). Success clears the session and
navigates to `/signin`.

Primary member nav remains five destinations.

## Legal TODO — required, unresolved

LEGAL REVIEW REQUIRED before production launch. This MVP does **not**
claim GDPR/CCPA completion and does **not** invent a retention period.

Historical free-text and safety/legal records are **retained** and only
identity fields implemented above are anonymized. Legal must decide
retention/redaction for:

- request headline / context / whoCouldHelp
- response body
- private message body
- thank-you text
- report details
- support messages / support email (FC-020)
- application event / admin notes
- moderation notes
- audit retention period
- fraud/abuse prevention retention
- re-registration / account-reuse policy
- suspended-account deletion / privacy-request handling
- whether Block rows should later be redacted beyond current retain+hide

Do not silently destroy these records. Do not pretend they are legally
required forever.
