import { expect, test } from '../fixtures/playwright.js';

import { E2E_PASSWORD, E2E_WEB_ORIGIN } from '../env.js';
import {
  createAdminFounder,
  createRejectedApplicant,
} from '../fixtures/users.js';
import { gotoApp, openAs } from '../helpers/auth.js';
import {
  completeApplicationForm,
  completeOnboarding,
  fillAuthForm,
} from '../helpers/forms.js';
import { e2eEmail, e2eName } from '../helpers/ids.js';
import { findUserIdByEmail, issueVerificationUrl } from '../helpers/tokens.js';

test.describe('GP-01 founder admission', () => {
  test.describe.configure({ timeout: 180_000 });
  test('signup, verify, needs-info, approve, onboard, and enter /home', async ({
    browser,
  }) => {
    const email = e2eEmail('gp01');
    const displayName = e2eName('Ada Founder');
    const reviewer = await createAdminFounder(
      'APPLICATION_REVIEWER',
      'gp01-reviewer',
    );

    const guest = await browser.newContext();
    const page = await guest.newPage();
    await gotoApp(page, '/signup');
    await fillAuthForm(page, email, E2E_PASSWORD, 'Work email');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/verify-email/);

    await gotoApp(page, '/home');
    await expect(page).toHaveURL(/\/verify-email/);

    const userId = await findUserIdByEmail(email);
    await gotoApp(page, await issueVerificationUrl(userId));
    await expect(
      page.getByRole('heading', { name: 'Email verified' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/application/);

    await completeApplicationForm(page);
    await expect(page.getByText('Nexora Labs')).toBeVisible();
    await page.getByRole('button', { name: 'Submit application' }).click();
    await expect(
      page.getByText(/manual review|submitted/i).first(),
    ).toBeVisible();

    await gotoApp(page, '/home');
    await expect(page).toHaveURL(/\/application/);
    await guest.close();

    const admin = await openAs(browser, reviewer, '/admin/applications');
    await expect(admin.page.getByText(email)).toBeVisible();
    await admin.page.getByRole('link', { name: 'Open' }).first().click();
    await admin.page.getByRole('button', { name: 'Needs info' }).click();
    await admin.page
      .getByLabel('Note for the founder')
      .fill('Please add a clearer building summary.');
    await admin.page.getByRole('button', { name: 'Send request' }).click();
    await expect(admin.page.getByText('Needs info').first()).toBeVisible();
    await admin.context.close();

    const founder = await browser.newContext();
    const founderPage = await founder.newPage();
    await founderPage.goto(`${E2E_WEB_ORIGIN}/signin`);
    await fillAuthForm(founderPage, email, E2E_PASSWORD, 'Email');
    await founderPage.getByRole('button', { name: 'Sign in' }).click();
    await expect(founderPage).toHaveURL(/\/application/);
    await expect(
      founderPage.getByRole('heading', {
        name: /needs more information/i,
      }),
    ).toBeVisible();
    await founderPage
      .getByRole('button', { name: 'Update application' })
      .click();
    await expect(founderPage.getByLabel('Company / startup')).toHaveValue(
      'Nexora Labs',
    );
    await founderPage
      .getByLabel('What are you building?')
      .fill(
        'A fictional founder-to-founder workflow tool currently in private alpha, now with a clearer GTM summary.',
      );
    await founderPage
      .getByRole('button', { name: /Review updates|Review application/ })
      .click();
    await founderPage
      .getByRole('button', { name: 'Resubmit application' })
      .click();
    await expect(
      founderPage.getByText(/submitted|manual review/i).first(),
    ).toBeVisible();
    await founder.close();

    const adminAgain = await openAs(browser, reviewer, '/admin/applications');
    await expect(adminAgain.page.getByText(email)).toBeVisible();
    await adminAgain.page.getByRole('link', { name: 'Open' }).first().click();
    await adminAgain.page.getByRole('button', { name: 'Approve' }).click();
    await adminAgain.page
      .getByRole('button', { name: 'Confirm approval' })
      .click();
    await expect(adminAgain.page.getByText('Approved').first()).toBeVisible();
    await adminAgain.context.close();

    const onboard = await browser.newContext();
    const onboardPage = await onboard.newPage();
    await onboardPage.goto(`${E2E_WEB_ORIGIN}/signin`);
    await fillAuthForm(onboardPage, email, E2E_PASSWORD, 'Email');
    await onboardPage.getByRole('button', { name: 'Sign in' }).click();
    await expect(onboardPage).toHaveURL(/\/onboarding/);
    await onboardPage.goto(`${E2E_WEB_ORIGIN}/home`);
    await expect(onboardPage).toHaveURL(/\/onboarding/);
    await completeOnboarding(onboardPage, displayName);
    await expect(onboardPage).toHaveURL(/\/home/);
    await expect(
      onboardPage.getByRole('heading', { name: /You’re in the network/i }),
    ).toBeVisible();
    await onboard.close();
  });

  test('rejected application offers support as the current next step', async ({
    browser,
  }) => {
    const rejected = await createRejectedApplicant('gp01-rejected');
    const { context, page } = await openAs(browser, rejected, '/application');
    await expect(
      page.getByRole('link', { name: 'Contact support' }),
    ).toBeVisible();
    await gotoApp(page, '/home');
    await expect(page).toHaveURL(/\/application/);
    await context.close();
  });
});
