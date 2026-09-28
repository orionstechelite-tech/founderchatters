# 17 — Implementation Decisions v1

Frozen for initial build:
- monorepo
- npm workspaces
- Next.js App Router
- NestJS
- PostgreSQL + Prisma
- Redis for ephemeral/job infrastructure
- Docker-first local/staging/production packaging
- server-side sessions with HttpOnly cookies
- Argon2id
- no user-facing AI
- no mobile Admin
- no billing in MVP

Provider-neutral until selected:
- transactional email
- object storage
- error monitoring provider

A coding agent may not replace these architecture decisions merely because another library is more familiar.
