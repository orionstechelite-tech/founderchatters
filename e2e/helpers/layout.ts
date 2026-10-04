import { expect, type Locator, type Page } from '@playwright/test';

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1024, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
  adminUnsupported: { width: 899, height: 800 },
} as const;

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
    };
  });
  expect(
    overflow.scrollWidth,
    'document should not require horizontal scrolling',
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

export async function expectVisiblePrimaryAction(
  page: Page,
  name: string | RegExp,
): Promise<Locator> {
  const action = page
    .getByRole('link', { name })
    .or(page.getByRole('button', { name }));
  await expect(action.first()).toBeVisible();
  return action.first();
}

export async function expectMinimumTouchTarget(
  locator: Locator,
  min = 44,
): Promise<void> {
  const box = await locator.boundingBox();
  expect(box, 'interactive target should have layout geometry').not.toBeNull();
  if (!box) return;
  expect(box.height, 'touch target height').toBeGreaterThanOrEqual(min);
  expect(box.width, 'touch target width').toBeGreaterThanOrEqual(min);
}

export async function expectAdminUnsupportedBelow900(
  page: Page,
): Promise<void> {
  await expect(
    page.getByRole('heading', { name: 'Larger screen required' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'FounderChatters Admin is optimized for desktop operations.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Admin navigation' }),
  ).toHaveCount(0);
}

export async function expectOneH1(page: Page): Promise<void> {
  await expect(page.locator('h1')).toHaveCount(1);
}

export async function expectVisibleFocus(page: Page): Promise<void> {
  const focused = page.locator(':focus');
  await expect(focused).toHaveCount(1);
  const outline = await focused.evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return {
      outlineStyle: styles.outlineStyle,
      outlineWidth: styles.outlineWidth,
      boxShadow: styles.boxShadow,
    };
  });
  const hasOutline =
    (outline.outlineStyle !== 'none' && outline.outlineWidth !== '0px') ||
    outline.boxShadow !== 'none';
  expect(
    hasOutline,
    'focused control should have a visible focus treatment',
  ).toBe(true);
}
