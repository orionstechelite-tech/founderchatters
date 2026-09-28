# 03 — Domain Model

## Identity
- User
- Session
- EmailVerificationToken
- PasswordResetToken

## Founder identity
- FounderProfile
- Company
- Expertise
- Need
- FounderExpertise
- FounderNeed

## Admission
- FounderApplication
- ApplicationStatusEvent

## Requests
- Request
- RequestTopic
- RequestResponse
- SavedFounder

## Messaging
- Conversation
- ConversationParticipant
- Message

## Contribution
- HelpConfirmation
- Contribution
- ContributionTopic
- ThankYouNote

## Notifications
- Notification
- NotificationDelivery
- NotificationTemplate

## Safety
- Report
- Block
- ModerationAction

## Support
- SupportCase
- SupportMessage

## Admin / platform
- AdminRole
- Permission
- UserAdminRole
- AuditLog
- TaxonomyTopic
- JobFailure
- PlatformSetting

## Core invariants

1. A User may not enter the member network until:
   - email verified
   - application approved
   - onboarding completed

2. A Contribution is derived from confirmed help, not directly created by arbitrary admin/user input.

3. A Conversation may be tied to a Request. Request-linked context must remain recoverable even after the request is resolved.

4. A Block prevents new direct interaction according to product policy but must not destroy audit/history required for safety.

5. Application status transitions are historical and auditable.

6. Moderated content is soft-hidden/removed, not silently destroyed.

7. Deleted accounts may be anonymized while integrity-bearing records remain with non-identifying references.

8. Taxonomy topics are stable IDs; display names may change without rewriting historical contribution meaning.
