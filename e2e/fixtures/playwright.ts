import { test as base, expect } from '@playwright/test';

import { clearE2eRateLimitKeys } from '../helpers/redis.js';

export const test = base.extend<{
  _clearE2eRateLimits: void;
}>({
  _clearE2eRateLimits: [
    // Playwright requires object destructuring even when no fixtures are read.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await clearE2eRateLimitKeys();
      await use();
    },
    { auto: true },
  ],
});

export { expect };
