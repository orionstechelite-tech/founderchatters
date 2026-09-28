# FC-007 — Founder Application

## Scope

Founder-facing application only:

- `GET /v1/application/me`
- `PUT /v1/application/me`
- `POST /v1/application/me/submit`
- `POST /v1/application/me/resubmit`
- `/application`

FC-008 admin review actions and UI are explicitly excluded.

## Approved product decisions

These rules are authoritative for implementation. Figma remains read-only.

- **Eligibility copy:** 390 wording is canonical at every breakpoint:
  Founder / Co-founder, Founding team / operator, Not currently building.
  Map to `FOUNDER_COFOUNDER`, `FOUNDING_TEAM_OPERATOR`,
  `NOT_CURRENTLY_BUILDING`. Do not use legacy desktop eligibility wording.
- **Name:** Do not add “Your name” to `FounderApplication`. Display name
  belongs to FounderProfile / onboarding / profile.
- **Role:** Keep `roleTitle`. Show Role on desktop and mobile.
- **Location:** Persist structured `city` and `country`. Group them visually
  under a Location section with separate City and Country inputs.
- **Submitted application:** `SUBMITTED` is founder read-only. Use “View
  application”, never founder “Edit application”. Founder editing is allowed
  only in `DRAFT` and `NEEDS_INFO`.
- **Review step:** Keep the current minimal same-route review state. Do not
  create a new route or a standalone frozen screen. The company step may lead
  to in-route review before explicit submit/resubmit.
- **NOT_CURRENTLY_BUILDING:** Ineligible to submit. The value may exist on a
  `DRAFT`. The founder must not enter the company/details flow while it is
  selected, must not submit, and must not land on the company form after
  refresh. Show a clear ineligible state, allow changing eligibility, and keep
  any previously entered eligible draft fields. Do not create a permanent
  rejection status or convert this choice into `REJECTED`.
- **decidedAt:** Terminal admin decisions only (`APPROVED`, `REJECTED`).
  `NEEDS_INFO` must not use `decidedAt`. Founder submit/resubmit must not
  set or clear `decidedAt`. `ApplicationStatusEvent` is the historical record.
- **STATE CONTRACT panel:** Design annotation only. Do not render it.

## Implementation decisions

- The existing `FounderApplication` and `ApplicationStatusEvent` models satisfy
  FC-007. No schema change or migration is required.
- An absent application returns the standard `APPLICATION_NOT_FOUND` response.
  The frontend treats this as the start of a new application.
- Founder edits are allowed only in `DRAFT` and `NEEDS_INFO`.
- `SUBMITTED`, `APPROVED`, and `REJECTED` applications are founder-read-only.
- Initial submit is `DRAFT → SUBMITTED`; resubmit is
  `NEEDS_INFO → SUBMITTED`.
- Transition and `ApplicationStatusEvent` creation are atomic. Conditional
  status updates prevent duplicate events during concurrent requests.
- Concurrent first `PUT` create races map `P2002` to a follow-up update so
  exactly one application exists.
- Founder-driven transition events use the authenticated founder as the actor.
- `submittedAt` is set by the server on every successful submit/resubmit.
  Founder transitions never write `decidedAt`.
- Only the latest needs-info note is exposed to its founder. Event history,
  actor IDs, and internal review data are not returned.
- Company websites accept only HTTP(S) URLs without embedded credentials.
- `NOT_CURRENTLY_BUILDING` may be saved as draft data. Submit is rejected
  server-side. The UI keeps that draft on the eligibility/ineligible state.

## Figma sources

- Desktop: `18:2`, `18:31`, `18:72`
- 390 responsive: `136:43`, `136:62`, `136:93`
- Responsive Completion contract: `135:3`
- Components: Button `12:34`, Field `15:43`

Figma was used read-only.

## Resolved design discrepancies

Desktop frames `18:2`, `18:31`, and `18:72` conflict with the 390 frames
`136:43`, `136:62`, and `136:93`, and with the frozen Prisma schema.

Human-approved interpretation:

- Persist only schema fields: eligibility, company, role, website, city,
  country, and building summary. No application-level name field.
- Use the 390 eligibility values at every breakpoint because they map 1:1
  to `APPLICATION_ELIGIBILITY_ROLES`.
- Keep Role visible at all breakpoints.
- Keep City and Country as separate structured inputs, grouped visually as
  Location.
- Keep submitted applications read-only and use “View application”.
- Keep a minimal in-route review summary so 390 “Review application” has an
  explicit submit/resubmit action.

The 390 founder/company and status frame screenshots also constrain wrapped
headings to 30px and visibly overlap following copy. The implementation uses
normal content flow with the same typography and hierarchy so text remains
readable and accessible. The 390 “STATE CONTRACT” annotation is a design
spec, not product UI, and is not rendered.

## Responsive behavior

- 1440 uses the canonical centered hero and two-column form/status layout.
- 1024 retains two columns with narrower fluid tracks.
- At 768, content becomes one column with a compact application header.
- At 390, fields and actions are full-width within 20px gutters, city/country
  stack, controls remain at least 44px tall, and content cannot overflow
  horizontally. Layout uses `min-width: 0` and `overflow-wrap` rather than
  `overflow-x: clip`.
