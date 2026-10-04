import { expect, test } from '../fixtures/playwright.js';

import { createPublishedRequest } from '../fixtures/requests.js';
import { createActiveFounder, createAdminFounder } from '../fixtures/users.js';
import { query } from '../helpers/db.js';
import { gotoApp, openAs } from '../helpers/auth.js';

test.describe('GP-07 safety / moderation', () => {
  test('reports through Admin, hides the reporter, and keeps DMs report-scoped', async ({
    browser,
  }) => {
    const reporter = await createActiveFounder('gp07-reporter');
    const reported = await createActiveFounder('gp07-reported');
    const moderator = await createAdminFounder('MODERATOR', 'gp07-mod');
    const request = await createPublishedRequest(reported);

    const reporterSession = await openAs(
      browser,
      reporter,
      `/requests/${request.id}`,
    );
    await reporterSession.page
      .getByRole('button', { name: 'Report request' })
      .click();
    await reporterSession.page
      .getByRole('button', { name: 'Spam or unwanted promotion' })
      .click();
    await reporterSession.page
      .getByLabel('Additional context')
      .fill('Fictional promotional noise on a public request.');
    await reporterSession.page
      .getByRole('button', { name: 'Submit report' })
      .click();
    await expect(
      reporterSession.page.getByText(/Report submitted/),
    ).toBeVisible();
    await reporterSession.context.close();

    const reportedSession = await openAs(
      browser,
      reported,
      `/requests/${request.id}`,
    );
    await expect(reportedSession.page.getByText(reporter.email)).toHaveCount(0);
    await expect(
      reportedSession.page.getByText(reporter.displayName),
    ).toHaveCount(0);
    await reportedSession.context.close();

    const admin = await openAs(browser, moderator, '/admin/reports');
    await expect(
      admin.page.getByRole('heading', { name: 'Reports' }),
    ).toBeVisible();
    await expect(
      admin.page.getByText(/global private|all messages/i),
    ).toHaveCount(0);
    await admin.page
      .getByRole('link', { name: /REQUEST/ })
      .first()
      .click();
    await expect(
      admin.page.getByRole('heading', { name: /REQUEST/ }),
    ).toBeVisible();
    await admin.page.getByRole('button', { name: 'Enforce' }).click();
    await expect(
      admin.page.getByText(/ENFORCED|enforced/i).first(),
    ).toBeVisible();
    await admin.context.close();

    const audits = await query(
      `SELECT id FROM "AuditLog"
       WHERE "actorUserId" = $1 AND action ILIKE '%report%'`,
      [moderator.id],
    );
    const moderation = await query(
      `SELECT id FROM "ModerationAction" WHERE "actorUserId" = $1`,
      [moderator.id],
    );
    expect(audits.length + moderation.length).toBeGreaterThan(0);
  });

  test('does not expose a global Admin private-message browser', async ({
    browser,
  }) => {
    const admin = await createAdminFounder('SUPER_ADMIN', 'gp07-super');
    const session = await openAs(browser, admin, '/admin/members');
    await expect(
      session.page.getByRole('heading', { name: 'Members' }),
    ).toBeVisible();
    await expect(session.page.getByText(/Write a message|Inbox/i)).toHaveCount(
      0,
    );
    await gotoApp(session.page, '/admin/messages');
    await expect(session.page.getByText(/Write a message|Inbox/i)).toHaveCount(
      0,
    );
    await session.context.close();
  });
});
