# FC-015 - Notifications

Status: pending.
Authorization: AUTO_LOCAL
Depends on: FC-013 (completed), FC-014 (completed).

## Scope

Implement the first complete notification slice:

- persisted in-app notifications
- list notifications
- mark one notification read
- mark all notifications read
- notifications from existing request, messaging, reputation, and application flows
- durable notification delivery rows
- async delivery worker
- application-status email delivery
- responsive `/notifications` web surface
- required 390px notification state

FC-015 does not implement notification preferences, admin notification operations, or a production email provider.

## Schema

No Prisma schema change. No migration.

Existing models are sufficient:

- `Notification`
- `NotificationDelivery`
- `NotificationTemplate`

Existing delivery status enum is sufficient:

- `QUEUED`
- `SENT`
- `FAILED`
- `RETRY_QUEUED`

Existing delivery dedupe remains:

`notificationId + channel + templateVersion`

Notification persistence relies on the idempotency and locking of the source business mutations. Do not add a notification source-event or dedupe column in FC-015.

## Notification types

Use stable constants from `@founderchatters/contracts`.

Initial types:

- `REQUEST_ADVICE`
- `PRIVATE_HELP_OFFER`
- `INTRODUCTION_OFFERED`
- `INTRODUCTION_ACCEPTED`
- `REQUEST_MESSAGE`
- `CONTRIBUTION_RECORDED`
- `APPLICATION_NEEDS_INFO`
- `APPLICATION_APPROVED`
- `APPLICATION_REJECTED`

Do not use arbitrary free-form type strings at producer call sites.

## Producers

### Public advice

When a new `ADVICE` response is actually created:

- recipient: request owner
- type: `REQUEST_ADVICE`
- href: `/requests/{requestId}`
- actor display name may be used
- never copy the advice body into the Notification
- an existing-response replay creates no second Notification

### Private help offer

When a new `PRIVATE_CHAT_OFFER` response is actually created:

- recipient: request owner
- type: `PRIVATE_HELP_OFFER`
- href: `/requests/{requestId}`
- never copy private message/help content into the Notification
- replay creates no duplicate

### Introduction offered

When a new `INTRODUCTION_OFFER` response is actually created:

- recipient: request owner
- type: `INTRODUCTION_OFFERED`
- href: `/requests/{requestId}`
- actor display name may be used
- do not copy `personName`, reason, or gated introduction details
- replay creates no duplicate

### Introduction accepted

Only on the real transition:

`CONSENT_PENDING -> INTRODUCED`

Create:

- recipient: helper who offered the introduction
- type: `INTRODUCTION_ACCEPTED`
- href: `/requests/{requestId}`

If the introduction is already `INTRODUCED`, return the existing state without another Notification.

Decline and cancel do not create notifications in FC-015.

### Request-linked message

When a new message is actually created:

- recipient: conversation counterpart
- type: `REQUEST_MESSAGE`
- href: `/messages/{conversationId}`
- sender display name may be used
- linked request headline may be used as safe context
- never copy the private message body into Notification title/body

A replay of the same `clientMessageId` does not create another Notification.

### Contribution recorded

Notification is tied to actual contribution creation, not merely to a help-confirmation event.

When `Contribution` is newly created:

- recipient: contributor/helper
- type: `CONTRIBUTION_RECORDED`
- href: `/reputation`
- confirmer/request-owner display name may be used
- body may reuse `REPUTATION_HISTORY_LABELS`

Existing canonical labels:

- `Advice confirmed helpful`
- `Introduction confirmed helpful`
- `Private help confirmed helpful`

Negative outcomes remain private:

- `STILL_TALKING`
- `NOT_HELPFUL`

They must not create helper-facing notifications.

If a historical HELPED confirmation is repaired because its Contribution is genuinely missing, the notification may be created when that Contribution is actually created.

### Application status

Only admin-driven review transitions create application notifications:

- `SUBMITTED -> NEEDS_INFO`
- `SUBMITTED -> APPROVED`
- `SUBMITTED -> REJECTED`

Recipient:

`FounderApplication.userId`

Types:

- `APPLICATION_NEEDS_INFO`
- `APPLICATION_APPROVED`
- `APPLICATION_REJECTED`

Href:

`/application`

Applicant-driven submit/resubmit transitions do not create notifications.

Application status Notifications also create an EMAIL `NotificationDelivery` row in the same database transaction.

The admin review note is not copied into Notification or email content by default.

## Copy

Reuse existing FounderChatters terminology instead of introducing new engagement language.

Examples of safe copy direction:

- `{name} shared public advice on your request.`
- `{name} offered private help.`
- `{name} offered an introduction.`
- `{name} accepted your introduction offer.`
- `{name} sent you a new message.`
- `{name} confirmed your help.`

Application titles reuse existing application language:

- `More information needed.`
- `Application approved.`
- `Application not approved.`

Avoid engagement, vanity, urgency, or promotional copy.

## Privacy

Notification rows must not persist unnecessary private payloads.

Do not copy:

- private message body
- introduction `personName`
- introduction private reason
- negative help-confirmation outcome
- admin review note
- other gated/private response content

A Notification should contain only enough safe context to tell the user what happened and where to go next.

## Persistence and idempotency

The Notification is created inside the same PostgreSQL transaction as the source business mutation.

Examples:

- response create + Notification
- introduction consent transition + Notification
- message create + Notification
- contribution create + Notification
- admin application decision + Notification + optional NotificationDelivery

Existing source idempotency remains authoritative.

Do not rely on the current in-process domain-event capture arrays for durable notification persistence.

Business mutations must not depend on external notification delivery succeeding.

## API

Frozen routes:

- `GET /notifications`
- `POST /notifications/:id/read`
- `POST /notifications/read-all`

Notification settings routes are not part of FC-015.

### GET /notifications

Use authenticated-session semantics.

Do not require active-member admission at the API service layer because application-status notifications can exist before onboarding is complete.

Return newest-first notifications.

Deterministic order:

`createdAt DESC, id DESC`

Use cursor pagination consistent with messaging history:

- query: `before`
- query: `limit`
- response: `nextBefore`

Suggested limits:

- default: 20
- max: 50

Cursor lookup must be scoped to the authenticated user.

A cursor from another user's stream is invalid/not found and must not expose existence.

Notification item includes:

- `id`
- `type`
- `title`
- `body`
- `href`
- `readAt`
- `createdAt`

Unlike chat history, do not reverse the result window. Notifications remain newest-first.

### POST /notifications/:id/read

- authenticated-session user only
- OriginGuard
- only own Notification
- idempotent
- if unread, set `readAt`
- if already read, preserve existing `readAt`
- another user's Notification must not be exposed

### POST /notifications/read-all

- authenticated-session user only
- OriginGuard
- update only current user's unread Notifications
- idempotent
- may return updated count

## Delivery jobs

PostgreSQL is authoritative for delivery state.

Flow:

Business mutation
-> persisted Notification
-> optional NotificationDelivery
-> commit
-> async worker delivery

The delivery worker must never create another user-visible Notification when retrying.

Application-status notifications are the only external email delivery producer required in FC-015.

In-app notifications do not require a NotificationDelivery row merely to appear in the UI.

## Email delivery

Do not widen the auth-specific `AuthEmail` union.

Create notification-specific delivery abstractions under `src/notifications/`, including the equivalent of:

- `NOTIFICATION_EMAIL_DELIVERY`
- `NotificationEmailDelivery`
- `InMemoryNotificationEmailDelivery`
- `NotificationEmailService`

Development and test use the memory adapter.

Continue using the existing `AppConfig.emailProvider` gate.

Do not select or implement SendGrid, SES, Resend, or another production provider in FC-015.

An email delivery failure is handled by the worker and delivery state. It must not roll back the already-committed application review decision.

## Notification templates

`NotificationTemplate` becomes runtime-used in FC-015.

Use explicit stable versioning.

Initial application email template:

- key: `application-status`
- version: `v1`

The template is generic enough to support NEEDS_INFO, APPROVED, and REJECTED while the in-app Notification contains the specific status title.

Template seed logic lives in a domain helper, for example:

`apps/api/src/notifications/notification-template-seed.ts`

Expose an idempotent `ensureNotificationTemplates(...)` helper.

`prisma/seed.ts` explicitly calls the helper.

HTTP AppModule and WorkerModule must never automatically seed templates at startup.

Tests that require templates seed them explicitly.

Do not invent a "single active version per key" invariant in FC-015; the current schema/docs do not define one.

## Retry policy

Use the existing delivery states.

`QUEUED` is immediately eligible.

On a failed attempt:

- increment `attemptCount`
- record a safe `lastErrorCode`
- retry with backoff while attempts remain
- set `RETRY_QUEUED` while waiting
- after the bounded attempt limit, set `FAILED`

Use a small deterministic bounded retry policy.

Initial policy:

- maximum total attempts: 3
- after attempt 1 failure: retry after 60 seconds
- after attempt 2 failure: retry after 300 seconds
- after attempt 3 failure: `FAILED`

Retry eligibility may be derived from `updatedAt + attemptCount`; no `nextAttemptAt` migration is required.

Do not store provider response bodies, email contents, tokens, or private payloads in `lastErrorCode`.

## Redis and recovery

Redis is queue/wakeup infrastructure, not authoritative business state.

PostgreSQL `NotificationDelivery` rows remain recoverable if a Redis enqueue/wakeup fails.

A Redis failure must not make the original business mutation fail.

Use only minimal Redis primitives needed for notification jobs.

Do not add BullMQ.

Do not add SQS.

Avoid permanently blocking the existing single Redis connection with a blocking pop.

The worker must have a database recovery scan for eligible `QUEUED` and `RETRY_QUEUED` rows so missed Redis wakeups do not lose jobs.

Any per-delivery coordination/lease must remain short-lived and must not become authoritative delivery state.

## Worker

Worker lives inside the API package.

Entrypoint:

`apps/api/src/worker.ts`

Use:

`NestFactory.createApplicationContext(...)`

Do not start an HTTP listener.

Worker context should stay lightweight and should not import the full `AuthModule`.

Expected worker dependencies:

- `AppConfig`
- `PrismaService`
- `RedisService`
- notification job runner
- notification delivery service
- notification email adapter

Enable Nest shutdown hooks so Prisma and Redis lifecycle cleanup runs.

Existing API TypeScript build already includes `src/**/*.ts`; no tsconfig change is required for the worker.

Add package scripts for worker development/start without changing the existing HTTP `start` command.

## Module wiring

Avoid broad infrastructure refactors in FC-015.

Lightweight notification writer/services may be registered directly by consuming modules, consistent with existing shared-provider patterns.

Current producer modules:

- `RequestsModule`
- `ConversationsModule`
- `AdminApplicationModule`

HTTP notification list/read routes live in a new `NotificationsModule` imported by `AppModule`.

Do not create a broad shared-core module unless implementation actually requires one.

## Frontend

Add the member notification page:

`apps/web/app/notifications/page.tsx`

Use the existing `MemberAppShell`.

Do not add Notifications as a sixth primary navigation destination.

Existing primary navigation remains:

- Home
- Discover
- Ask
- Messages
- Profile

The Notifications page must not falsely mark Home active. Allow a neutral/no-active shell state with the smallest wrapper change required.

Use existing authenticated request helpers rather than introducing a second fetch architecture.

## 390 acceptance

Implement the responsive notification surface represented by Figma frame `137:66`.

Required intent:

- heading: `Notifications`
- subtitle: `Activity that needs your attention.`
- clear unread/read visual states
- timestamp
- deep-link/open behavior
- application/account notification state
- useful empty state
- existing five-item bottom navigation remains unchanged

Figma sample content includes states such as:

- helpful response
- introduction offered
- application approved
- failed message

The failed-message card is a visual reference only. FC-015 does not invent a failed-message persistence producer because no supporting domain workflow currently exists.

Empty-state meaning:

`No notifications means nothing needs your attention - not "come back and scroll."`

Desktop design intent remains:

`Only what needs your attention.`

No engagement-noise UI.

## Explicit non-goals

FC-015 does not implement:

- `/me/notification-settings`
- editable notification preferences
- settings notification UI
- notification digests
- likes or vanity notifications
- promotional notifications
- request-resolved notification
- help-confirmation-requested producer where no current workflow exists
- nonexistent security-event producers
- nonexistent support-event producers
- failed-message notification producer
- admin notification dashboard
- admin job inspection API
- admin manual retry API
- production email provider
- push notifications
- SMS
- BullMQ
- SQS
- new notification source/dedupe schema column

Notification settings remain FC-016 territory.

Admin notification/job operations remain FC-019 territory.

## Tests

Add focused coverage for:

### Notification API

- newest-first list
- deterministic pagination
- cursor ownership isolation
- authenticated access
- mark one read
- mark one read idempotency
- mark all read
- mark all read idempotency
- cross-user isolation

### Producer integration

- advice creates one owner Notification
- advice replay creates no duplicate
- private-help offer creates one owner Notification
- introduction offer creates one owner Notification
- introduction accepted creates one helper Notification
- introduction consent replay creates no duplicate
- decline/cancel create no introduction notification
- message creates one counterpart Notification
- message idempotency replay creates no duplicate
- HELPED contribution creates one helper Notification
- contribution replay creates no duplicate
- contribution repair creates notification only when Contribution is genuinely created
- STILL_TALKING creates no helper Notification
- NOT_HELPFUL creates no helper Notification
- admin NEEDS_INFO creates Notification + EMAIL delivery
- admin APPROVED creates Notification + EMAIL delivery
- admin REJECTED creates Notification + EMAIL delivery
- applicant submit/resubmit creates no application Notification
- concurrent/duplicate admin review does not duplicate Notification

### Privacy

Assert persisted Notification content does not contain:

- message body
- introduction person name
- introduction reason
- negative help outcome
- admin review note

### Delivery

- template seed is idempotent
- delivery unique key is respected
- application email uses the notification email adapter
- memory adapter can be inspected and cleared in tests
- successful delivery becomes `SENT`
- failed delivery increments attempts
- retry becomes `RETRY_QUEUED`
- exhausted delivery becomes `FAILED`
- retry never creates a second Notification

### Worker

- eligible queued delivery is processed
- retry timing is respected
- DB recovery can find queued work without relying on a successful Redis wakeup
- Redis enqueue failure does not undo persisted business state
- shutdown closes worker context cleanly

### Web

- notifications render newest-first
- unread state renders
- read state renders
- read action calls API
- deep link is usable
- empty state renders
- 390px responsive state is covered
- existing five primary navigation destinations remain unchanged

## Validation

Before FC-015 is marked completed:

1. implementation tests pass
2. full `npm run validate` passes
3. queue entry is changed from pending to completed
4. completed-state `npm run validate` passes
5. `git diff --check` passes
6. `npx prisma validate` passes
7. confirm no unintended Prisma migration/schema change
8. inspect final status/stat/diff before staging
9. no commit, push, PR, merge, or deploy without explicit user approval
