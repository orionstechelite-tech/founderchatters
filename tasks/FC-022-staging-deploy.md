# FC-022 — Staging Deploy

Status: **pending**. Local readiness artifacts exist. Actual staging deploy,
migration apply, live health, and staging smoke have **not** happened.

FC-022 must remain pending until a later explicit human approval completes
live staging acceptance. FC-023 remains pending.

## Frozen contract

Queue acceptance:

1. Migration review
2. Rollback plan
3. Health checks
4. Smoke tests

Approved contract also requires production-quality web/API/worker
containerization, staging VPS topology, TLS reverse proxy, environment
isolation, staging-safe secret handling, DB backup before deploy, reviewed
migration deploy path, Admin RBAC catalog synchronization as an operator step,
observability suitable for staging, fictional staging data only, and staging
preflight. No production deploy.

## Baseline

- Branch: `fc-022-staging-deploy`
- Base/main merge SHA: `e002af3777fa5660e1a9d08d473379e9704aa031`
- Verified before this task: `npm run validate` green, API 326 / web 182 / UI 8,
  Prisma valid, 38 tables / 12 enums, two historical migrations, no pending
  schema migration, FC-021 Playwright 30/30

## Local-only implementation status

Implemented locally and not deployed:

- Production Dockerfiles for web, API, and worker
- `deploy/staging` Compose topology and Caddy TLS proxy
- Staging env templates and fail-closed preflight
- `GET /v1/health/live` and `GET /v1/health/ready`
- Request logging with safe fields only
- Migration review, backup helper, and rollback runbook
- Safe smoke command and controlled-smoke prerequisites
- Namespaced scripts that cannot one-click deploy

Not done yet. Each of the following still requires its own explicit human approval:

- Commit and/or push of this branch
- Live staging deploy
- SSH, VPS, or cloud access
- Live staging migrate/smoke
- Choosing a transactional email provider
- First-admin bootstrap
- Production deploy

Nothing has been committed, pushed, or deployed yet.

## Architecture

Single staging host, internal-only data plane:

```
Internet
   |
Caddy (80/443, edge IP 172.30.0.10)
   |                |
  web:3000        api:4000     (edge)
                    |
              worker + ops     (data)
                    |
           postgres + redis    (data, unpublished)
```

- Runtime compose (`deploy/staging/docker-compose.yml`) references only
  `STAGING_WEB_IMAGE`, `STAGING_API_IMAGE`, and `STAGING_OPS_IMAGE`. It has
  no `build:` blocks for web, API, worker, or ops. A live compose operation
  cannot silently build the current checkout and label it with an approved
  immutable revision.
- Dockerfiles remain under `deploy/docker/` and may be built explicitly
  before deployment. They are not invoked by runtime compose.
- Web, API, and worker images run as non-root on `node:22-bookworm-slim`
- API and worker share `deploy/docker/Dockerfile.api` with different commands
- Ops image is profile-gated and not started by a normal compose up
- `STAGING_OPS_IMAGE` must already be built, pulled, and tagged with the
  approved immutable revision before `staging:migrations:status`,
  `staging:migrations:deploy`, or `staging:rbac:sync`. Runtime compose has
  no build configuration. Ops commands use `docker compose run --pull never`
  so a missing local ops image fails rather than pulling or building.
- Web uses Next.js standalone output; `NEXT_PUBLIC_API_URL` is a build arg
- Live staging requires immutable image tags, not `:local` or `:latest`
- PostgreSQL and Redis have persistent volumes and are not published
- Staging data must stay separate from development/test/production
- Session cookies are Secure in staging and production (`secureCookies`)

Caddy is the reverse proxy because automatic HTTPS and host routing stay in
one file. Nginx plus a separate ACME client would add moving parts without
changing the security model. Express `trust proxy` stays an explicit IP/CIDR
list (`TRUST_PROXY_ADDRESSES=172.30.0.10`). Arbitrary `X-Forwarded-*` values
from clients are not trusted.

There is no one-command full deploy script.

## First-ever staging deploy order

This sequence is required for a brand-new staging host and for an existing
staging volume. Do not start API, worker, web, or Caddy before the
pre-migration backup and human-confirmed migrate deploy.

1. Prepare a staging-only `.env.staging` from
   `deploy/staging/.env.staging.example`. Never reuse development or
   production secrets, databases, or hosts. Live images must be a digest
   (`@sha256:<64 hex>`) or a 40-hex Git SHA tag (`:<sha>` or `:sha-<sha>`).
   Web runtime stays `NODE_ENV=production`; API/worker stay `NODE_ENV=staging`.
2. Live preflight against that operator file:
   `npm run staging:preflight -- --env-file deploy/staging/.env.staging`
3. Build, pull, and tag the approved immutable web, API, and ops images from
   `deploy/docker/`. Build the web image with the approved staging
   `NEXT_PUBLIC_API_URL`. Set `STAGING_WEB_IMAGE`, `STAGING_API_IMAGE`, and
   `STAGING_OPS_IMAGE` to those immutable references. Worker uses the API
   image.
4. Start **only** staging data services:

   ```sh
   docker compose --env-file deploy/staging/.env.staging \
     -f deploy/staging/docker-compose.yml \
     up -d postgres redis
   ```

   Because runtime compose contains no application/ops `build:` blocks,
   later service starts cannot accidentally build source.
5. Wait for PostgreSQL and Redis health (`pg_isready` / `redis-cli ping`
   through those containers, or compose health status).
6. Take the pre-migration custom-format backup through the unpublished
   postgres container (see Backup plan). For a brand-new staging DB this
   artifact may represent the freshly initialized empty database. For an
   existing staging volume it protects current state. Migration deploy must
   not precede this backup gate.
7. Migration status through the **prebuilt** ops image:
   `npm run staging:migrations:status -- --env-file deploy/staging/.env.staging`
8. Human-confirmed `prisma migrate deploy` through the same prebuilt ops
   image (see Migration review).
9. Admin RBAC catalog sync through the same prebuilt ops image:
   `npm run staging:rbac:sync -- --env-file deploy/staging/.env.staging`
10. Start or update API, worker, web, and Caddy using the immutable images:

    ```sh
    docker compose --env-file deploy/staging/.env.staging \
      -f deploy/staging/docker-compose.yml \
      up -d api worker web proxy
    ```

    Do not start the `ops` profile as a standing service.
11. Confirm live/ready checks (`GET /v1/health/live` and `GET /v1/health/ready`).
12. Automated safe smoke (`npm run staging:smoke`) against HTTPS public origins.
13. Controlled functional smoke only when email delivery and first-admin
    bootstrap prerequisites exist.
14. Roll back with the runbook below if necessary.
15. Only after live staging acceptance succeeds may FC-022 be marked completed.

## Environment and secrets contract

Templates:

- `deploy/staging/.env.staging.example` — placeholders; must fail preflight
- `deploy/staging/.env.staging.validation` — fictional compose-config values only
- `deploy/staging/.env.staging` — operator file, gitignored

Required names include `NODE_ENV=staging`, `WEB_URL`, `API_URL`,
`NEXT_PUBLIC_API_URL`, `ALLOWED_ORIGINS`, `TRUST_PROXY_ADDRESSES`,
`DATABASE_URL`, `REDIS_URL`, `SESSION_COOKIE_NAME`, `SESSION_SECRET`,
`AUTH_TOKEN_SECRET`, `PASSWORD_PEPPER`, email variables, proxy hosts,
PostgreSQL credentials, `STAGING_BACKUP_DIR`, and optional `LOG_LEVEL`.

`CSRF_SECRET` exists in local `.env.example` and is unused by the API. Do not
invent CSRF behavior.

`AppConfig` and `npm run staging:preflight` reject:

- placeholder or weak secrets
- non-HTTPS public origins
- localhost public endpoints
- development DB names/credentials where detectable
- missing or overly broad trusted-proxy configuration
- any email provider other than an approved production-capable adapter

No approved production email adapter exists. The empty allow-list is
intentional.

## Migration review

Inventory, in apply order:

1. `prisma/migrations/20260928073117_init/migration.sql`
   - Creates enums and tables
   - No `DROP`, `TRUNCATE`, or rewrite operations
2. `prisma/migrations/20260929013000_onboarding_profile_fields/migration.sql`
   - Adds nullable columns only
   - No `DROP`, `TRUNCATE`, or rewrite operations

Both historical migrations are additive. Nothing destructive was found.

Staging tooling, always with `--env-file` pointing at the staging env.
These commands use the **prebuilt** ops container on the staging data
network (`STAGING_OPS_IMAGE` already built/pulled/tagged with the approved
immutable revision) and never fall back to the local development `.env`.
Runtime compose has no build configuration for ops. Ops commands use
`docker compose run --pull never`, so a missing local ops image fails
rather than pulling or building:

- `npm run staging:migrations:status -- --env-file <staging-env>`
- Live apply, after data-plane health, backup verification, and approval:
  `STAGING_MIGRATE_DEPLOY_CONFIRM=I_UNDERSTAND_THIS_APPLIES_MIGRATIONS npm run staging:migrations:deploy -- --env-file <staging-env>`
  Confirmation must come from the current process or `--confirm-migrate-deploy`,
  never from the persistent env file.
- `npm run staging:rbac:sync -- --env-file <staging-env>` after migrate deploy

Never use `prisma migrate dev`, `prisma db push`, reset, drop, or force on
staging. Preflight does not apply migrations.

FC-022 adds no schema or migration files.

## Backup plan

PostgreSQL is unpublished. Dumps run through the compose postgres service
and land on the host. Postgres and Redis must already be healthy (step 4–5
of the first-ever deploy order). The dump happens **before** migrate deploy.

1. Confirm `NODE_ENV=staging` and pass the staging env file explicitly
2. Run `npm run staging:backup -- --env-file <staging-env>` with the
   current-process confirmation
   `STAGING_BACKUP_CONFIRM=I_UNDERSTAND_THIS_WRITES_A_LOGICAL_DUMP`
   (or `--confirm-backup`). Confirmation in the env file is ignored.
3. The operator process uses `umask 077`, creates a `.partial` host file,
   then streams `pg_dump --format=custom` from
   `docker compose exec -T postgres` into that file. The archive is never
   buffered in RAM.
4. Integrity: stream the partial file into
   `docker compose exec -T postgres pg_restore --list`
5. Only after listing succeeds is the artifact renamed to
   `founderchatters-staging-<timestamp>.dump` with mode `0600`
6. Copy the artifact off-server before continuing

For a brand-new staging database the artifact may be an empty initialized
cluster. For an existing volume it protects current state. Either way,
migration deploy must not precede this backup gate.

Do not store backups only in the PostgreSQL container filesystem. There is
no automated restore command.

## Rollback procedure

Restores are a deliberate human operation. There is no automated destructive
rollback.

### 1. Application-only failure

- Stop or pin traffic as needed
- Redeploy the previous known web/API/worker image tags
- Leave PostgreSQL unchanged
- Re-check live/ready and safe smoke

### 2. Post-migration failure / custom-format restore

`pg_restore --clean` into an already-migrated database is not an exact
rollback. Objects that exist in the live database but are absent from the
backup may remain.

There is no npm restore command. The following is DESTRUCTIVE and HUMAN-ONLY.

- Stop write traffic: `docker compose --env-file <staging-env> -f deploy/staging/docker-compose.yml stop api worker`
- Verify the target is staging (`NODE_ENV=staging` in the operator env file,
  approved staging hosts, unpublished Postgres)
- Verify the chosen custom-format `founderchatters-staging-*.dump` artifact
  (name, timestamp, off-server copy). List it through the postgres container:
  `docker compose --env-file <staging-env> -f deploy/staging/docker-compose.yml exec -T postgres sh -c 'pg_restore --list' < artifact.dump`
- Confirm an off-server copy of that same artifact exists
- Recreate a clean staging database using the postgres container environment.
  DESTRUCTIVE, HUMAN-ONLY:
  `docker compose --env-file <staging-env> -f deploy/staging/docker-compose.yml exec -T postgres sh -c 'dropdb --if-exists --username "$POSTGRES_USER" "$POSTGRES_DB" && createdb --username "$POSTGRES_USER" "$POSTGRES_DB"'`
- Restore the custom-format archive into that clean database with
  `pg_restore --exit-on-error`. The operator supplies the archive on stdin:
  `docker compose --env-file <staging-env> -f deploy/staging/docker-compose.yml exec -T postgres sh -c 'pg_restore --exit-on-error --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"' < artifact.dump`
- Do not improvise reverse `DROP`/`ALTER` SQL
- Start the previous compatible immutable application image revisions
  (digest or 40-hex Git SHA tags), not `:local` / `:latest`
- Confirm live/ready and automated safe smoke
- Run controlled functional smoke where email delivery and first-admin
  bootstrap are available

### 3. Reverse-proxy or config failure

- Restore the previous Caddyfile or proxy image
- Keep application and database revisions unchanged unless they were also
  part of the failed change
- Re-check HTTPS routing and `TRUST_PROXY_ADDRESSES`

## Health and readiness

- `GET /v1` remains `{ service: "api", status: "ok" }`
- `GET /v1/health/live` — process liveness only, no dependencies, no auth
- `GET /v1/health/ready` — PostgreSQL `SELECT 1` and Redis `PING`; `503` when
  either is down
- Responses contain only `status`, `service`, and `up`/`down` checks
- Failures never include URLs, credentials, stack traces, or host internals
- Image HEALTHCHECK uses `/health/live`. Compose dependency gating uses
  `/health/ready`. An unhealthy ready probe does not restart the process.

## Worker supervision

No worker-health table and no authoritative Redis heartbeat.

- Same production API image, command `node dist/apps/api/src/worker.js`
- `restart: unless-stopped`
- Container process check (`kill -0 1`) for orchestrator liveness only
- Functional proof is the controlled notification-delivery smoke after an
  approved email provider exists

## Observability

Request logs include service, environment, request ID, route (no query
string), HTTP status, latency, optional safe actor ID when already present,
and `ApiError` code.

Never logged: passwords, raw auth/reset/verification tokens, cookies,
`Authorization` values, provider secrets, private message bodies, support
bodies, or introduction private details. Request and response bodies are not
logged. `SENTRY_DSN` stays unconfigured. No third-party monitoring provider
was added.

## Smoke-test plan

### Automated safe smoke

`npm run staging:smoke` against operator-supplied HTTPS URLs:

- Web `/`
- `/signin`
- `/signup`
- `/support`
- API `/v1/health/live`
- API `/v1/health/ready`
- Each of those routes must return 200
- 3xx/4xx/5xx fail unless a route is explicitly documented to redirect
- Each request uses a 10s timeout and fails closed; there are no retries

`--dry-run` validates targets only and sends no requests. Localhost and HTTP
targets are rejected.

Do not run Playwright golden E2E or account-deletion/moderation destructive
flows against staging.

### Controlled functional smoke

Requires dedicated fictional staging accounts that are not stored in Git,
plus two unresolved prerequisites:

1. Approved production-capable transactional email provider
2. Controlled first-admin bootstrap (still an open operational procedure)

Then, and only then, exercise signup/verification, application/admission,
member session/home, request/help, notification worker delivery, Admin login
plus an authorized Admin route, and public support submission.

## Current blockers

1. **HARD BLOCKER — transactional email.** `AppConfig` rejects staging and
   production because only the memory provider exists. Preflight reports this
   explicitly. This is also open decision #2 in `docs/16-open-decisions.md`.
2. **First-admin bootstrap** remains a separate controlled operation. RBAC
   catalog sync does not create the first admin.
3. **Production hosting** remains unresolved. These artifacts target a later
   staging VPS, not AWS and not production.
4. **Object storage provider** remains unresolved and is not required to boot
   this topology.
5. Actual staging deploy, live migrate, live health, and staging smoke are
   unauthorized until explicit human approval.

## Validation results

Recorded in the FC-022 implementation report after local `npm run validate`,
`npm run db:validate`, Docker config/image builds, and empty Prisma diffs.
Those results do not complete FC-022.

## Completion rule

FC-022 may be marked completed only after:

1. Human-approved staging deploy following the first-ever order above
2. Data-plane bootstrap, pre-migration backup, then reviewed
   `prisma migrate deploy` through the prebuilt ops image
3. Live health/readiness pass
4. Staging smoke passes
5. Rollback readiness is confirmed
