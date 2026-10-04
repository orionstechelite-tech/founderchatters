import { expect, test } from '../fixtures/playwright.js';

import { createPublishedRequest } from '../fixtures/requests.js';
import { createActiveFounder } from '../fixtures/users.js';
import { openAs } from '../helpers/auth.js';
import { publishAsk } from '../helpers/forms.js';

test.describe('GP-02 ask / publish', () => {
  test('keeps typed data after validation, publishes, and enforces the open-request limit', async ({
    browser,
  }) => {
    const founder = await createActiveFounder('gp02');
    const { context, page } = await openAs(browser, founder, '/ask');
    const headline =
      'Looking for an operator who launched a B2B marketplace in India';
    const contextText =
      'We are a fictional two-person team preparing a marketplace launch and need first-city GTM advice.';

    await expect(
      page.getByRole('heading', {
        name: 'Ask for the kind of help another founder can actually give.',
      }),
    ).toBeVisible();
    await page.getByLabel('Headline').fill(headline);
    await page.getByLabel('Context').fill(contextText);
    await page.getByRole('button', { name: 'Preview request' }).click();
    await expect(
      page.getByRole('heading', { name: 'Preview before publishing.' }),
    ).toBeVisible();
    await expect(page.getByText(headline)).toBeVisible();
    await page.getByRole('button', { name: 'Edit request' }).click();
    await expect(page.getByLabel('Headline')).toHaveValue(headline);
    await expect(page.getByLabel('Context')).toHaveValue(contextText);

    await publishAsk(page, headline, contextText);
    await expect(page).toHaveURL(/\/requests\//);
    await expect(page.getByRole('heading', { name: headline })).toBeVisible();
    await expect(page.getByText(contextText)).toBeVisible();

    await page.getByRole('button', { name: 'Mark resolved' }).click();
    await expect(page.getByText('Resolved').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: headline })).toBeVisible();
    await context.close();

    const limited = await createActiveFounder('gp02-limit');
    await createPublishedRequest(limited, {
      headline: `${limited.displayName} open 1`,
    });
    await createPublishedRequest(limited, {
      headline: `${limited.displayName} open 2`,
    });
    await createPublishedRequest(limited, {
      headline: `${limited.displayName} open 3`,
    });
    const fourth = await openAs(browser, limited, '/ask');
    await publishAsk(
      fourth.page,
      'Fourth open request should be blocked by the frozen limit',
      'This attempt should stay unpublished because three open requests already exist.',
    );
    await expect(fourth.page.getByText(/three open requests/i)).toBeVisible();
    await expect(fourth.page).toHaveURL(/\/ask/);
    await fourth.context.close();
  });
});
