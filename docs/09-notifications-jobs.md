# 09 — Notifications & Jobs

Useful events only:
- request response
- intro offered/accepted
- request-linked message
- help confirmation requested
- contribution recorded
- application status
- security events
- support updates

Business mutation → persisted Notification → async delivery job.

Use stable delivery dedupe keys:
`notificationId + channel + templateVersion`

Retry with backoff. Manual retry must not create duplicate user-visible notifications.

Recommended queues:
- email
- notification
- maintenance
- analytics-lite
