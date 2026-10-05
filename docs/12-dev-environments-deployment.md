# 12 — Dev Environments & Deployment

## Local
Docker Compose:
- PostgreSQL
- Redis

Web/API run on host during development.

## Environments
development / test / staging / production

Never share DBs, session secrets, provider credentials, or buckets across environments.

## Initial VPS
Local artifacts live under `deploy/staging/`. They describe a single staging
host with Caddy, web, API, worker, PostgreSQL, Redis, and a profile-gated ops
container. PostgreSQL and Redis stay on the internal `data` network and are
not published. Proxy and web use the `edge` network. API joins both.

Caddy terminates HTTPS and forwards only web/API. `TRUST_PROXY_ADDRESSES` must
list that proxy hop only (compose default `172.30.0.10`).

Session cookies are `Secure` in staging and production (`AppConfig.secureCookies`).

AWS remains a future production target. This repository does not contain an
AWS deploy path.

## Staging deploy order

Actual staging deploy requires a later explicit human approval. Local
implementation of FC-022 does not deploy. There is no one-command full
deploy script.

Runtime compose (`deploy/staging/docker-compose.yml`) is the live file. It
references only `STAGING_WEB_IMAGE`, `STAGING_API_IMAGE`, and
`STAGING_OPS_IMAGE`. It has no `build:` configuration for web, API, worker,
or ops, so a live compose operation cannot silently build the current
checkout. Dockerfiles under `deploy/docker/` may still be built explicitly
before deployment.

`STAGING_OPS_IMAGE` must already have been built, pulled, and tagged with
the approved immutable revision during deployment preparation, before
`staging:migrations:status`, `staging:migrations:deploy`, or
`staging:rbac:sync`. Runtime compose has no build configuration. Ops
commands use `--pull never`, so a missing local ops image causes the
command to fail rather than pulling or building.

Required first-ever staging order:

1. Prepare a staging-only `.env.staging` from `deploy/staging/.env.staging.example`. Never reuse development or production secrets, databases, or hosts. Live images must be a digest (`@sha256:<64 hex>`) or a 40-hex Git SHA tag (`:<sha>` or `:sha-<sha>`). Web runtime stays `NODE_ENV=production`; API/worker stay `NODE_ENV=staging`.
2. Run `npm run staging:preflight -- --env-file deploy/staging/.env.staging`. Live operator commands require that explicit `--env-file`. It validates that same file, compose, Caddy, and the internal `postgres`/`redis` data plane. `--validation` and `--skip-docker` are allowed only for `.env.staging.validation`. It must fail closed. Do not display secrets. `npm run staging:config` and `npm run staging:caddy:validate` stay on the fictional validation env for local static checks.
3. Build, pull, and tag the approved immutable web, API, and ops images from `deploy/docker/`. Build the web image with the approved staging `NEXT_PUBLIC_API_URL`. Set `STAGING_WEB_IMAGE`, `STAGING_API_IMAGE`, and `STAGING_OPS_IMAGE` to those immutable references. Worker uses the API image.
4. Start **only** staging data services:

   ```sh
   docker compose --env-file deploy/staging/.env.staging \
     -f deploy/staging/docker-compose.yml \
     up -d postgres redis
   ```

5. Wait for PostgreSQL and Redis health.
6. Take a streamed custom-format PostgreSQL backup through the unpublished postgres container: `STAGING_BACKUP_CONFIRM=I_UNDERSTAND_THIS_WRITES_A_LOGICAL_DUMP npm run staging:backup -- --env-file deploy/staging/.env.staging`. Confirmation must come from the current process or `--confirm-backup`, never the env file. Verify with `pg_restore --list`, then copy the artifact off-server. For a brand-new staging DB this may be an empty initialized database; for an existing volume it protects current state. Migration deploy must not precede this backup gate.
7. Review migrations through the prebuilt ops image: `npm run staging:migrations:status -- --env-file deploy/staging/.env.staging`. Never `prisma migrate dev`, `prisma db push`, reset, drop, or force. Do not use the local development `.env`. Ops output is captured and redacted.
8. Apply migrations only after backup verification, as an explicit human step through the same prebuilt ops image: `STAGING_MIGRATE_DEPLOY_CONFIRM=I_UNDERSTAND_THIS_APPLIES_MIGRATIONS npm run staging:migrations:deploy -- --env-file deploy/staging/.env.staging`.
9. Synchronize the Admin RBAC catalog through the staging ops network: `npm run staging:rbac:sync -- --env-file deploy/staging/.env.staging`. Local/dev still uses `npm run admin:rbac:sync`. Production still requires `--confirm` or `ADMIN_RBAC_SYNC_CONFIRM=SYNC_ADMIN_RBAC_CATALOG`. This does not create a first admin and does not assign `UserAdminRole`.
10. Start or update API, worker, web, and Caddy using the immutable images:

    ```sh
    docker compose --env-file deploy/staging/.env.staging \
      -f deploy/staging/docker-compose.yml \
      up -d api worker web proxy
    ```

    Do not start the `ops` profile as a standing service.
11. Confirm `GET /v1/health/live` (process) and `GET /v1/health/ready` (dependencies). Compose gates on ready; image liveness stays live. Unhealthy ready does not restart the process.
12. Run automated safe smoke (`npm run staging:smoke`) against HTTPS public origins only. `/`, `/signin`, `/signup`, `/support`, `/v1/health/live`, and `/v1/health/ready` must return 200.
13. Run controlled functional smoke with dedicated fictional staging accounts after email delivery and first-admin bootstrap are available.
14. Roll back with the runbook in `tasks/FC-022-staging-deploy.md` if necessary. Restores are human-only.
15. Only after live staging acceptance succeeds may FC-022 be marked completed.

## Current hard blocker

`AppConfig` still rejects `NODE_ENV=staging` and `NODE_ENV=production` because
no approved production-capable transactional email provider exists. Do not set
`EMAIL_PROVIDER=memory` in staging, do not fake delivery, and do not silently
select Resend, SES, SendGrid, or Postmark.

## AWS-ready target
- ECS Fargate
- ALB
- RDS PostgreSQL
- ElastiCache
- S3
- CloudWatch
- SSM/Secrets Manager
- SQS-compatible queue if required later

## Production gate
- migration review
- backup/rollback
- health checks
- smoke tests
- human approval

## Admin RBAC catalog

After deploying an FC-019+ API that adds predefined admin permissions,
operators must explicitly synchronize the catalog (Permission, AdminRole,
RolePermission only):

```sh
npm run admin:rbac:sync
```

In production, confirm with `--confirm` or
`ADMIN_RBAC_SYNC_CONFIRM=SYNC_ADMIN_RBAC_CATALOG`.

This command does not run at startup, does not assign UserAdminRole, and
does not create a first admin. First-admin assignment remains a separate
controlled operational procedure. Later assignments use
`PUT /v1/admin/admins/:id/roles`.
