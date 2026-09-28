# 08 — Security, Privacy & RBAC

## Authentication
- Argon2id
- hashed single-use expiring verification/reset tokens
- server-side sessions
- secure HttpOnly cookies
- rate limits
- session rotation after password change

## Authorization
UI hiding is not authorization.
All permissions enforced server-side.

## Suggested roles
- SUPER_ADMIN
- APPLICATION_REVIEWER
- MODERATOR
- SUPPORT
- OPERATIONS
- ANALYST_READONLY

Permissions should be granular and separate from roles.

## Private messages
- no global Admin inbox/browser
- report-scoped evidence only when necessary
- evidence access audited
- minimize copied message content

## Audit
Append-only logical audit entries for:
- application decisions
- suspensions/restores
- report outcomes
- request moderation
- admin-role changes
- session revocation by Admin
- account deletion
- taxonomy merges
- sensitive exports
- meaningful job retries

## Account deletion
1. deliberate confirmation
2. revoke sessions
3. mark deleted
4. anonymize public profile identity
5. preserve non-identifying integrity records where required
6. audit action

Legal retention periods require legal review.
