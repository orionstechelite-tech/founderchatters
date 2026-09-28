# FC-006 — Email Verification and Password Reset

## Objective

Implement the frozen verification and password-reset API and auth UI using the
existing FC-005 session/security conventions and the authoritative Figma
sources.

## Scope

- `POST /v1/auth/verify-email`
- `POST /v1/auth/resend-verification`
- `POST /v1/auth/forgot-password`
- `POST /v1/auth/reset-password`
- `/verify-email`
- `/forgot-password`
- `/reset-password/[token]`
- Provider-neutral transactional-email boundary with deterministic local/test
  delivery and no external provider

## Authoritative Figma sources

- Desktop verify email: `37:46`
- Desktop forgot/reset request: `37:63`
- Desktop set new password: `67:2`
- Desktop password-reset success: `67:21`
- Canonical 390 auth layout: `136:2`
- 390 link-expired recovery pattern: `137:133`
- Button documentation/component: `12:6`, `12:34`
- Field documentation/component: `15:5`, `15:43`
- Responsive Completion: `135:3`

Figma is read-only.

## Security decisions

- Verification and reset tokens contain 32 random bytes encoded as base64url.
- Only purpose-domain-separated HMAC-SHA-256 digests are persisted.
- Verification links expire after 30 minutes; reset links expire after 30
  minutes.
- Separate Prisma models provide purpose scoping. Tokens are single-use through
  transactional `usedAt` updates.
- Reissuing a token consumes earlier unused tokens for the same user and
  purpose.
- Public resend/reset-request responses are identical whether or not an account
  exists.
- Password reset uses the FC-005 Argon2id password hasher and revokes every
  existing server-side session for that user. It does not automatically sign
  the user in.
- Successful verification and password reset append security audit entries;
  they never include token or password material.
- Correctly credentialed unverified users continue to authenticate and receive
  `VERIFY_EMAIL` access state.
- Auth mutations retain trusted-origin enforcement and Redis rate limits.
- Resend-verification and forgot-password retain their client-IP limits and
  additionally allow at most 3 requests per normalized recipient per hour.
  Recipient Redis identities are purpose-separated HMACs; plaintext email is
  never included in keys.
- Raw tokens, passwords, hashes, cookies, and provider secrets are never logged.

## Database decision

The FC-003 schema already contains separate `EmailVerificationToken` and
`PasswordResetToken` models with unique token digests, expiry, `usedAt`, and
user/expiry indexes. FC-006 requires no schema change or migration.

## Email delivery decision

No production provider is selected. FC-006 introduces a provider-neutral
delivery interface and a deterministic in-memory local/test adapter. Production
provider selection, credentials, durable email jobs, and external delivery are
deployment work and remain unresolved by `docs/16-open-decisions.md`.

`AUTH_TOKEN_SECRET` is required as a strong production secret.
`EMAIL_PROVIDER=memory` is allowed only in development/test. Staging and
production intentionally fail startup until an approved production-capable
adapter is implemented and selected. `WEB_URL` must be an origin-only URL;
staging/production require HTTPS.

Signup delivers inside its user/session/token transaction so a delivery failure
rolls back signup and becomes a safe standard server error. Resend/reset request
tokens are first stored as unusable candidates. A successful delivery promotes
the candidate and supersedes earlier active tokens in a bounded-retry
serializable transaction. A failed delivery deletes the candidate and leaves
the previously active token usable. Under concurrent successful sends, the
last successfully finalized candidate is usable; an earlier delivered link may
be immediately superseded. Eliminating that tradeoff requires a durable
outbox/provider job architecture.

Recovery pages return `Referrer-Policy: no-referrer` and replace visible
token-bearing browser URLs after capturing tokens in session storage. Production
reverse-proxy/CDN access logs must redact `/verify-email` query strings and
`/reset-password/*` path segments because the frozen route contract exposes
tokens on the initial request.

Existing and nonexistent email paths share normalization, IP limiting,
recipient limiting, status, and response body. Residual DB/provider latency can
still differ; removing it robustly requires the deferred queue/outbox
architecture rather than arbitrary response sleeps.

## Acceptance criteria

- `verify/resend/reset`
- `single-use expiring hashed tokens`
- `390 auth frames`

## Boundaries

- No founder application, onboarding, member, marketing, or unrelated auth UI
- No production email-provider integration
- No Prisma schema or migration changes
- No FC-007 work
