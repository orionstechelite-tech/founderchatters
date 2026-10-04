import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/playwright.js';

import { createPublishedRequest } from '../fixtures/requests.js';
import { createActiveFounder, createAdminFounder } from '../fixtures/users.js';
import { gotoApp, openAs, openGuest } from '../helpers/auth.js';
import {
  expectMinimumTouchTarget,
  expectOneH1,
  expectVisibleFocus,
  VIEWPORTS,
} from '../helpers/layout.js';

async function expectAxeClean(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations,
    JSON.stringify(results.violations, null, 2),
  ).toEqual([]);
}

test.describe('Accessibility matrix', () => {
  test.describe.configure({ timeout: 240_000 });
  test('axe scans representative public, auth, member, and admin surfaces', async ({
    browser,
  }) => {
    const founder = await createActiveFounder('a11y-member');
    const admin = await createAdminFounder('SUPER_ADMIN', 'a11y-admin');
    const request = await createPublishedRequest(founder);

    const guest = await openGuest(browser, '/');
    for (const path of [
      '/',
      '/signin',
      '/signup',
      '/support',
      '/support/new',
    ]) {
      await gotoApp(guest.page, path);
      await expectOneH1(guest.page);
      await expectAxeClean(guest.page);
    }
    await guest.context.close();

    const member = await openAs(browser, founder, '/home');
    for (const path of [
      '/home',
      `/requests/${request.id}`,
      '/messages',
      '/settings/account',
    ]) {
      await gotoApp(member.page, path);
      await expectOneH1(member.page);
      await expectAxeClean(member.page);
    }
    await member.context.close();

    const adminSession = await openAs(browser, admin, '/admin');
    await expectAxeClean(adminSession.page);
    await adminSession.context.close();
  });

  test('keyboard, labels, focus trap, and 390 touch targets', async ({
    browser,
  }) => {
    const founder = await createActiveFounder('a11y-keys');
    const guest = await openGuest(browser, '/signin');
    await guest.page.getByLabel('Email').focus();
    await expectVisibleFocus(guest.page);
    await guest.page.getByRole('button', { name: 'Sign in' }).click();
    await expect(guest.page.getByLabel('Email')).toHaveAccessibleDescription(
      'Enter a valid email address.',
    );
    await guest.context.close();

    const member = await openAs(browser, founder, '/settings/account');
    const deleteTrigger = member.page.getByRole('button', {
      name: 'Delete account',
    });
    await deleteTrigger.click();
    const dialog = member.page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await member.page.keyboard.press('Tab');
    await expect(dialog.locator(':focus')).toHaveCount(1);
    await member.page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(deleteTrigger).toBeFocused();

    await member.page.setViewportSize(VIEWPORTS.mobile);
    await gotoApp(member.page, '/');
    await expectMinimumTouchTarget(
      member.page.getByRole('link', { name: 'Join FounderChatters' }).last(),
    );
    await member.context.close();
  });
});
