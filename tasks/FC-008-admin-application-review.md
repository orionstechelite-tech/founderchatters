# FC-008 — Admin Application Review

## Scope

Admin application review only:

- `GET /v1/admin/applications`
- `GET /v1/admin/applications/:id`
- `POST /v1/admin/applications/:id/needs-info`
- `POST /v1/admin/applications/:id/approve`
- `POST /v1/admin/applications/:id/reject`
- `/admin/applications`
- `/admin/applications/[id]`

FC-009 onboarding and FC-019 admin-user/role management are excluded.
Founder-facing FC-007 behavior is unchanged.

## Approved product decisions

These rules are authoritative for implementation. Figma remains read-only.
No Prisma schema change or migration is required.

### RBAC

Canonical permission keys:

- `admin.applications.read`
- `admin.applications.needs_info`
- `admin.applications.approve`
- `admin.applications.reject`

Do not collapse these into a generic `applications.manage` permission.

Canonical role keys:

- `SUPER_ADMIN`
- `APPLICATION_REVIEWER`
- `OPERATIONS`
- `MODERATOR`
- `SUPPORT`
- `ANALYST_READONLY`

Explicit grants:

- `SUPER_ADMIN`, `APPLICATION_REVIEWER`, and `OPERATIONS` receive all four
  FC-008 permissions.
- `MODERATOR`, `SUPPORT`, and `ANALYST_READONLY` receive none of these
  permissions.

`SUPER_ADMIN` has no hardcoded authorization bypass. It must pass through
the same permission lookup as every other role.

Server-side permission checks are authoritative. UI hiding is supplemental.
Authorization requires a valid authenticated session first. Suspended and
deleted users remain blocked. Expired and revoked sessions keep existing
auth behavior.

Queue and detail require `admin.applications.read`.
Needs info requires `admin.applications.needs_info`.
Approve requires `admin.applications.approve`.
Reject requires `admin.applications.reject`.

Missing permission returns `ADMIN_PERMISSION_DENIED`. Role and permission
catalog details are not exposed in API errors.

Local/test fixtures may create fictional, idempotent roles and permissions.
Do not assign roles to real users. Admin-user management belongs to FC-019.

### Queue

- Route: `GET /v1/admin/applications`
- Frontend: `/admin/applications`
- Tabs: Pending = `SUBMITTED`, Needs info = `NEEDS_INFO`, Approved =
  `APPROVED`, Rejected = `REJECTED`
- `DRAFT` never appears in the admin review queue or as a reviewable detail
- Default tab: Pending
- Page size: 5
- Pending order: `submittedAt ASC`, then stable `id ASC`
- Needs info order: `updatedAt DESC`, then stable `id DESC`
- Approved/Rejected order: `decidedAt DESC`, then stable `id DESC`
- Filters in FC-008: status tabs and Country only
- Industry filter, Reviewer filter, and summary metric cards are deferred

Queue responses include only review-needed fields: application id, status,
eligibility role, company, role title, city, country, timestamps, applicant
email, and email-verified state. Do not fabricate a founder name. Do not
expose password hashes, sessions, tokens, Redis identifiers, or unrelated
private user fields.

### Detail

- Route: `GET /v1/admin/applications/:id`
- Frontend: `/admin/applications/[id]`
- Applicant identity uses the generic label “Applicant”
- Show `User.email` and email-verified state
- Show current application fields: eligibility, company, role, website,
  city, country, building summary, status, submitted timestamp, decided
  timestamp where applicable, and the latest relevant review note
- Location may be composed as `city, country`
- Do not add or fabricate founder display name, stage, industry, LinkedIn,
  can-help, needs-help, reviewer/assignee, previous-application count, or
  analytics. Those Figma fields are not in the current schema/lifecycle.

### Admin state machine

Only these admin transitions are allowed:

- `SUBMITTED → NEEDS_INFO`
- `SUBMITTED → APPROVED`
- `SUBMITTED → REJECTED`

No admin decisions from `DRAFT`, `NEEDS_INFO`, `APPROVED`, or `REJECTED`.
`NEEDS_INFO` cannot go directly to `APPROVED`/`REJECTED`. The founder must
resubmit `NEEDS_INFO → SUBMITTED` through FC-007 first.
`APPROVED` and `REJECTED` remain terminal for MVP. No automatic reopen.

### Needs info

- Required founder-visible note, trimmed, empty/whitespace rejected, max
  2000 characters
- Preserve founder application fields
- Do not set `decidedAt`
- Do not alter `submittedAt`
- `ApplicationStatusEvent`: `SUBMITTED → NEEDS_INFO`, actor = reviewer,
  note = validated founder-visible feedback
- `AuditLog` action: `application.needs_info`
- No separate internal-note feature

### Approve

- No approval note required
- Set `decidedAt` to server time
- Preserve `submittedAt`
- Do not mark onboarding complete
- Do not create `FounderProfile` or onboarding data
- `ApplicationStatusEvent`: `SUBMITTED → APPROVED`, no fabricated note
- `AuditLog` action: `application.approved`
- Existing access-state logic produces `APPROVED` + incomplete onboarding
  → `ONBOARDING`

### Reject

- Required reason, trimmed, empty/whitespace rejected, max 2000 characters
- Set `decidedAt` to server time
- Preserve `submittedAt`
- `REJECTED` remains terminal
- `ApplicationStatusEvent`: `SUBMITTED → REJECTED`, note = rejection reason
- `AuditLog` action: `application.rejected`
- FC-008 does not newly expose rejection reasons on founder-facing UI

### decidedAt

- `SUBMITTED → NEEDS_INFO`: `decidedAt` remains null
- `SUBMITTED → APPROVED`: `decidedAt` = server timestamp
- `SUBMITTED → REJECTED`: `decidedAt` = server timestamp
- Never modify `submittedAt` during an admin decision

### Atomicity

Every successful review action atomically performs a conditional
`status = SUBMITTED` update, an `ApplicationStatusEvent` insert, and an
`AuditLog` insert in one database transaction. Exactly one concurrent
transition can win. The loser receives `ADMIN_ACTION_INVALID_STATE`, and
creates no event or audit record.

### Audit

Stable action names:

- `application.needs_info`
- `application.approved`
- `application.rejected`

`AuditLog` is append-only accountability. `ApplicationStatusEvent` is
domain state history. Do not rewrite, update, or delete history, and do
not store full application snapshots or auth secrets in metadata.

### Admin UI

- Use existing FC-004 `AdminShell`
- 1440 canonical admin layout
- 1024 supported compact admin layout
- Under ~900px show the existing approved unsupported admin state
- Do not create a mobile admin interface
- Decision actions render only for `SUBMITTED` and only when the
  corresponding permission is present
- Concurrent conflict refetches authoritative server state and shows a
  safe message: “This application was already reviewed by another
  administrator.”

## Implementation decisions

- Existing Prisma models are sufficient: `FounderApplication`,
  `ApplicationStatusEvent`, `AuditLog`, `AdminRole`, `Permission`,
  `RolePermission`, `UserAdminRole`
- The smallest reusable server-side authorization layer loads a permission
  set from role-permission joins after session authentication
- Fictional idempotent RBAC fixtures live in `ensureAdminRbac` and are
  applied from tests/local fixture helpers only. They refuse to run when
  `NODE_ENV=production`. Production APIs only READ existing RBAC rows.
  FC-019 will provision real admin-user/role assignments; FC-008 does not
  assign roles to real users.
- Country filtering is a Prisma parameterized case-insensitive equality
  match, always combined with the selected status. Blank country means all
  countries. `DRAFT` cannot leak through the filter.
- `latestReviewNote` is the note on the latest status event only when that
  event’s `toStatus` matches the current application status and the status
  is `NEEDS_INFO` or `REJECTED`. After resubmit or approval it is null, so
  a prior needs-info note is not shown as the current decision reason.
- Decision bodies are field-whitelisted. Needs-info accepts only `note`,
  reject accepts only `reason`, and approve accepts no decision fields.
  Unknown keys including `status`, `decidedAt`, `submittedAt`, and actor
  ids are rejected.
- `DRAFT` detail requests return `APPLICATION_NOT_FOUND`
- Invalid admin decisions on reviewable non-submitted states return
  `ADMIN_ACTION_INVALID_STATE` (409)
- Decision-text validation uses `fieldErrors` and HTTP 400
- Mutations keep `OriginGuard`

## Figma sources

- Admin queue: `74:117`
- Admin detail: `77:33`
- RBAC matrix: `76:297`
- Admin unsupported small screen: `137:201`

Figma was used read-only. Industry, reviewer, metric cards, and
profile/onboarding fields that are not in the current schema are deferred.

## Responsive behavior

- 1440 uses the canonical admin shell and two-column detail layout
- 1024 keeps the supported compact admin shell and stacks detail columns
- Under 900px the existing desktop-required unsupported state replaces the
  admin workspace
