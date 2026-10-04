# FC-021 — End-to-end QA

## Frozen contract

Build acceptance, not more product scope. Automate the ten golden paths, responsive matrix, accessibility, permission/privacy regressions, and route smoke. Do not add appeal adjudication, schema, migrations, public test backdoors, or deployment.

## Baseline

- Branch: `fc-021-end-to-end-qa`
- HEAD at start: `b82ee0059c557b8865a5e216c50a8d8a196b56a3`
- FC-001 through FC-020 completed; FC-022 and FC-023 remain pending

## Playwright architecture

- Dependency: `@playwright/test` 1.63.0, `@axe-core/playwright` 4.13.0
- Config: `playwright.config.ts`
- Scripts: `npm run test:e2e`, `npm run test:e2e:headed`
- Browser: Chromium only
- Web server: `e2e/start-web.mjs` builds the web app with `E2E_WEB_BUILD=1` (skips Next standalone) then runs `next start` on port 3100, avoiding Next.js dev Fast Refresh / compiling flakes
- Workers: 1 — golden paths mutate a shared isolated database; isolation is by unique `@example.com` identities, not parallel workers
- Artifacts: traces/screenshots/videos on failure only; directories are gitignored

`npm run validate` does not install browsers, start Docker, or run Playwright.

## Safe local E2E environment

- `NODE_ENV=test`
- `EMAIL_PROVIDER=memory`
- PostgreSQL `founderchatters_e2e` on `127.0.0.1`
- Redis `127.0.0.1:6379/2`
- Web `http://localhost:3100`, API `http://localhost:4100`

## DB / Redis guard

`assertE2eSafety()` refuses destructive setup/cleanup unless:

- `NODE_ENV` is `test`
- database and Redis hosts are `localhost` / `127.0.0.1` / `::1`
- the database name identifies `e2e` or `test` use

Cleanup truncates only mutable E2E tables in that isolated database (`User`, `AuditLog`, `SupportCase`, `JobFailure`, `PlatformSetting` CASCADE). Taxonomy and Admin RBAC catalog are preserved. Redis is not flushed. Each Playwright test deletes only `auth-rate:v1:*` keys on Redis `/2` so shared localhost auth limits do not block later golden paths.

## Token / email strategy

The API process uses `InMemoryEmailDelivery`. Raw verification/reset tokens are never exposed over HTTP.

E2E Node helpers write a new hashed token using the same HMAC semantics as `AuthTokenService` (`founderchatters:${purpose}:v1\0${rawToken}`) and navigate the browser to `/verify-email?token=` or `/reset-password/[token]`. No `/test/token` or similar public backdoor exists.

## Production defects found

- Missing frozen `/signin` and `/signup` routes. Added AuthShell pages matching Figma copy and the email+password API contract. Regression: `apps/web/app/auth-session.test.tsx`.
- Verify-email Strict Mode remount cancelled the in-flight request and left the page on “Verifying your email”. Shared in-flight job now applies the first result after remount. Regression: `apps/web/app/auth-recovery.test.tsx`.
- Delete-account sheet did not restore focus to the trigger after Escape. Frozen a11y contract requires return focus. Regression: `apps/web/app/settings/settings.test.tsx`.
- Member shell cancelled an in-flight session load on remount (React Strict Mode / Fast Refresh), leaving “Loading your workspace…”. Shared in-flight session job applies the first result after remount.

## Golden paths

| ID | Spec | Result |
| --- | --- | --- |
| GP-01 | `admission.spec.ts` founder admission | passed |
| GP-02 | `requests.spec.ts` ask / publish / limit | passed |
| GP-03 | `help-reputation.spec.ts` advice without contribution | passed |
| GP-04 | `help-reputation.spec.ts` HELPED / STILL_TALKING / NOT_HELPFUL | passed |
| GP-05 | `messaging.spec.ts` intro consent | passed |
| GP-06 | `messaging.spec.ts` request-linked DM, draft, block | passed |
| GP-07 | `safety.spec.ts` report + no global Admin DM browser | passed |
| GP-08 | `support.spec.ts` public support | passed |
| GP-09 | `account-lifecycle.spec.ts` password reset | passed |
| GP-10 | `account-lifecycle.spec.ts` account deletion | passed |

## Route smoke

Coverage of every frozen route in `docs/06-frontend-route-contract.md`. Dynamic IDs come from fictional E2E fixtures (`e2e/fixtures/ops.ts`, `users.ts`, `requests.ts`, `helpers/tokens.ts`).

| Frozen route | Spec |
| --- | --- |
| `/` | `route-smoke.spec.ts`, `responsive.spec.ts`, `accessibility.spec.ts` |
| `/how-it-works` | `route-smoke.spec.ts`, `responsive.spec.ts` |
| `/for-founders` | `route-smoke.spec.ts`, `responsive.spec.ts` |
| `/guidelines` | `route-smoke.spec.ts` |
| `/privacy` | `route-smoke.spec.ts` |
| `/terms` | `route-smoke.spec.ts` |
| `/support` | `route-smoke.spec.ts`, `support.spec.ts`, `responsive.spec.ts`, `accessibility.spec.ts` |
| `/support/new?category=<type>` | `route-smoke.spec.ts`, `support.spec.ts`, `responsive.spec.ts`, `accessibility.spec.ts` |
| `/signin` | `route-smoke.spec.ts`, `responsive.spec.ts`, `accessibility.spec.ts` |
| `/signup` | `route-smoke.spec.ts`, `admission.spec.ts`, `responsive.spec.ts`, `accessibility.spec.ts` |
| `/verify-email` | `route-smoke.spec.ts`, `admission.spec.ts` |
| `/forgot-password` | `route-smoke.spec.ts`, `account-lifecycle.spec.ts`, `responsive.spec.ts` |
| `/reset-password/[token]` | `route-smoke.spec.ts`, `account-lifecycle.spec.ts` |
| `/application` | `route-smoke.spec.ts`, `admission.spec.ts`, `permissions.spec.ts` |
| `/onboarding` | `route-smoke.spec.ts`, `admission.spec.ts`, `permissions.spec.ts` |
| `/home` | `route-smoke.spec.ts`, `admission.spec.ts`, `responsive.spec.ts`, `accessibility.spec.ts` |
| `/ask` | `route-smoke.spec.ts`, `requests.spec.ts`, `responsive.spec.ts` |
| `/requests/[id]` | `route-smoke.spec.ts`, `requests.spec.ts`, `help-reputation.spec.ts`, `responsive.spec.ts`, `accessibility.spec.ts` |
| `/discover` | `route-smoke.spec.ts`, `responsive.spec.ts` |
| `/founders/[id]` | `route-smoke.spec.ts`, `responsive.spec.ts` |
| `/messages` | `route-smoke.spec.ts`, `messaging.spec.ts`, `responsive.spec.ts`, `accessibility.spec.ts` |
| `/messages/[conversationId]` | `route-smoke.spec.ts`, `messaging.spec.ts` |
| `/reputation` | `route-smoke.spec.ts`, `help-reputation.spec.ts`, `responsive.spec.ts` |
| `/notifications` | `route-smoke.spec.ts`, `responsive.spec.ts` |
| `/settings/profile` | `route-smoke.spec.ts`, `responsive.spec.ts` |
| `/settings/account` | `route-smoke.spec.ts`, `account-lifecycle.spec.ts`, `responsive.spec.ts`, `accessibility.spec.ts` |
| `/settings/notifications` | `route-smoke.spec.ts` |
| `/settings/privacy` | `route-smoke.spec.ts`, `responsive.spec.ts` |
| `/settings/blocked` | `route-smoke.spec.ts` |
| `/settings/security` | `route-smoke.spec.ts`, `responsive.spec.ts` |
| `/admin` | `route-smoke.spec.ts`, `responsive.spec.ts`, `accessibility.spec.ts` |
| `/admin/applications` | `route-smoke.spec.ts`, `admission.spec.ts`, `permissions.spec.ts`, `responsive.spec.ts` |
| `/admin/applications/[id]` | `route-smoke.spec.ts`, `admission.spec.ts` |
| `/admin/members` | `route-smoke.spec.ts`, `safety.spec.ts`, `responsive.spec.ts` |
| `/admin/members/[id]` | `route-smoke.spec.ts` |
| `/admin/requests` | `route-smoke.spec.ts` |
| `/admin/requests/[id]` | `route-smoke.spec.ts` |
| `/admin/reports` | `route-smoke.spec.ts`, `safety.spec.ts`, `responsive.spec.ts` |
| `/admin/reports/[id]` | `route-smoke.spec.ts`, `safety.spec.ts` |
| `/admin/support` | `route-smoke.spec.ts`, `responsive.spec.ts` |
| `/admin/support/[id]` | `route-smoke.spec.ts` |
| `/admin/reputation` | `route-smoke.spec.ts` |
| `/admin/reputation/[id]` | `route-smoke.spec.ts` |
| `/admin/notifications` | `route-smoke.spec.ts` |
| `/admin/notifications/[id]` | `route-smoke.spec.ts` |
| `/admin/notifications/templates` | `route-smoke.spec.ts` |
| `/admin/notifications/templates/[id]` | `route-smoke.spec.ts` |
| `/admin/taxonomy` | `route-smoke.spec.ts` |
| `/admin/analytics` | `route-smoke.spec.ts` |
| `/admin/admins` | `route-smoke.spec.ts`, `permissions.spec.ts`, `responsive.spec.ts` |
| `/admin/admins/[id]` | `route-smoke.spec.ts` |
| `/admin/roles` | `route-smoke.spec.ts`, `responsive.spec.ts` |
| `/admin/audit` | `route-smoke.spec.ts`, `responsive.spec.ts` |
| `/admin/audit/[id]` | `route-smoke.spec.ts` |
| `/admin/settings` | `route-smoke.spec.ts` |
| `/admin/system` | `route-smoke.spec.ts`, `responsive.spec.ts` |
| `/admin/system/jobs` | `route-smoke.spec.ts` |
| `/admin/system/jobs/[id]` | `route-smoke.spec.ts` |
| `/admin/search?q=` | `route-smoke.spec.ts` |

`/admin/messages` is not in the route contract and remains intentionally unavailable (no global Admin DM browser). Covered by `route-smoke.spec.ts` and `safety.spec.ts`.

## Responsive matrix

1440 / 1024 / 768 / 390 public marketing, auth at 390, member routes at 390 with bottom nav, Admin 1440 + 1024 operational and `<900` unsupported. Passed.

## Accessibility

Axe on `/`, `/signin`, `/signup`, `/support`, `/support/new`, `/home`, request detail, `/messages`, `/settings/account`, `/admin` with **color-contrast and heading-order enabled**. No blanket `disableRules`. Keyboard labels, delete-dialog focus trap/return, 390 44px targets, one H1, textual status. Passed.

## Permission / privacy

Access-state redirects, member denied Admin, role-specific Admin surfaces, reporter hidden, report-scoped evidence, intro consent, deletion anonymization, public-support boundary. Passed.

## Focused / completed E2E counts

- 12 spec files, 30 tests, 30 passed, 0 skipped, 0 failed
- Pending-state `npm run test:e2e`: 30 passed (4.9m)
- Completed-state `npm run test:e2e`: 30 passed (5.2m)

## Validation results

Phase A and completed-state `npm run validate`:

- API: 326 passed
- Web: 182 passed
- UI: 8 passed
- format / lint / typecheck / build: green

`npx prisma validate`: schema valid. Schema diff empty. No migrations.

## Known mismatches

See `docs/qa/FC-021-known-mismatches.md`. Appeal adjudication is documented, not implemented.

## Schema / deployment

- No Prisma schema change
- No migrations
- Nothing staged, committed, pushed, or deployed
- Figma was read-only
