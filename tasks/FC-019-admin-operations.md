# FC-019 — Admin operations

**Status:** completed locally after concurrency hardening.
`tasks/queue.json` FC-019 is `completed`.
**Branch:** `fc-019-admin-operations`
**No commit / no push / no PR.**
**Figma remains READ-ONLY.**
**No Prisma schema change. No migration.**

Human approval covers **local implementation and tests with fictional
fixtures only**. It does not authorize production admin promotion,
real-user suspension/restore, production job retries, or deployment.

FC-020 public support/legal, FC-021 QA, FC-022/023 are out of scope.

## Frozen contract

1440 canonical, 1024 supported, `<900` unsupported desktop-required state.
No mobile Admin UI.

Backend RBAC is authoritative. SUPER_ADMIN has no hardcoded bypass.
Permission rows remain the grant source.

Private DMs are not globally browseable. Exact MESSAGE bodies remain
report-scoped (FC-017) and audited. Reputation stays HELPED-derived and
not editable. Deleted accounts stay anonymized tombstones (FC-018).

## Security / privacy assumptions

- OriginGuard on every unsafe admin mutation
- Strict unknown-field rejection
- Permission checked before sensitive lookup
- No passwords, tokens, cookies, ip hashes, provider secrets in output
- No conversation browser
- Last effective SUPER_ADMIN is lock-protected
- Actor role grants cannot exceed the actor’s effective permission union
- Self role-change / self-disable / self session-revoke via admin-user
  routes are rejected
- First-admin production UserAdminRole assignment remains an operational
  TODO (no public HTTP bootstrap)
- RBAC catalog sync is `npm run admin:rbac:sync` only; it is not started
  by AppModule, HTTP handlers, or workers

## Implemented routes

- `GET /v1/admin/session`
- `GET /v1/admin`
- `GET /v1/admin/members` `GET /v1/admin/members/:id`
- `POST /v1/admin/members/:id/suspend` `POST /v1/admin/members/:id/restore`
- `GET /v1/admin/requests` `GET /v1/admin/requests/:id`
- Existing applications + reports routes unchanged
- `GET/POST /v1/admin/support` reply/status
- `GET /v1/admin/reputation` `GET /v1/admin/reputation/:id`
- `GET /v1/admin/notifications` `/:id` templates read-only
- `POST /v1/admin/notifications/:id/retry` (delivery row)
- Taxonomy create/edit/merge
- `GET /v1/admin/analytics`
- `GET /v1/admin/admins` `/:userId` `PUT .../roles` `POST .../disable`
  `DELETE .../sessions` `GET /v1/admin/roles`
- `GET /v1/admin/audit` `/:id`
- `GET /v1/admin/settings` (read-only)
- `GET /v1/admin/system` `.../jobs` `.../jobs/:id` `POST .../retry`
- `GET /v1/admin/search`

## Permission matrix

See `ADMIN_PERMISSIONS` and `permissionsForRole` in `admin-rbac.ts`.

- SUPER_ADMIN: all catalog keys via RolePermission rows
- APPLICATION_REVIEWER: application read/decision only
- OPERATIONS: overview, applications, members.read, requests, support,
  reputation, notifications read/retry, taxonomy, analytics, search
- MODERATOR: reports, members.read/suspend/restore
- SUPPORT: members.read, support read/reply/status
- ANALYST_READONLY: overview.read, analytics.read

## Deferred / non-goals

- Contribution revoke / topic correction / thank-you removal
- Generic internal admin notes
- CSV / audit export
- Direct request edit / remove / reopen / resolve mutations
- Platform settings save
- Notification template CMS
- Appeal adjudication / reversing moderation
- Public support intake (FC-020)
- First-admin production bootstrap HTTP endpoint
- Arbitrary JobFailure retry without persisted business state
- Global private-message browser

## RBAC catalog provisioning

Production-safe core: `syncAdminRbacCatalog()` in `admin-rbac.ts`.

Operator command: `npm run admin:rbac:sync`
(`scripts/sync-admin-rbac-catalog.ts`).

- Idempotent upsert of predefined Permission, AdminRole, and RolePermission
  rows from `ADMIN_PERMISSIONS` / `permissionsForRole`
- Does not run at application startup
- Does not run from ordinary HTTP handlers
- Does not assign UserAdminRole or create a first admin
- Production requires `--confirm` or
  `ADMIN_RBAC_SYNC_CONFIRM=SYNC_ADMIN_RBAC_CATALOG`
- `ensureAdminRbac()` remains the test/local wrapper and still throws in
  production

First-admin UserAdminRole assignment remains a controlled operational
procedure outside HTTP. After one authorized admin exists, FC-019
admin-user APIs manage later assignments.

## Concurrency

- Member suspend/restore lock the User row (`lockUser` / `FOR UPDATE`)
  before reading status/`deletedAt`, then mutate + moderation + audit
  in the same transaction. Compatible with FC-018 deletion lock order.
- Admin role replace/disable lock `AdminRole SUPER_ADMIN` then the
  target User before status checks and `UserAdminRole` writes.
- Notification retry locks User then `NotificationDelivery`, re-reads
  both, and allows only FAILED/RETRY_QUEUED → QUEUED. SENT and already
  QUEUED cannot transition. Same delivery row; no second Notification.
- Job retry locks `JobFailure` then User then delivery; queue +
  `resolvedAt` + audit commit together.
- Taxonomy merge already locked both topics in sorted id order; it now
  also rejects an already-merged source. Historical RequestTopic /
  ContributionTopic IDs are unchanged.

## Schema / migration

None expected. None added.

## Validation

- Focused concurrency: `admin-ops.integration` 16 — passed
- Full suite: API 311, web 165, UI 7 — all passed
- `npm run validate` — passed
- `npx prisma validate` — schema valid
- `git diff --check` — clean
- `git diff -- prisma/schema.prisma` — empty
- No migration added
- Only FC-019 queue status changed (`pending` → `completed`)
- Figma unchanged (read-only)
- Nothing staged
