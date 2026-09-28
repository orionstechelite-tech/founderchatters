# Domain Events

- user.signed_up
- user.email_verified
- application.submitted
- application.needs_info
- application.approved
- application.rejected
- onboarding.completed
- request.published
- request.resolved
- response.advice_published
- introduction.offered
- introduction.consented
- conversation.created
- message.sent
- help.confirmed
- contribution.created
- report.created
- report.enforced
- member.suspended
- member.restored
- support.case_created
- support.case_updated

Events contain IDs + minimal metadata.
Do not put private message bodies in general event streams.
Consumers must be idempotent.
