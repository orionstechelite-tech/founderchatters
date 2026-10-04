import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/playwright.js';

import { createPublishedRequest } from '../fixtures/requests.js';
import { createActiveFounder, createAdminFounder } from '../fixtures/users.js';
import { gotoApp, openAs } from '../helpers/auth.js';
import {
  expectAdminUnsupportedBelow900,
  expectMinimumTouchTarget,
  expectNoHorizontalOverflow,
  expectVisiblePrimaryAction,
  VIEWPORTS,
} from '../helpers/layout.js';

async function checkPublicPage(
  page: Page,
  path: string,
  heading: string | RegExp,
) {
  await gotoApp(page, path);
  await expect(
    page.getByRole('heading', { name: heading }).first(),
  ).toBeVisible();
  await expectVisiblePrimaryAction(
    page,
    /Join FounderChatters|Submit request|Sign in/,
  );
  await expect(page.getByRole('link', { name: 'Privacy' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Terms' })).toBeVisible();
  await expect(
    page.getByText(/10,000 founders|trusted by|users worldwide/i),
  ).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
}

test.describe('Responsive matrix', () => {
  test.describe.configure({ timeout: 240_000 });
  for (const [name, viewport] of [
    ['1440', VIEWPORTS.desktop],
    ['1024', VIEWPORTS.laptop],
    ['768', VIEWPORTS.tablet],
    ['390', VIEWPORTS.mobile],
  ] as const) {
    test(`public marketing at ${name}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      for (const [path, heading] of [
        ['/', /Build companies/],
        ['/how-it-works', /Useful founder help/],
        ['/for-founders', /The right founder/],
        ['/support', /Contact support/],
        ['/support/new', /New support request/],
      ] as const) {
        await checkPublicPage(page, path, heading);
      }
      if (name === '390' || name === '768') {
        await gotoApp(page, '/');
        await page.getByText('Menu', { exact: true }).click();
        await expect(
          page.getByRole('link', { name: 'How it works' }).last(),
        ).toBeVisible();
        await expectMinimumTouchTarget(
          page.getByRole('link', { name: 'Join FounderChatters' }).last(),
        );
      }
      await context.close();
    });
  }

  test('auth forms stay usable at 390', async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORTS.mobile });
    const page = await context.newPage();
    for (const path of ['/signin', '/signup', '/forgot-password']) {
      await gotoApp(page, path);
      await expect(page.locator('form')).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectMinimumTouchTarget(page.getByRole('button').first());
    }
    await context.close();
  });

  test('member routes keep required content and use the approved 390 nav', async ({
    browser,
  }) => {
    const founder = await createActiveFounder('resp-member');
    const request = await createPublishedRequest(founder);
    const { context, page } = await openAs(browser, founder, '/home');
    await page.setViewportSize(VIEWPORTS.mobile);
    const memberRoutes = [
      '/home',
      '/ask',
      `/requests/${request.id}`,
      '/discover',
      `/founders/${founder.id}`,
      '/messages',
      '/reputation',
      '/notifications',
      '/settings/profile',
      '/settings/account',
      '/settings/privacy',
      '/settings/security',
    ];
    for (const path of memberRoutes) {
      await gotoApp(page, path);
      await expect(
        page.getByRole('navigation', { name: 'Member navigation' }),
      ).toBeVisible();
      const navBox = await page
        .getByRole('navigation', { name: 'Member navigation' })
        .boundingBox();
      expect(navBox?.y).toBeGreaterThan(600);
      await expectNoHorizontalOverflow(page);
    }
    await gotoApp(page, '/discover');
    const filters = page
      .getByRole('button', { name: /filter/i })
      .or(page.getByText(/Filters/));
    await expect(filters.first()).toBeVisible();
    await gotoApp(page, '/messages');
    await expect(
      page.getByRole('heading', { name: /Conversations stay tied/ }),
    ).toBeVisible();
    await context.close();
  });

  test('Admin 1440 and 1024 stay operational; <900 is unsupported', async ({
    browser,
  }) => {
    const admin = await createAdminFounder('SUPER_ADMIN', 'resp-admin');
    const session = await openAs(browser, admin, '/admin');
    for (const path of [
      '/admin',
      '/admin/applications',
      '/admin/members',
      '/admin/reports',
      '/admin/support',
      '/admin/admins',
      '/admin/roles',
      '/admin/audit',
      '/admin/system',
    ]) {
      await session.page.setViewportSize(VIEWPORTS.desktop);
      await gotoApp(session.page, path);
      await expect(
        session.page.getByRole('navigation', { name: 'Admin navigation' }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(session.page);

      await session.page.setViewportSize(VIEWPORTS.laptop);
      await expect(
        session.page.getByRole('navigation', { name: 'Admin navigation' }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(session.page);

      await session.page.setViewportSize(VIEWPORTS.adminUnsupported);
      await expectAdminUnsupportedBelow900(session.page);
    }
    await session.context.close();
  });
});
