# 06 — Frontend Route Contract

## Public
- `/`
- `/how-it-works`
- `/for-founders`
- `/guidelines`
- `/privacy`
- `/terms`
- `/support`
- `/support/new?category=<type>`

## Guest/auth
- `/signin`
- `/signup`
- `/verify-email`
- `/forgot-password`
- `/reset-password/[token]`

## Admission
- `/application`
- `/onboarding`

## Member
- `/home`
- `/ask`
- `/requests/[id]`
- `/discover`
- `/founders/[id]`
- `/messages`
- `/messages/[conversationId]`
- `/reputation`
- `/notifications`
- `/settings/profile`
- `/settings/account`
- `/settings/notifications`
- `/settings/privacy`
- `/settings/blocked`
- `/settings/security`

## Admin
- `/admin`
- `/admin/applications`
- `/admin/applications/[id]`
- `/admin/members`
- `/admin/members/[id]`
- `/admin/requests`
- `/admin/requests/[id]`
- `/admin/reports`
- `/admin/reports/[id]`
- `/admin/support`
- `/admin/support/[id]`
- `/admin/reputation`
- `/admin/reputation/[id]`
- `/admin/notifications`
- `/admin/notifications/[id]`
- `/admin/notifications/templates`
- `/admin/notifications/templates/[id]`
- `/admin/taxonomy`
- `/admin/analytics`
- `/admin/admins`
- `/admin/admins/[id]`
- `/admin/roles`
- `/admin/audit`
- `/admin/audit/[id]`
- `/admin/settings`
- `/admin/system`
- `/admin/system/jobs`
- `/admin/system/jobs/[id]`
- `/admin/search?q=`

## Route guards

After authentication:
1. email unverified → `/verify-email`
2. no submitted application → `/application`
3. application pending/needs-info/rejected → `/application`
4. approved + onboarding incomplete → `/onboarding`
5. active → `/home`

Member-only routes require ACTIVE_MEMBER.
Admin routes require an admin role and route permission.
