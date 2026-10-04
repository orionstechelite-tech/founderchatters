import type { Browser, BrowserContext, Page } from '@playwright/test';

import { E2E_API_ORIGIN, E2E_COOKIE_NAME, E2E_WEB_ORIGIN } from '../env.js';
import type { E2eUser } from '../fixtures/users.js';

export async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page
    .getByText('Compiling...')
    .waitFor({ state: 'hidden', timeout: 90_000 })
    .catch(() => undefined);
}

export async function gotoApp(page: Page, path: string): Promise<void> {
  const url = path.startsWith('http') ? path : `${E2E_WEB_ORIGIN}${path}`;
  await page.goto(url);
  await waitForAppReady(page);
}

export async function guestContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext();
}

export async function injectSession(
  context: BrowserContext,
  rawSession: string,
): Promise<void> {
  await context.addCookies([
    {
      name: E2E_COOKIE_NAME,
      value: rawSession,
      url: E2E_API_ORIGIN,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

export async function authenticatedContext(
  browser: Browser,
  user: E2eUser,
): Promise<BrowserContext> {
  const context = await browser.newContext();
  await injectSession(context, user.rawSession);
  return context;
}

export async function openAs(
  browser: Browser,
  user: E2eUser,
  path: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await authenticatedContext(browser, user);
  const page = await context.newPage();
  await gotoApp(page, path);
  return { context, page };
}

export async function openGuest(
  browser: Browser,
  path: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await guestContext(browser);
  const page = await context.newPage();
  await gotoApp(page, path);
  return { context, page };
}
