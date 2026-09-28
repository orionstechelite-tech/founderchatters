# FC-005 — Auth Sessions

## Objective

Implement the frozen FC-005 authentication endpoints with Argon2id passwords,
server-side PostgreSQL sessions, secure cookies, Redis rate limits, origin
protection, and automated tests.

## Scope

- `POST /v1/auth/signup`
- `POST /v1/auth/signin`
- `POST /v1/auth/signout`
- `GET /v1/auth/session`
- Shared typed request and response contracts
- Standard API error envelopes with request IDs
- PostgreSQL-backed sessions and Redis-backed auth rate limits

## Security decisions

- Emails are trimmed and lower-cased before validation and persistence.
- Passwords are 12–128 characters and are hashed using Argon2id v19 with
  64 MiB memory, 3 iterations, parallelism 1, and a 32-byte hash.
- Session tokens contain 32 cryptographically random bytes encoded as base64url.
  Only the cookie receives the raw token. PostgreSQL stores an HMAC-SHA-256
  digest keyed by `SESSION_SECRET`.
- Sessions last 30 days.
- The session cookie is HttpOnly, SameSite=Lax, Path `/`, and Secure in
  production. Secure is omitted only outside production for HTTP localhost.
- Signup is limited to 5 attempts and signin to 10 attempts per 15-minute
  fixed window. Redis keys contain a domain-separated HMAC of the client IP,
  not raw credentials or IP addresses. Redis failures fail closed.
- Signup, signin, and signout require an origin listed in `ALLOWED_ORIGINS`.
- Correctly credentialed unverified users authenticate successfully: a
  server-side session and cookie are created, `emailVerified` is false, and
  access state is `VERIFY_EMAIL`. This follows
  `docs/06-frontend-route-contract.md`, which routes an authenticated
  unverified user to `/verify-email`. `AUTH_EMAIL_NOT_VERIFIED` remains
  available for later operations that specifically require verified email.
- Reverse proxies are trusted only through explicit IP/CIDR entries in
  `TRUST_PROXY_ADDRESSES`. Development defaults to no trusted proxy. Staging
  and production must configure the proxy allowlist or explicitly use `none`.
  The allowlist must match the deployed network path; the API must not be
  exposed through an unlisted proxy because forwarded client IPs would then be
  ignored.

## Boundaries

- No email verification delivery, resend, password reset, or password recovery
- No auth UI or Figma access
- No founder application, onboarding, profile, or member feature implementation
- No all-session or other-device revocation
- No Prisma schema or migration changes
- No JWT authentication

## Acceptance criteria

- `signup/signin/signout/session`
- `Argon2id`
- `secure cookie`
- `rate limits`
- `tests`

## Validation

- Formatting, ESLint, strict TypeScript, API unit/integration tests, repository
  tests, production builds, `npm run validate`, and `git diff --check`
- PostgreSQL and Redis integration checks use only FC-002 local services
