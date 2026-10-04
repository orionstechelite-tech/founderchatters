import { expect, test } from '../fixtures/playwright.js';

import { createPublishedRequest } from '../fixtures/requests.js';
import { countContributions, createActiveFounder } from '../fixtures/users.js';
import { openAs } from '../helpers/auth.js';

const ADVICE =
  'Start with one city, talk to ten operators, and keep the first offer narrow.';

test.describe('GP-03 advice and GP-04 help confirmation', () => {
  test.describe.configure({ timeout: 180_000 });
  test('submits advice without creating a contribution', async ({
    browser,
  }) => {
    const requester = await createActiveFounder('gp03-req');
    const helper = await createActiveFounder('gp03-help');
    const request = await createPublishedRequest(requester);
    const before = await countContributions(helper.id);

    const helperSession = await openAs(
      browser,
      helper,
      `/requests/${request.id}`,
    );
    await helperSession.page
      .getByRole('button', { name: 'I can help' })
      .click();
    await helperSession.page
      .getByRole('button', { name: /Share advice/ })
      .click();
    await helperSession.page.getByLabel('Your advice').fill(ADVICE);
    await helperSession.page
      .getByRole('button', { name: 'Publish advice' })
      .click();
    await expect(helperSession.page.getByText(ADVICE)).toBeVisible();
    await helperSession.context.close();

    const requesterSession = await openAs(
      browser,
      requester,
      `/requests/${request.id}`,
    );
    await expect(requesterSession.page.getByText(ADVICE)).toBeVisible();
    await requesterSession.context.close();

    expect(await countContributions(helper.id)).toBe(before);
  });

  test('records HELPED reputation and refuses implicit outcomes', async ({
    browser,
  }) => {
    const requester = await createActiveFounder('gp04-req');
    const helper = await createActiveFounder('gp04-help');
    const still = await createActiveFounder('gp04-still');
    const notHelpful = await createActiveFounder('gp04-not');
    const request = await createPublishedRequest(requester);

    for (const [user, body] of [
      [helper, ADVICE],
      [still, `${ADVICE} Still talking path.`],
      [notHelpful, `${ADVICE} Not helpful path.`],
    ] as const) {
      const session = await openAs(browser, user, `/requests/${request.id}`);
      await session.page.getByRole('button', { name: 'I can help' }).click();
      await session.page.getByRole('button', { name: /Share advice/ }).click();
      await session.page.getByLabel('Your advice').fill(body);
      await session.page
        .getByRole('button', { name: 'Publish advice' })
        .click();
      await expect(session.page.getByText(body)).toBeVisible();
      await session.context.close();
    }

    const requesterSession = await openAs(
      browser,
      requester,
      `/requests/${request.id}`,
    );
    const cards = requesterSession.page.locator('.fc-help-card');
    await expect(cards).toHaveCount(3);

    await cards
      .filter({ hasText: still.displayName })
      .getByRole('button', { name: 'Confirm help' })
      .click();
    await requesterSession.page
      .getByRole('button', { name: 'We’re still talking' })
      .click();
    await requesterSession.page
      .getByRole('button', { name: 'Continue' })
      .click();
    await expect(
      requesterSession.page.getByText(/still talking|No contribution/i).first(),
    ).toBeVisible();
    expect(await countContributions(still.id)).toBe(0);
    await requesterSession.page
      .getByRole('button', { name: 'Back to request' })
      .click();
    await expect(requesterSession.page.getByRole('dialog')).toHaveCount(0);

    await cards
      .filter({ hasText: notHelpful.displayName })
      .getByRole('button', { name: 'Confirm help' })
      .click();
    await requesterSession.page
      .getByRole('button', { name: 'No / not yet' })
      .click();
    await requesterSession.page
      .getByRole('button', { name: 'Continue' })
      .click();
    await requesterSession.page
      .getByRole('button', { name: 'Back to request' })
      .click();
    await expect(requesterSession.page.getByRole('dialog')).toHaveCount(0);
    expect(await countContributions(notHelpful.id)).toBe(0);

    await cards
      .filter({ hasText: helper.displayName })
      .getByRole('button', { name: 'Confirm help' })
      .click();
    await requesterSession.page
      .getByRole('button', { name: 'Yes — this helped' })
      .click();
    const topic = requesterSession.page.getByLabel('Product');
    if (await topic.count()) {
      await topic.check();
    }
    await requesterSession.page
      .getByLabel('Add a thank-you note')
      .fill('This helped us choose a first-city beachhead.');
    await requesterSession.page
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirm help' })
      .click();
    await expect(
      requesterSession.page.getByText(/help confirmed|thank/i).first(),
    ).toBeVisible();
    await requesterSession.context.close();

    expect(await countContributions(helper.id)).toBe(1);
    const reputation = await openAs(browser, helper, '/reputation');
    await expect(
      reputation.page
        .getByText(/confirmed this helped|thank-you|Product/i)
        .first(),
    ).toBeVisible();
    await reputation.context.close();
  });
});
