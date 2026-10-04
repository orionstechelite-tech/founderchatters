import { expect, type Page } from '@playwright/test';

export async function fillAuthForm(
  page: Page,
  email: string,
  password: string,
  emailLabel: string,
): Promise<void> {
  await page.getByLabel(emailLabel).fill(email);
  await page.getByLabel('Password').fill(password);
}

export async function completeApplicationForm(page: Page): Promise<void> {
  await expect(
    page.getByText('Founder / Co-founder', { exact: true }),
  ).toBeVisible();
  await page.getByText('Founder / Co-founder', { exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Company / startup').fill('Nexora Labs');
  await page.getByLabel('Role').fill('Founder');
  await page.getByLabel('Website').fill('https://nexora.example');
  await page.getByLabel('City').fill('Bengaluru');
  await page.getByLabel('Country').fill('India');
  await page
    .getByLabel('What are you building?')
    .fill(
      'A fictional founder-to-founder workflow tool currently in private alpha.',
    );
  await page.getByRole('button', { name: 'Review application' }).click();
}

export async function completeOnboarding(
  page: Page,
  displayName: string,
): Promise<void> {
  await page.getByLabel('Display name').fill(displayName);
  await page.getByLabel('Company').fill(`${displayName} Co`);
  await page.getByLabel('Industry').fill('Software');
  await page.getByLabel('Stage').fill('Seed');
  await page.getByLabel('City').fill('Bengaluru');
  await page.getByLabel('Country').fill('India');
  await page
    .getByLabel('One-line description')
    .fill('A fictional founder support product for E2E coverage.');
  await page.getByRole('button', { name: 'Continue' }).click();

  const firstTopic = page
    .locator('.fc-onboarding-main button, .fc-chip, [class*="chip"]')
    .first();
  if (await firstTopic.count()) {
    await firstTopic.click();
  } else {
    await page.getByRole('button').nth(0).click();
  }
  await page.getByRole('button', { name: 'Continue' }).click();

  await page
    .getByLabel('Current need')
    .fill(
      'Need marketplace go-to-market advice from operators who have launched.',
    );
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Enter FounderChatters' }).click();
}

export async function publishAsk(
  page: Page,
  headline: string,
  context: string,
): Promise<void> {
  const previewHeading = page.getByRole('heading', {
    name: 'Preview before publishing.',
  });
  if (await previewHeading.isVisible()) {
    if (await page.getByText(headline).isVisible()) {
      await page.getByRole('button', { name: 'Publish request' }).click();
      return;
    }
    await page.getByRole('button', { name: 'Edit request' }).click();
  }
  await expect(
    page.getByRole('heading', {
      name: 'Ask for the kind of help another founder can actually give.',
    }),
  ).toBeVisible();
  await page.getByLabel('Headline').fill(headline);
  await page.getByLabel('Context').fill(context);
  await page
    .getByLabel('Who could help?')
    .fill('Operators who launched a marketplace.');
  const topic = page.getByRole('button', { name: 'Product' });
  if (await topic.count()) {
    await topic.click();
  }
  const urgency = page
    .getByRole('button', { name: /soon|this week|urgent/i })
    .first();
  if (await urgency.count()) {
    await urgency.click();
  }
  await page.getByRole('button', { name: 'Preview request' }).click();
  await expect(
    page.getByRole('heading', { name: 'Preview before publishing.' }),
  ).toBeVisible();
  await expect(page.getByText(headline)).toBeVisible();
  await page.getByRole('button', { name: 'Publish request' }).click();
}
