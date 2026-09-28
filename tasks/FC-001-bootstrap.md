# FC-001 — Bootstrap Monorepo

Status: `completed`
Authorization: `AUTO_LOCAL`
Dependencies: none

## Objective
Create a clean FounderChatters workspace that can support the frozen MVP.

## Deliverables
- root npm workspaces
- `apps/web` Next.js + TypeScript + Tailwind
- `apps/api` NestJS + TypeScript
- `packages/contracts`
- `packages/ui`
- `packages/config`
- `packages/test-utils`
- root lint/typecheck/test commands
- repo-root `AGENTS.md`
- no product features yet

## Acceptance
- `npm install` succeeds
- web dev server boots
- API dev server boots
- lint passes
- typecheck passes
- baseline tests pass
- no unapproved packages/providers added
- no production deployment

## Stop conditions
Stop and report if:
- environment cannot create the required framework scaffold
- dependency versions conflict materially
- package manager differs from the frozen npm-workspaces decision
