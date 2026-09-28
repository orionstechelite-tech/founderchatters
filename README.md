# FounderChatters — Codex Implementation Pack v1

Status: **Engineering handoff / implementation source**
Design baseline date: **27 Sep 2026**

This pack turns the frozen FounderChatters Figma work into an implementation contract for Codex, other coding agents, and human developers.

## Frozen design sources

- Product MVP Design v1.0 — frozen
- Marketing Website Design v1.0 — frozen
- Responsive Completion v1.0 — frozen
- Figma file: `https://www.figma.com/design/e9oPuzTWFlrz5fmnEZ3ktV`

## Implementation principle

When code and interpretation conflict, use this priority:

1. Exact breakpoint-specific Figma frame
2. Approved responsive pattern on `49 — Responsive Completion`
3. Responsive Behavior Matrix
4. Canonical desktop Figma source
5. This implementation pack for architecture, state, API, security, and build order

If ambiguity remains, create an implementation/QA issue. **Do not silently invent new product behavior.**

## Recommended stack

- Frontend: Next.js + TypeScript + Tailwind
- Backend: NestJS + TypeScript
- Database: PostgreSQL
- ORM: Prisma
- Cache / rate limiting / jobs: Redis
- Object storage: S3-compatible provider
- Email: provider adapter behind a transactional-email interface
- Tests: Vitest/Jest + Playwright
- Package manager: npm workspaces
- Deployment: Docker-first; VPS-compatible now, AWS migration-compatible later

## Read order

1. `AGENTS.md`
2. `docs/00-scope-and-freeze.md`
3. `docs/01-architecture.md`
4. `docs/03-domain-model.md`
5. `docs/04-state-machines.md`
6. `docs/05-api-contract.md`
7. `docs/06-frontend-route-contract.md`
8. `docs/07-responsive-implementation-policy.md`
9. `docs/08-security-privacy-rbac.md`
10. `docs/10-testing-and-build-acceptance.md`
11. `docs/11-build-order.md`
12. `tasks/queue.json`

## Non-negotiables

- No feed, followers, likes, influencer mechanics, or generic publishing in MVP.
- Contribution reputation is created only from explicit help confirmation.
- Introductions are consent-based.
- Admin does not have unrestricted private-DM browsing.
- Do not fabricate traction, founder counts, testimonials, country counts, or help metrics.
- Product/Admin/Marketing/Responsive frozen designs are not speculative design sandboxes.
