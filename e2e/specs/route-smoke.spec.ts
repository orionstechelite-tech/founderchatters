import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/playwright.js';

import {
  createAuditEntry,
  createFailedJob,
  createFailedNotificationDelivery,
  createHelpedContribution,
  createOpenReport,
  createOpenSupportCase,
  createRequestLinkedConversation,
  findApplicationId,
  findNotificationTemplateId,
} from '../fixtures/ops.js';
import { createPublishedRequest } from '../fixtures/requests.js';
import {
  createActiveFounder,
  createAdminFounder,
  createApprovedIncompleteFounder,
  createPendingApplicant,
  createVerifiedApplicant,
} from '../fixtures/users.js';
import { gotoApp, openAs, openGuest } from '../helpers/auth.js';
import { issueResetUrl } from '../helpers/tokens.js';

async function expectReachable(
  page: Page,
  path: string,
  heading?: string | RegExp,
): Promise<void> {
  await gotoApp(page, path);
  await expect(page.locator('body')).not.toContainText(
    /Internal Server Error|Application error/i,
  );
  if (heading) {
    await expect(
      page.getByRole('heading', { name: heading }).first(),
    ).toBeVisible();
  }
}

test.describe('Route smoke matrix', () => {
  test.describe.configure({ timeout: 480_000 });
  test('public and guest/auth routes render', async ({ browser }) => {
    const applicant = await createVerifiedApplicant('smoke-reset');
    const resetPath = new URL(await issueResetUrl(applicant.id)).pathname;
    const { context, page } = await openGuest(browser, '/');
    for (const [path, heading] of [
      ['/', /Build companies/],
      ['/how-it-works', /Useful founder help/],
      ['/for-founders', /The right founder/],
      ['/guidelines', /Guidelines/],
      ['/privacy', /Privacy/],
      ['/terms', /Terms/],
      ['/support', /Contact support/],
      ['/support/new', /New support request/],
      ['/support/new?category=account', /New support request/],
      ['/signin', /Sign in/],
      ['/signup', /Create your founder account/],
      ['/verify-email', /Verify your email/],
      ['/forgot-password', /Reset your password/],
      [resetPath, /Set a new password/],
    ] as const) {
      await expectReachable(page, path, heading);
    }
    await context.close();
  });

  test('admission, member, and admin routes render with fixtures', async ({
    browser,
  }) => {
    const founder = await createActiveFounder('smoke-member');
    const helper = await createActiveFounder('smoke-helper');
    const reporter = await createActiveFounder('smoke-reporter');
    const pending = await createPendingApplicant('smoke-pending');
    const approved = await createApprovedIncompleteFounder('smoke-onboard');
    const verified = await createVerifiedApplicant('smoke-application');
    const admin = await createAdminFounder('SUPER_ADMIN', 'smoke-admin');
    const request = await createPublishedRequest(founder);
    const conversation = await createRequestLinkedConversation(founder, helper);
    const report = await createOpenReport(reporter, request.id);
    const support = await createOpenSupportCase();
    const contribution = await createHelpedContribution(founder, helper);
    const delivery = await createFailedNotificationDelivery(founder);
    const templateId = await findNotificationTemplateId();
    const audit = await createAuditEntry(admin);
    const job = await createFailedJob();
    const applicationId = await findApplicationId(pending.id);

    const application = await openAs(browser, verified, '/application');
    await expectReachable(
      application.page,
      '/application',
      /founder network|building|application/i,
    );
    await application.context.close();

    const onboard = await openAs(browser, approved, '/onboarding');
    await expectReachable(onboard.page, '/onboarding', /What are you building/);
    await onboard.context.close();

    const member = await openAs(browser, founder, '/home');
    for (const [path, heading] of [
      ['/home', /You’re in the network/],
      ['/ask', /Ask for the kind of help/],
      [`/requests/${request.id}`, /.+/],
      ['/discover', /actually done it/],
      [`/founders/${founder.id}`, /.+/],
      [`/founders/${helper.id}`, /.+/],
      ['/messages', /Conversations stay tied/],
      [`/messages/${conversation.id}`, /Conversations stay tied/],
      ['/reputation', /.+/],
      ['/notifications', /Only what needs your attention|Notifications/],
      ['/settings/profile', /Account & preferences/],
      ['/settings/account', /Account & preferences/],
      ['/settings/notifications', /Account & preferences/],
      ['/settings/privacy', /Account & preferences/],
      ['/settings/blocked', /Account & preferences/],
      ['/settings/security', /Account & preferences/],
    ] as const) {
      await expectReachable(member.page, path, heading);
    }
    await member.context.close();

    const adminSession = await openAs(browser, admin, '/admin');
    for (const [path, heading] of [
      ['/admin', /Command Center/],
      ['/admin/applications', /Applications/],
      [`/admin/applications/${applicationId}`, /Application/],
      ['/admin/members', /Members/],
      [`/admin/members/${founder.id}`, /Founder 360|Nexora|E2E/],
      ['/admin/requests', /Requests/],
      [`/admin/requests/${request.id}`, /Request|marketplace/],
      ['/admin/reports', /Reports/],
      [`/admin/reports/${report.id}`, /REQUEST/],
      ['/admin/support', /Support & Appeals/],
      [`/admin/support/${support.id}`, /Support case|verification email/],
      ['/admin/reputation', /Reputation/],
      [`/admin/reputation/${contribution.id}`, /Contribution/],
      ['/admin/notifications', /Notifications/],
      [`/admin/notifications/${delivery.id}`, /Delivery|approved/i],
      ['/admin/notifications/templates', /Notification templates/],
      [
        `/admin/notifications/templates/${templateId}`,
        /Template|application-status/i,
      ],
      ['/admin/taxonomy', /Taxonomy/],
      ['/admin/analytics', /Analytics/],
      ['/admin/admins', /Admins & Roles/],
      [`/admin/admins/${admin.id}`, /Admin user|E2E/],
      ['/admin/roles', /Roles & permissions/],
      ['/admin/audit', /Audit log/],
      [`/admin/audit/${audit.id}`, /Audit event|MEMBER_SUSPENDED/],
      ['/admin/settings', /Platform settings/],
      ['/admin/system', /System health/],
      ['/admin/system/jobs', /Failed jobs/],
      [`/admin/system/jobs/${job.id}`, /Failed job|deliver-email/],
      ['/admin/search?q=nexora', /Search/],
    ] as const) {
      await expectReachable(adminSession.page, path, heading);
    }
    await gotoApp(adminSession.page, '/admin/messages');
    await expect(adminSession.page.locator('body')).not.toContainText(
      /Internal Server Error|Application error/i,
    );
    await expect(
      adminSession.page.getByText(/Write a message|Inbox/i),
    ).toHaveCount(0);
    await adminSession.context.close();
  });
});
