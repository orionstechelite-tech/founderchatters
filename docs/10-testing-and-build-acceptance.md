# 10 — Testing & Build Acceptance

## Unit
- state transitions
- permission rules
- contribution creation
- intro consent
- request limits
- access-state derivation
- idempotency

## Integration
- auth/session
- application
- requests/responses
- messaging authz
- help confirmation
- report/block
- admin permissions

## Playwright golden paths
1. Signup → verify → application → needs info → resubmit → approval → onboarding
2. Ask → preview → publish
3. Advice response
4. Confirm help → thank → contribution
5. Intro offer → consent
6. Request-linked DM
7. Report → Admin decision
8. Support → case ID
9. Password reset
10. Account deletion confirmation

## Responsive
Member/public: 1440 / 1024 / 768 / 390
Admin: 1440 / 1024 / <900 unsupported

## Accessibility
- keyboard
- visible focus
- labels
- modal focus trap
- return focus
- status not color-only
- 44px targets
- semantic headings
- contrast

## Done
- matches Figma contract
- state logic correct
- server authz
- responsive validated
- tests pass
- no unapproved scope
- privacy/audit requirements satisfied
