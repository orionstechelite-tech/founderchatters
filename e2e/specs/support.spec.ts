import { expect, test } from '../fixtures/playwright.js';

import { gotoApp, openGuest, waitForAppReady } from '../helpers/auth.js';
import { e2eEmail } from '../helpers/ids.js';

test.describe('GP-08 public support', () => {
  test('submits a public support case with category preselect and no ticket browsing', async ({
    browser,
  }) => {
    const { context, page } = await openGuest(browser, '/support');
    await expect(
      page.getByRole('heading', { name: 'Contact support' }),
    ).toBeVisible();
    await page
      .locator('a[href="/support/new?category=account"]')
      .click({ noWaitAfter: true });
    await page.waitForURL(/\/support\/new\?category=account/);
    await waitForAppReady(page);
    await expect(page.getByLabel('Category')).toHaveValue('account');

    await gotoApp(page, '/support/new?category=not-a-real-category');
    await expect(page.getByLabel('Category')).toHaveValue('other');

    await page.getByLabel('Email').fill(e2eEmail('gp08'));
    await page
      .getByLabel('Subject')
      .fill('Cannot sign in to a fictional account');
    await page
      .getByLabel(/message|details/i)
      .fill('This is a fictional support request about a test sign-in issue.');
    await page.route('**/v1/support/cases', (route) => {
      if (route.request().method() === 'POST') {
        void route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Temporary support outage.',
              fieldErrors: {},
            },
          }),
        });
        return;
      }
      void route.continue();
    });
    await page.getByRole('button', { name: /send|submit/i }).click();
    await expect(page.getByLabel('Subject')).toHaveValue(
      'Cannot sign in to a fictional account',
    );
    await page.unroute('**/v1/support/cases');
    await page.getByRole('button', { name: /send|submit/i }).click();
    await expect(page.getByText(/Reference:/)).toBeVisible();
    await expect(page.getByText(/does not send an automated/i)).toBeVisible();
    await expect(
      page.getByText(/SLA|within 24 hours|we emailed you/i),
    ).toHaveCount(0);
    await expect(page.getByLabel(/password|token/i)).toHaveCount(0);

    await gotoApp(page, '/support');
    await expect(page.getByText(/your tickets|open cases/i)).toHaveCount(0);
    await context.close();
  });
});
