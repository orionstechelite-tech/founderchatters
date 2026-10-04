import { expect, test } from '../fixtures/playwright.js';

import { E2E_WEB_ORIGIN } from '../env.js';
import {
  createActiveFounder,
  createAdminFounder,
  createApprovedIncompleteFounder,
  createPendingApplicant,
  createSuspendedFounder,
  createUnverifiedApplicant,
} from '../fixtures/users.js';
import { openAs } from '../helpers/auth.js';

test.describe('Access-state and Admin permission regressions', () => {
  test('member access states redirect before member routes', async ({
    browser,
  }) => {
    const unverified = await createUnverifiedApplicant('perm-unverified');
    const pending = await createPendingApplicant('perm-pending');
    const approved = await createApprovedIncompleteFounder('perm-approved');
    const suspended = await createSuspendedFounder('perm-suspended');
    const active = await createActiveFounder('perm-active');

    const cases = [
      [unverified, '/verify-email'],
      [pending, '/application'],
      [approved, '/onboarding'],
      [suspended, '/suspended'],
    ] as const;

    for (const [user, destination] of cases) {
      const session = await openAs(browser, user, '/home');
      await expect(
        session.page.getByText('Loading your workspace…'),
      ).toHaveCount(0, { timeout: 30_000 });
      await expect(session.page).toHaveURL(new RegExp(destination));
      await session.context.close();
    }

    const member = await openAs(browser, active, '/home');
    await expect(member.page).toHaveURL(/\/home/);
    await member.page.goto(`${E2E_WEB_ORIGIN}/admin`);
    await expect(
      member.page.getByRole('heading', { name: /Permission denied/i }),
    ).toBeVisible();
    await member.context.close();
  });

  test('Admin route permissions stay role-specific', async ({ browser }) => {
    const support = await createAdminFounder('SUPPORT', 'perm-support');
    const reviewer = await createAdminFounder(
      'APPLICATION_REVIEWER',
      'perm-reviewer',
    );

    const supportSession = await openAs(
      browser,
      support,
      '/admin/applications',
    );
    await expect(
      supportSession.page.getByRole('heading', {
        name: /permission|don’t have permission/i,
      }),
    ).toBeVisible();
    await supportSession.context.close();

    const reviewerSession = await openAs(
      browser,
      reviewer,
      '/admin/applications',
    );
    await expect(
      reviewerSession.page.getByRole('heading', { name: /Applications/i }),
    ).toBeVisible();
    await reviewerSession.page.goto(`${E2E_WEB_ORIGIN}/admin/admins`);
    await expect(
      reviewerSession.page.getByRole('heading', {
        name: /permission|don’t have permission/i,
      }),
    ).toBeVisible();
    await reviewerSession.context.close();
  });
});
