# Staging topology

Local-only artifacts for a later human-approved staging VPS deploy.

Do not deploy from this directory without explicit approval.

- Compose: `docker-compose.yml` (runtime/live file; image references only)
- TLS proxy: `Caddyfile`
- Env template: `.env.staging.example`
- Compose validation env: `.env.staging.validation` (fictional, not live)
- Backup helper: `backup.sh` → `npm run staging:backup`
- Explicit image builds: `deploy/docker/Dockerfile.{web,api,ops}`

Runtime compose has no `build:` blocks for web, API, worker, or ops. Live
compose cannot silently build the current checkout. There is no one-command
full deploy script.

`STAGING_OPS_IMAGE` must already be built/pulled/tagged with the approved
immutable revision during deployment preparation, before
`staging:migrations:status`, `staging:migrations:deploy`, or
`staging:rbac:sync`. Runtime compose has no build configuration. Ops
commands use `--pull never`; a missing local ops image causes the command
to fail.

First-ever data-plane bootstrap (after env, live preflight, and immutable
image tags exist):

```sh
docker compose --env-file deploy/staging/.env.staging \
  -f deploy/staging/docker-compose.yml \
  up -d postgres redis
```

Wait for postgres/redis health, take the pre-migration backup, then run
migration status/deploy and RBAC sync through the prebuilt ops image. Only
then start API, worker, web, and Caddy. Full order:
`tasks/FC-022-staging-deploy.md` and `docs/12-dev-environments-deployment.md`.

Operator contract, migration review, rollback, smoke, and blockers:

`tasks/FC-022-staging-deploy.md`

Useful local commands (none of these deploy):

```sh
npm run staging:config
npm run staging:caddy:validate
npm run staging:preflight -- --env-file deploy/staging/.env.staging.validation --validation --skip-docker
npm run staging:smoke -- --dry-run
```

`--validation` and `--skip-docker` are allowed only for `.env.staging.validation`.
Live preflight always validates Compose and Caddy.
