import { expect, test } from '../fixtures/playwright.js';

import { E2E_WEB_ORIGIN } from '../env.js';
import { createPublishedRequest } from '../fixtures/requests.js';
import { createActiveFounder } from '../fixtures/users.js';
import { openAs } from '../helpers/auth.js';

const CONTACT = 'Priya Operator / GTM Lead / Harbor Co';
const HARMLESS_MESSAGE = 'Sharing a fictional marketplace checklist.';

test.describe('GP-05 introduction consent and GP-06 request-linked DM', () => {
  test.describe.configure({ timeout: 180_000 });
  test('hides intro contact details until the requester consents', async ({
    browser,
  }) => {
    const requester = await createActiveFounder('gp05-req');
    const helper = await createActiveFounder('gp05-help');
    const request = await createPublishedRequest(requester);

    const helperSession = await openAs(
      browser,
      helper,
      `/requests/${request.id}`,
    );
    await helperSession.page
      .getByRole('button', { name: 'I can help' })
      .click();
    await helperSession.page
      .getByRole('button', { name: /Offer introduction/ })
      .click();
    await helperSession.page.getByLabel('Who can you introduce?').fill(CONTACT);
    await helperSession.page
      .getByLabel('Why this person may be relevant')
      .fill('Relevant marketplace operator with consent to be introduced.');
    await helperSession.page
      .getByText('I have their permission to make this intro')
      .click();
    await helperSession.page
      .getByRole('button', { name: 'Offer introduction' })
      .click();
    await expect(helperSession.page.getByText(CONTACT)).toBeVisible();
    await helperSession.context.close();

    const requesterSession = await openAs(
      browser,
      requester,
      `/requests/${request.id}`,
    );
    await expect(requesterSession.page.getByText(CONTACT)).toHaveCount(0);
    await requesterSession.page
      .getByRole('button', { name: 'Accept introduction' })
      .click();
    await requesterSession.page
      .getByRole('button', { name: /Accept|Confirm/ })
      .last()
      .click();
    await expect(requesterSession.page.getByText(CONTACT)).toBeVisible();
    await requesterSession.context.close();
  });

  test('creates a request-linked conversation, preserves a failed draft, and honors block', async ({
    browser,
  }) => {
    const requester = await createActiveFounder('gp06-req');
    const helper = await createActiveFounder('gp06-help');
    const request = await createPublishedRequest(requester);

    const helperSession = await openAs(
      browser,
      helper,
      `/requests/${request.id}`,
    );
    await helperSession.page
      .getByRole('button', { name: 'I can help' })
      .click();
    await helperSession.page
      .getByRole('button', { name: /Chat privately/ })
      .click();
    await expect(
      helperSession.page.getByText(/private|offered|waiting/i).first(),
    ).toBeVisible();
    await helperSession.context.close();

    const requesterSession = await openAs(
      browser,
      requester,
      `/requests/${request.id}`,
    );
    const startChat = requesterSession.page.getByRole('button', {
      name: /Start private chat|Open private chat/,
    });
    await expect(startChat).toBeVisible();
    await startChat.click();
    await expect(requesterSession.page).toHaveURL(/\/messages\//);
    await expect(
      requesterSession.page.getByText(request.headline),
    ).toBeVisible();

    await requesterSession.page.route(
      '**/v1/conversations/**/messages',
      (route) => {
        if (route.request().method() === 'POST') {
          void route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({
              error: {
                code: 'INTERNAL_ERROR',
                message: 'Temporary delivery failure.',
                fieldErrors: {},
              },
            }),
          });
          return;
        }
        void route.continue();
      },
    );
    await requesterSession.page
      .getByLabel('Write a message')
      .fill(HARMLESS_MESSAGE);
    await requesterSession.page.getByRole('button', { name: 'Send' }).click();
    await expect(
      requesterSession.page.getByLabel('Write a message'),
    ).toHaveValue(HARMLESS_MESSAGE);
    await requesterSession.page.unroute('**/v1/conversations/**/messages');
    await requesterSession.page.getByRole('button', { name: 'Send' }).click();
    await expect(
      requesterSession.page.getByText(HARMLESS_MESSAGE),
    ).toBeVisible();

    await requesterSession.page.goto(`${E2E_WEB_ORIGIN}/founders/${helper.id}`);
    await requesterSession.page
      .getByRole('button', { name: 'Block founder' })
      .click();
    await requesterSession.page
      .getByRole('dialog')
      .getByRole('button', { name: 'Block founder' })
      .click();
    await requesterSession.context.close();

    const blockedHelper = await openAs(
      browser,
      helper,
      `/requests/${request.id}`,
    );
    await expect(
      blockedHelper.page.getByRole('button', { name: 'I can help' }),
    ).toHaveCount(0);
    await blockedHelper.context.close();
  });
});
