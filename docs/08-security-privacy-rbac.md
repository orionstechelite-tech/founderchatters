# 08 — Security, Privacy & RBAC

## Authentication
- Argon2id
- hashed single-use expiring verification/reset tokens
- server-side sessions
- secure HttpOnly cookies
- rate limits
- session rotation after password change

## Authorization
UI hiding is not authorization.
All permissions enforced server-side.

## Suggested roles
- SUPER_ADMIN
- APPLICATION_REVIEWER
- MODERATOR
- SUPPORT
- OPERATIONS
- ANALYST_READONLY

Permissions should be granular and separate from roles.

FC-019 catalog (authoritative keys live in `ADMIN_PERMISSIONS`):
application read/needs_info/approve/reject; reports read/moderate;
members read/suspend/restore; overview.read; requests.read;
support read/reply/status; reputation.read; notifications read/retry;
taxonomy read/manage; analytics.read; admins read/manage; roles.read;
audit.read; settings.read; system.read; jobs read/retry; search.read.

Least-privilege grants:
- SUPER_ADMIN: all catalog keys through `RolePermission` rows only
- APPLICATION_REVIEWER: application permissions only
- OPERATIONS: applications + overview, members.read, requests, support,
  reputation, notifications read/retry, taxonomy, analytics, search
- MODERATOR: reports + members.read/suspend/restore
- SUPPORT: members.read + support read/reply/status
- ANALYST_READONLY: overview.read + analytics.read

SUPER_ADMIN has no hardcoded authorization bypass.
Last effective SUPER_ADMIN assignment is lock-protected.
Actors cannot grant a role whose permission union exceeds their own.

Predefined Permission / AdminRole / RolePermission rows are synchronized
only by the explicit operator command `npm run admin:rbac:sync`. It does
not run at application startup, does not assign UserAdminRole, and does
not create a first admin. Initial production UserAdminRole assignment
remains a controlled operational procedure outside HTTP.

## Private messages
- no global Admin inbox/browser
- report-scoped evidence only when necessary
- evidence access audited
- minimize copied message content

## Public support
`POST /v1/support/cases` is unauthenticated and OriginGuard-protected.

Optional session association uses session inspect, not
`requireActiveMember`. Suspended, unverified, applicant, and active
accounts may file support. Deleted accounts fall back to guest. A stale
or invalid cookie is treated as a guest. Signed-in identity email is
server-known and cannot be overridden by the client body.

Rate limit: 5 submissions / 15 minutes per hashed client identity
(`support-rate:v1:create:<hash>`), plus a hashed normalized-email
dimension (`support-rate:v1:email:<hash>`). Redis failure fails closed
to HTTP 429. Raw IP addresses are not persisted.

Support message bodies are not copied into logs, analytics, audit
metadata, rate-limit keys, or API error output.

Public safety support contacts the support team. It does not replace
in-product report/block (FC-017) and does not expose private DMs or
reporter identity.

## Audit
Append-only logical audit entries for:
- application decisions
- suspensions/restores
- report outcomes
- request moderation
- admin-role changes
- session revocation by Admin
- account deletion
- taxonomy merges
- sensitive exports
- meaningful job retries

## Account deletion
1. deliberate confirmation
2. revoke sessions
3. mark deleted
4. anonymize public profile identity
5. preserve non-identifying integrity records where required
6. audit action

Legal retention periods require legal review.
