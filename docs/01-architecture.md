# 01 — Architecture Freeze

## Recommended deployment topology

### Web
Next.js application:
- public marketing
- auth
- founder/member app
- admin app route group
- server-rendered public pages where beneficial
- browser client for authenticated application

### API
NestJS:
- auth
- applications
- profiles
- requests
- responses/help
- conversations/messages
- contributions
- notifications
- trust & safety
- support
- admin
- taxonomy
- audit
- jobs/system

### Persistence
PostgreSQL + Prisma.

### Redis
Use only for:
- rate limits
- ephemeral cache
- job queue backend
- presence-like temporary signals if ever needed
- short-lived idempotency/retry coordination

### Object storage
S3-compatible abstraction for:
- profile/company media
- moderation attachments if later enabled
- support attachments if later enabled

MVP may launch with attachments disabled; the storage interface should still be provider-independent.

### Transactional email
Provider adapter:
- verification
- password reset
- application status
- important security events
- notification digests only if later enabled

No marketing-email system in MVP.

## Repository topology

Use a monorepo for agent coordination:

- `apps/web`
- `apps/api`
- `packages/contracts`
- `packages/ui`
- `packages/config`
- `packages/test-utils`

Why:
- shared DTO/schema types
- one task can update API + web atomically
- easier 24×7 agent orchestration
- consistent lint/test/typecheck
- fewer version-drift problems

## HTTP model

Browser → Next.js → Nest API.

Preferred production arrangement:
- `founderchatters.com` public web
- `app.founderchatters.com` optional member host, or one host with route groups
- `api.founderchatters.com` API
- strict allowed origins
- cookie-based browser auth with credentials

If web and API use different subdomains, explicitly test cookie, SameSite, CORS and CSRF behavior in staging.

## Jobs

Use durable background jobs for:
- transactional email delivery
- notification fan-out
- retryable webhook/provider work
- cleanup of expired tokens/sessions
- non-critical analytics aggregation

Business mutations must complete independently of notification delivery.

## Environment strategy

- local: Docker Compose
- CI: ephemeral PostgreSQL + Redis
- staging: same containers/topology as production at smaller scale
- production initial: VPS/Docker acceptable
- later: ECS Fargate + RDS + ElastiCache/SQS-compatible migration

Avoid architecture that depends on one VPS filesystem.
