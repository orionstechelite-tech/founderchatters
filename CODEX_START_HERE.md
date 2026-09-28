# CODEX_START_HERE

You are implementing FounderChatters from a frozen product/design contract.

## First session

Read in order:
1. `AGENTS.md`
2. `README.md`
3. `docs/00-scope-and-freeze.md`
4. `docs/01-architecture.md`
5. `docs/13-figma-source-map.md`
6. `tasks/queue.json`

Then start only task `FC-001`.

## FC-001 objective

Bootstrap the monorepo without implementing product features.

Expected initial structure:
- `apps/web` — Next.js App Router, TypeScript, Tailwind
- `apps/api` — NestJS, TypeScript
- `packages/contracts`
- `packages/ui`
- `packages/config`
- `packages/test-utils`
- root npm workspaces
- lint/typecheck/test scripts

## Rules

- Do not reinterpret the product.
- Do not add a feed, follows, likes, billing, AI UI, events, jobs marketplace, or other excluded scope.
- Do not start FC-002 until FC-001 acceptance passes.
- Keep Figma source IDs in implementation notes.
- If you find a design/contract conflict, file a QA issue rather than inventing a solution.
- Production deployment is not authorized by this pack.

## End-of-task report

Return:
- files changed
- commands run
- tests/typechecks
- acceptance criteria result
- unresolved issues
- next eligible task
