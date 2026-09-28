# 18 — Local Development Services

FC-002 runs PostgreSQL and Redis locally with Docker Compose. The web and API
applications continue to run on the host.

## Prerequisites

- Docker Desktop (or another Docker Engine with Compose v2)
- Node.js and npm versions compatible with the root `package.json`

Copy `.env.example` to `.env` when local overrides are needed. All database
credentials in the example are development-only and must not be reused in
staging or production.

## Start and stop

Validate the Compose model, then start both services and wait for their health
checks:

```sh
npm run services:config
npm run services:up
```

Inspect status or recent logs:

```sh
npm run services:status
npm run services:logs
```

Stop the services cleanly:

```sh
npm run services:down
```

`services:down` preserves the named volumes. Do not add `--volumes` unless a
developer intentionally wants to erase local development data.

## Services

| Service | Container port | Default host address | Named volume |
| --- | ---: | --- | --- |
| PostgreSQL 16 | 5432 | `127.0.0.1:5432` | `fc_postgres` |
| Redis 7 | 6379 | `127.0.0.1:6379` | `fc_redis` |

Host ports can be changed through `POSTGRES_PORT` and `REDIS_PORT`. If a port is
changed, update the matching application URL in `DATABASE_URL` or `REDIS_URL`.

PostgreSQL is authoritative application storage. Redis is only for ephemeral
cache, rate limits, job infrastructure, and short-lived coordination; it must
not become the source of truth for business data.

## Health and connectivity

Compose marks PostgreSQL healthy only after `pg_isready` succeeds, and marks
Redis healthy only after `redis-cli ping` returns `PONG`. `services:up` waits
for both checks.

Manual connectivity checks:

```sh
docker compose -f docker-compose.dev.yml exec postgres pg_isready -U founderchatters -d founderchatters
docker compose -f docker-compose.dev.yml exec postgres psql -U founderchatters -d founderchatters -c "SELECT 1;"
docker compose -f docker-compose.dev.yml exec redis redis-cli ping
```

Application-facing defaults are:

```text
DATABASE_URL=postgresql://founderchatters:founderchatters@localhost:5432/founderchatters
REDIS_URL=redis://localhost:6379
```

FC-002 does not apply Prisma migrations or create application/domain tables.
