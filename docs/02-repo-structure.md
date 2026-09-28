# 02 — Repository Structure

```text
founderchatters/
├─ AGENTS.md
├─ package.json
├─ .env.example
├─ docker-compose.dev.yml
├─ apps/
│  ├─ web/
│  │  ├─ app/
│  │  │  ├─ (public)/
│  │  │  ├─ (auth)/
│  │  │  ├─ (member)/
│  │  │  └─ admin/
│  │  ├─ components/
│  │  ├─ features/
│  │  ├─ lib/
│  │  └─ tests/
│  └─ api/
│     ├─ src/
│     │  ├─ auth/
│     │  ├─ applications/
│     │  ├─ profiles/
│     │  ├─ taxonomy/
│     │  ├─ requests/
│     │  ├─ responses/
│     │  ├─ conversations/
│     │  ├─ contributions/
│     │  ├─ notifications/
│     │  ├─ safety/
│     │  ├─ support/
│     │  ├─ admin/
│     │  ├─ audit/
│     │  ├─ jobs/
│     │  └─ common/
│     └─ test/
├─ packages/
│  ├─ contracts/
│  ├─ ui/
│  ├─ config/
│  └─ test-utils/
├─ prisma/
│  └─ schema.prisma
├─ docs/
└─ tasks/
```

## Feature ownership rule

Each domain owns:
- validation
- business rules
- persistence access
- authorization checks
- emitted domain events

Do not put business logic in controllers or React components.

## Shared contracts

`packages/contracts` may contain:
- enums mirrored from API
- Zod schemas where browser validation benefits
- pagination shapes
- typed API response/error shapes

Prisma types must not leak directly into public frontend contracts.
