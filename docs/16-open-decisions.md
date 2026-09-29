# 16 — Open Decisions

1. Beta pricing/free-access policy
2. Transactional email provider
3. Object storage provider
4. Rejected-application reopening policy
5. Legal retention periods
6. Final Terms/Privacy legal copy
7. Production hosting at launch

Represent unresolved decisions as configuration/TODOs, not silent assumptions.

## Resolved in FC-011

Exact open-request limit: **3**. Only `PUBLISHED` requests count. Implemented as the
code constant `REQUEST_LIMITS.openPublished`. This is not a runtime
`PlatformSetting` in FC-011.
