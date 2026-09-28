# 04 — State Machines

## Founder application

`DRAFT → SUBMITTED → {NEEDS_INFO | APPROVED | REJECTED}`

Allowed:
- NEEDS_INFO → SUBMITTED
- REJECTED → terminal for MVP unless Admin explicitly reopens
- APPROVED → terminal

Every Admin transition requires:
- actor
- reason/note where applicable
- timestamp
- audit record

## User access

- PENDING_EMAIL
- PENDING_APPLICATION
- APPLICATION_REVIEW
- NEEDS_INFO
- APPROVED_NOT_ONBOARDED
- ACTIVE_MEMBER
- SUSPENDED
- DELETED

Post-login redirect derives from access state.

## Request

`DRAFT → PUBLISHED → RESOLVED`

Side transitions:
- PUBLISHED → MODERATED_REMOVED
- PUBLISHED → DELETED_BY_AUTHOR
- RESOLVED → remains historically visible according to privacy rules

A member should not exceed the frozen open-request limit once the implementation value is set from product config.

## Help interaction

Response modes:
- ADVICE
- INTRODUCTION_OFFER
- PRIVATE_CHAT_OFFER

For introduction:
`OFFERED → CONSENT_PENDING → {INTRODUCED | DECLINED | CANCELLED}`

Never expose contact details before consent.

## Help confirmation

- HELPED
- STILL_TALKING
- NOT_HELPFUL

Only HELPED may create a Contribution.

## Report

`OPEN → UNDER_REVIEW → {DISMISSED | ENFORCED}`

## Support case

`OPEN → IN_PROGRESS → WAITING_ON_USER → RESOLVED → CLOSED`

## Notification delivery

`QUEUED → SENT`

Retry:
`FAILED → RETRY_QUEUED → SENT | FAILED`

Retry must not duplicate user-visible notifications.
