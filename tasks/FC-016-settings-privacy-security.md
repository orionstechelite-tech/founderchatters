# FC-016 — Settings Privacy Security

## Objective

Implement the member Settings experience using the frozen member route contract,
existing FounderProfile / Company / Session / User schema, the existing
server-side authentication model, and the approved responsive Settings patterns.

FC-016 owns settings routes, profile settings, account/security presentation,
password change, active-session management, and session revocation.

## Queue contract

- ID: FC-016
- Title: Settings privacy security
- Phase: member
- Authorization: AUTO_LOCAL
- Depends on: FC-015
- Acceptance:
  - settings routes
  - session revoke
  - 390 settings pattern

`tasks/queue.json` remains `pending` until implementation and validation pass.

## Sources

Repository:
- `docs/06-frontend-route-contract.md`
- `docs/07-responsive-implementation-policy.md`
- `docs/08-security-privacy-rbac.md`
- `docs/13-figma-source-map.md`
- `tasks/FC-005-auth-sessions.md`
- `tasks/FC-010-founder-profile-discover.md`
- existing auth, onboarding, founder, member-shell, and notification code

Figma, READ-ONLY:
- Settings Profile desktop: `34:2`
- Settings Profile 390: `136:109`
- Settings Privacy & Security 390: `136:141`

No Figma writes are authorized.

## Member routes

Implement the frozen route-contract paths:

- `/settings/profile`
- `/settings/account`
- `/settings/notifications`
- `/settings/privacy`
- `/settings/blocked`
- `/settings/security`

All routes are ACTIVE_MEMBER-only through the existing member shell/session gate.

Settings routes do not add a sixth primary member-navigation destination.

Primary navigation remains exactly:

1. Home
2. Discover
3. Ask
4. Messages
5. Profile

For `/settings/*`, the primary navigation has a neutral active state.

## Shared Settings layout

Desktop:
- member top shell remains project-native
- SETTINGS kicker
- `Account & preferences` hero
- settings navigation on the left
- active settings content on the right

Settings navigation:

- Profile
- Account
- Notifications
- Privacy
- Blocked users
- Security

Delete account is not an FC-016 route or action.

Responsive:
- follow `docs/07-responsive-implementation-policy.md`
- desktop sidebar becomes a compact section selector / compact navigation on small screens
- content stacks full width
- minimum 44px interactive targets
- retain the existing five-item mobile bottom navigation
- no horizontal overflow at 390px

## Profile settings

FC-010 intentionally deferred post-onboarding profile editing to a later task.
FC-016 owns this editor.

Persist only already-existing fields.

Editable FounderProfile fields:
- displayName
- city
- country
- headline
- bio

Editable Company fields required by the Figma Profile settings frame:
- name

Do not modify:
- User.id
- email
- verification state
- application state
- onboardingCompletedAt
- admin/security fields
- contribution/reputation history
- createdAt

Validation:

- displayName: reuse existing onboarding semantics, 2–100 chars
- company name: reuse existing onboarding semantics, 2–120 chars
- city: optional, max 100
- country: optional, max 100
- headline: optional, normalized single-line text, max 160
- bio: optional multiline text, max 1000

FC-016 engineering decisions:
- headline max 160
- bio max 1000

These two bounds are FC-016 application limits; the source Figma does not
specify character limits.

Profile updates are partial.
Unknown/protected fields are rejected.

No profile mutation may alter application or identity ownership fields.

## Profile settings API

Add member settings contracts and endpoints:

- `GET /v1/me/settings/profile`
- `PATCH /v1/me/settings/profile`

Response contains only the editable member-visible profile fields required by
the settings UI.

PATCH requires:
- authenticated ACTIVE member
- OriginGuard
- strict field allowlist
- server-side validation

GET is side-effect free.

## Account settings

`/settings/account` shows real account information only:

- account email
- email verification state
- membership/account status that is already safe for the caller

Do not implement:
- email change
- alternate email
- phone number
- billing/subscription settings
- fabricated account preferences

No fake editable control is rendered for unsupported account changes.

## Notification settings

`/settings/notifications` provides truthful current behavior and access to the
notification center.

FC-015 created notifications and delivery jobs, but no per-user notification
preference model exists.

Therefore FC-016 does NOT:
- create preference columns/models
- add fake email/push toggle persistence
- add a Prisma migration
- pretend unsupported channels are configurable

The page may link to `/notifications` and explain the currently supported
notification behavior.

## Privacy settings

Figma `136:141` provides the visual pattern and current platform policy:

Direct messages:
- founders communicate through request-linked help/conversation flows
- generic unsolicited direct messaging is not introduced

Profile visibility:
- member founder profile is visible inside the eligible founder network
- private conversations are not globally browseable

These are current platform rules, not mutable per-user preferences.

Because no persisted privacy-preference model exists, FC-016 does NOT create
fake toggles or a fake successful `Save privacy settings` mutation.

Approved design deviation:
- the Figma Save privacy settings action is omitted until an actual mutable
  privacy preference contract exists.

## Blocked users

Route:
- `/settings/blocked`

FC-017 owns:
- creating/removing blocks
- report/block UI
- block safety behavior
- moderation integration

FC-016 may provide the Settings route and explanatory state, but must not
implement, mutate, or fabricate block management.

Do not expose Block rows through a new API in FC-016.

## Security settings

`/settings/security` owns:

- change password
- view active sessions
- revoke another session
- revoke all other sessions

Existing Session fields are sufficient.
No schema or migration is required.

### Session list

Add:

- `GET /v1/me/sessions`

Return active sessions for the authenticated user only.

Only sessions with:
- `revokedAt = null`
- `expiresAt > now`

are returned.

Deterministic ordering:
1. `createdAt DESC`
2. `id DESC`

Safe response fields:
- id
- userAgent
- createdAt
- expiresAt
- current

Do not expose:
- tokenHash
- raw token
- ipHash
- another user's session
- internal HMAC values

The caller's current session is identified using `AuthPrincipal.sessionId`.

### Revoke one session

Add:

- `DELETE /v1/me/sessions/:id`

Requirements:
- authenticated ACTIVE member
- OriginGuard
- caller-owned session only
- idempotent for an already-revoked caller-owned session where practical
- nonexistent / foreign session uses one enumeration-safe not-found response

FC-016 error:
- `SETTINGS_SESSION_NOT_FOUND`

Message must not reveal whether a foreign session ID exists.

The current session is not revoked through this endpoint.
Current-device logout remains the existing `/v1/auth/signout`.

### Revoke all other sessions

Add:

- `POST /v1/me/sessions/revoke-others`

Requirements:
- authenticated ACTIVE member
- OriginGuard
- current session remains valid
- revoke all other currently unrevoked sessions for the caller
- idempotent
- return updated/revoked count

No audit log is required for a member revoking their own sessions.
The security document's admin-session-revocation audit requirement applies to
future admin operations.

## Change password

Add:

- `POST /v1/me/password`

Request:
- currentPassword
- newPassword
- confirmPassword

Rules:
- current password must verify against the stored hash
- new password uses the existing 12–128 character password contract
- confirmation must match
- new password must not be accepted through unknown/protected fields
- OriginGuard required
- generic safe credential error for incorrect current password

On successful password change:

1. update `User.passwordHash`
2. revoke every other active session for the user
3. keep the authenticated current session valid

This satisfies the FC-016 security goal without forcing a logout immediately
after a deliberate authenticated password change.

Password-reset token behavior remains owned by FC-006 and is not modified.

## Session isolation

A member must never be able to:

- enumerate another user's sessions
- revoke another user's session
- retrieve tokenHash
- retrieve ipHash
- use a guessed session ID to determine whether it exists

All ownership checks are server-side.

## Member menu / entry point

The existing top-right member `•••` control must provide a real Settings entry
rather than remaining a dead control.

Keep implementation small and accessible.

At minimum:
- Settings → `/settings/profile`
- Notifications → `/notifications`
- Sign out → existing signout flow

Do not duplicate primary navigation destinations unnecessarily.

## Frontend profile presentation

Desktop follows Figma `34:2` intent:

- SETTINGS
- Account & preferences
- Profile navigation active
- Founder profile heading
- explanatory copy
- Display name
- Company
- Location represented by existing city/country data
- Headline
- Bio
- Save changes

Do not copy Figma sample founder/company text into production fixtures.

Use real API data.

## 390 Settings Profile

Follow Figma `136:109`:

- top title `Settings`
- compact top member control
- full-width settings form
- compact section navigation
- save action remains accessible
- destructive account actions stay separated
- five primary member nav destinations remain unchanged

## 390 Privacy & Security

Follow Figma `136:141`:

- `Settings`
- `Privacy & Security`
- compact section navigation
- Direct messages policy card
- Profile visibility policy card
- Security card
- Change password entry
- Active sessions entry
- full-width mobile cards
- no horizontal overflow
- five-item bottom member navigation unchanged

The Figma `Save privacy settings` button is intentionally omitted because FC-016
has no real mutable privacy preference model.

## Delete account boundary

Account deletion is FC-018 and has `HUMAN_APPROVAL_REQUIRED`.

FC-016 must not:
- delete users
- mark users deleted
- anonymize profiles
- revoke all sessions as an account-deletion workflow
- add delete-account API
- implement the Figma delete-account confirmation frame

A non-action informational reference may say account deletion is unavailable,
but no destructive control is introduced.

## FC-017 boundary

Do not implement:
- report creation
- block/unblock mutation
- moderation
- suspension
- report evidence
- reporter privacy workflows

Those belong to FC-017.

## FC-020 boundary

Do not implement public:
- privacy legal page
- terms
- support pages

Those belong to FC-020.

## Schema / migration

NO Prisma schema change.
NO migration.

Existing models already cover:
- User
- FounderProfile
- Company
- Session

## Contracts

Add typed settings contracts in `packages/contracts`.

Suggested groups:

- `SETTINGS_ERROR_CODES`
- `SETTINGS_LIMITS`
- `MemberProfileSettings`
- `MemberProfileSettingsResponse`
- `UpdateMemberProfileSettingsRequest`
- `MemberAccountSettingsResponse`
- `MemberSession`
- `MemberSessionsResponse`
- `SessionRevokedResponse`
- `OtherSessionsRevokedResponse`
- `ChangePasswordRequest`
- `ChangePasswordResponse`

Do not expose Prisma models directly.

## Testing

API coverage:

Profile:
- authentication / ACTIVE member requirement
- GET caller profile settings
- PATCH persists allowed fields
- partial update
- validation bounds
- protected / unknown fields rejected
- no cross-user mutation
- OriginGuard
- no mutation on GET

Sessions:
- caller-only active sessions
- current session flag
- deterministic ordering
- expired/revoked excluded
- foreign session enumeration-safe
- revoke one other session
- revoke-all-others
- current session preserved
- repeated revoke-all is idempotent
- tokenHash/ipHash never exposed

Password:
- incorrect current password rejected safely
- weak new password rejected
- confirmation mismatch rejected
- successful change updates hash
- old password no longer signs in
- new password signs in
- other sessions revoked
- current authenticated session remains usable
- OriginGuard

Web coverage:

- all six Settings routes render through the member shell
- profile form loads real values and saves
- validation errors preserve typed values
- account page uses real session/account data
- notification settings contains no fake preference controls
- privacy page contains no fake persisted toggle/save behavior
- blocked route does not implement FC-017 actions
- security lists sessions and revokes another session
- revoke-all action works
- password change flow works
- exactly five primary nav destinations remain
- `/settings/*` does not falsely activate a primary nav item
- 390 Profile pattern
- 390 Privacy & Security pattern
- no horizontal overflow intent
- automated accessibility checks for primary Settings surfaces

## Validation gates

Before completion:

1. focused API tests
2. focused web tests
3. full `npm run validate`
4. change queue FC-016 `pending` → `completed`
5. completed-state `npm run validate`
6. `git diff --check`
7. `npx prisma validate`
8. confirm no schema/migration changes
9. inspect status/stat
10. stage
11. review staged diff
12. commit only after explicit user approval

No push, PR, merge, deployment, or Figma write without explicit approval.