import { expect, test } from '../fixtures/playwright.js';

import { E2E_PASSWORD } from '../env.js';
import { createActiveFounder } from '../fixtures/users.js';
import { gotoApp, openAs, openGuest } from '../helpers/auth.js';
import { fillAuthForm } from '../helpers/forms.js';
import { queryOne } from '../helpers/db.js';
import { issueExpiredResetUrl, issueResetUrl } from '../helpers/tokens.js';

const NEXT_PASSWORD = 'e2e-replacement-horse';

test.describe('GP-09 password reset and GP-10 account deletion', () => {
  test.describe.configure({ timeout: 180_000 });
  test('resets a password once and rejects reused or expired tokens', async ({
    browser,
  }) => {
    const user = await createActiveFounder('gp09');
    const guest = await openGuest(browser, '/forgot-password');
    await guest.page.getByLabel('Email address').fill(user.email);
    await guest.page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(
      guest.page.getByRole('heading', { name: 'Check your inbox' }),
    ).toBeVisible();

    const resetUrl = await issueResetUrl(user.id);
    await gotoApp(guest.page, resetUrl);
    await guest.page
      .getByLabel('New password', { exact: true })
      .fill(NEXT_PASSWORD);
    await guest.page.getByLabel('Confirm new password').fill(NEXT_PASSWORD);
    await guest.page
      .getByRole('button', { name: /reset password|update password|save/i })
      .click();
    await expect(
      guest.page.getByText(/password.*reset|updated/i).first(),
    ).toBeVisible();

    await gotoApp(guest.page, resetUrl);
    await guest.page
      .getByLabel('New password', { exact: true })
      .fill(NEXT_PASSWORD);
    await guest.page.getByLabel('Confirm new password').fill(NEXT_PASSWORD);
    await guest.page.getByRole('button', { name: 'Update password' }).click();
    await expect(
      guest.page
        .getByText(/expired|invalid|already used|did not work|unavailable/i)
        .first(),
    ).toBeVisible();
    await guest.context.close();

    const oldCreds = await openGuest(browser, '/signin');
    await fillAuthForm(oldCreds.page, user.email, E2E_PASSWORD, 'Email');
    await oldCreds.page.getByRole('button', { name: 'Sign in' }).click();
    await expect(oldCreds.page.getByRole('alert')).toBeVisible();
    await oldCreds.context.close();

    const newCreds = await openGuest(browser, '/signin');
    await fillAuthForm(newCreds.page, user.email, NEXT_PASSWORD, 'Email');
    await newCreds.page.getByRole('button', { name: 'Sign in' }).click();
    await expect(newCreds.page).toHaveURL(/\/home/);
    await newCreds.context.close();

    const expired = await createActiveFounder('gp09-expired');
    const expiredGuest = await openGuest(
      browser,
      await issueExpiredResetUrl(expired.id),
    );
    await expiredGuest.page
      .getByLabel('New password', { exact: true })
      .fill(NEXT_PASSWORD);
    await expiredGuest.page
      .getByLabel('Confirm new password')
      .fill(NEXT_PASSWORD);
    await expiredGuest.page
      .getByRole('button', { name: 'Update password' })
      .click();
    await expect(
      expiredGuest.page.getByText(/expired|invalid|already used/i).first(),
    ).toBeVisible();
    await expiredGuest.context.close();
  });

  test('deletes an account, clears the session, and anonymizes public identity', async ({
    browser,
  }) => {
    const user = await createActiveFounder('gp10');
    const { context, page } = await openAs(browser, user, '/settings/account');
    await page.getByRole('button', { name: 'Delete account' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
    const confirmDelete = dialog.getByRole('button', {
      name: 'Delete account',
    });
    await expect(confirmDelete).toBeEnabled();
    await confirmDelete.click();
    await expect(page).toHaveURL(/\/(signin|$)/);

    await gotoApp(page, '/home');
    await expect(page).toHaveURL(/\/signin/);
    await context.close();

    const persisted = await queryOne<{
      deletedAt: Date | null;
      displayName: string | null;
      applicationId: string | null;
    }>(
      `SELECT u."deletedAt", p."displayName", a.id AS "applicationId"
       FROM "User" u
       LEFT JOIN "FounderProfile" p ON p."userId" = u.id
       LEFT JOIN "FounderApplication" a ON a."userId" = u.id
       WHERE u.id = $1`,
      [user.id],
    );
    expect(persisted.deletedAt).not.toBeNull();
    expect(persisted.displayName).toBe('Deleted founder');
    expect(persisted.applicationId).not.toBeNull();
  });
});
