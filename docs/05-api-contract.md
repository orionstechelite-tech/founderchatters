# 05 — API Contract

Base prefix: `/v1`

## Auth
- `POST /auth/signup`
- `POST /auth/signin`
- `POST /auth/signout`
- `GET /auth/session`
- `POST /auth/verify-email`
- `POST /auth/resend-verification`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/change-password`
- `GET /auth/sessions`
- `DELETE /auth/sessions/:sessionId`
- `DELETE /auth/sessions`

## Founder application
- `GET /application/me`
- `PUT /application/me`
- `POST /application/me/submit`
- `POST /application/me/resubmit`

Admin:
- `GET /admin/applications`
- `GET /admin/applications/:id`
- `POST /admin/applications/:id/needs-info`
- `POST /admin/applications/:id/approve`
- `POST /admin/applications/:id/reject`

## Onboarding / profile
- `GET /me/profile`
- `PUT /me/profile`
- `PUT /me/expertise`
- `PUT /me/needs`
- `POST /me/onboarding/complete`
- `GET /founders/:id`
- `GET /founders`
- `POST /founders/:id/save`
- `DELETE /founders/:id/save`
- `GET /me/saved-founders`

## Requests
- `POST /requests`
- `GET /requests`
- `GET /requests/:id`
- `PATCH /requests/:id`
- `POST /requests/:id/publish`
- `POST /requests/:id/resolve`
- `DELETE /requests/:id`

Responses/help:
- `POST /requests/:id/responses/advice`
- `POST /requests/:id/responses/introduction`
- `POST /requests/:id/responses/private-chat`
- `GET /requests/:id/responses`

## Introduction consent
- `POST /introductions/:id/consent`
- `POST /introductions/:id/decline`
- `POST /introductions/:id/cancel`

The API response must not include protected contact details before consent.

## Messaging
- `GET /conversations`
- `POST /conversations`
- `GET /conversations/:id`
- `GET /conversations/:id/messages`
- `POST /conversations/:id/messages`

Message send should accept an idempotency key.

## Help confirmation / reputation
- `POST /requests/:requestId/help-confirmations`
- `POST /help-confirmations/:id/thank-you`
- `GET /me/reputation`
- `GET /founders/:id/reputation`

## Notifications
- `GET /notifications`
- `POST /notifications/:id/read`
- `POST /notifications/read-all`
- `GET /me/notification-settings`
- `PUT /me/notification-settings`

## Settings
- `GET /me/account`
- `PUT /me/account`
- `GET /me/privacy`
- `PUT /me/privacy`
- `GET /me/blocked`
- `DELETE /me/account`

## Safety
- `POST /reports`
- `POST /blocks/:userId`
- `DELETE /blocks/:userId`

Admin:
- `GET /admin/reports`
- `GET /admin/reports/:id`
- `POST /admin/reports/:id/dismiss`
- `POST /admin/reports/:id/enforce`
- `POST /admin/members/:id/suspend`
- `POST /admin/members/:id/restore`

## Support
Public:
- `POST /support/cases`

No public list, detail, guessed-ID lookup, or ticket-history browser.

Body allowlist only: `category`, `email`, `subject`, `message`.
Unknown properties are rejected.

Public categories:
`account` | `application` | `safety` | `privacy` | `technical` | `other`

Validation:
- `category` exact allowlist
- `email` trimmed and lowercased, valid, max 254
- `subject` trimmed, non-empty, max 160
- `message` trimmed, non-empty, max 5000; stored as plain text

Success: HTTP 201

```json
{ "caseId": "<id>", "status": "OPEN" }
```

The success body does not echo the message.

Auth is optional. A valid session associates `userId` and uses the
server-known account email. Guests store the validated submitted email.
A valid session is not required to be `ACTIVE_MEMBER`.

`SupportCase` and the first `SupportMessage` are created in one
transaction. Guest first message uses `actorType=GUEST`. Signed-in first
message uses `actorType=USER`.

OriginGuard applies to this POST. Redis rate limit is 5 submissions per
15 minutes per hashed abuse-control identity.

Admin:
- `GET /admin/support`
- `GET /admin/support/:id`
- `POST /admin/support/:id/reply`
- `POST /admin/support/:id/status`

## Admin platform
- `GET /admin`
- `GET /admin/session`
- `GET /admin/members`
- `GET /admin/members/:id`
- `POST /admin/members/:id/suspend`
- `POST /admin/members/:id/restore`
- `GET /admin/requests`
- `GET /admin/requests/:id`
- `GET /admin/reputation`
- `GET /admin/reputation/:id`
- `GET /admin/notifications`
- `GET /admin/notifications/:id`
- `POST /admin/notifications/:id/retry`
- `GET /admin/notifications/templates`
- `GET /admin/notifications/templates/:id`
- `GET /admin/taxonomy`
- `POST /admin/taxonomy`
- `PATCH /admin/taxonomy/:id`
- `POST /admin/taxonomy/:id/merge`
- `GET /admin/analytics`
- `GET /admin/admins`
- `GET /admin/admins/:id`
- `PUT /admin/admins/:id/roles`
- `POST /admin/admins/:id/disable`
- `DELETE /admin/admins/:id/sessions`
- `GET /admin/roles`
- `GET /admin/audit`
- `GET /admin/audit/:id`
- `GET /admin/settings`
- `GET /admin/system`
- `GET /admin/system/jobs`
- `GET /admin/system/jobs/:id`
- `POST /admin/system/jobs/:id/retry`
- `GET /admin/search?q=...`

Settings and notification templates are read-only. There is no
`POST/PUT/PATCH /admin/settings` and no template editor.

## Standard error body

```json
{
  "error": {
    "code": "REQUEST_LIMIT_REACHED",
    "message": "You already have the maximum number of open requests.",
    "requestId": "req_trace_id",
    "fieldErrors": {}
  }
}
```

See `contracts/error-codes.md`.
